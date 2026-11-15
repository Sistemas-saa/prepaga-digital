-- Nómina de un contrato de EMPRESA: empleados con plan propio y adherentes a cargo.
--
-- POR QUÉ
-- Hasta ahora un contrato con titular empresa cargaba a los empleados como
-- adherentes PLANOS de la venta: sin plan propio (`beneficiaries` no tenía
-- `plan_id`), sin adherentes propios (no había jerarquía) y con un único plan a
-- nivel `sales.plan_id`. Eso no alcanza para una venta corporativa, donde cada
-- empleado contrata su plan y suma su propio grupo familiar, con costos
-- independientes.
--
-- QUÉ AGREGA
--   beneficiaries.member_role            'empleado' | 'adherente'
--   beneficiaries.parent_beneficiary_id  el empleado del que depende un adherente
--   beneficiaries.plan_id                el plan de ESA persona
--
-- Los tres defaults ('adherente', NULL, NULL) reproducen exactamente el
-- comportamiento actual, así que una venta a persona física no cambia en nada y
-- ninguna consulta existente se ve afectada.
--
-- POR QUÉ UNA FK COMPUESTA Y NO UN TRIGGER
-- La regla "el empleado del que cuelga un adherente pertenece a la MISMA venta"
-- se expresa de forma declarativa con
--   FOREIGN KEY (parent_beneficiary_id, sale_id) REFERENCES beneficiaries (id, sale_id)
-- Eso obliga a un UNIQUE (id, sale_id) redundante con la PK — costo despreciable —
-- pero evita un trigger, y de paso el ON DELETE CASCADE hace que borrar a un
-- empleado se lleve a sus adherentes sin código de aplicación.
--
-- La ÚNICA regla que no entra ni en CHECK ni en FK (es entre filas) es "el padre
-- tiene que ser un empleado", y para eso sí hace falta el trigger de abajo.
--
-- NO SE TOCA `beneficiaries_status_check`: además de 'active' e 'inactive' admite
-- 'pending_addendum_signature', que usa el flujo legado `sale_addendums`.

-- ---------------------------------------------------------------------
-- 0. PREFLIGHT
-- ---------------------------------------------------------------------
DO $preflight$
DECLARE
  v_dup integer;
BEGIN
  -- El UNIQUE (id, sale_id) no puede fallar (id es PK), pero si alguna vez se
  -- corriera sobre una tabla particionada o con la PK cambiada, mejor abortar
  -- acá que a mitad del ALTER.
  SELECT count(*) INTO v_dup
  FROM (SELECT id FROM public.beneficiaries GROUP BY id HAVING count(*) > 1) t;

  IF v_dup > 0 THEN
    RAISE EXCEPTION 'beneficiaries.id no es único (% duplicados). Revisar antes de seguir.', v_dup;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS member_role           text NOT NULL DEFAULT 'adherente',
  ADD COLUMN IF NOT EXISTS parent_beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id               uuid;

COMMENT ON COLUMN public.beneficiaries.member_role IS
  'empleado = titular de su propio plan dentro de un contrato de empresa; adherente = persona a cargo. Default adherente: es como se comportaron siempre las ventas a persona fisica.';
COMMENT ON COLUMN public.beneficiaries.parent_beneficiary_id IS
  'Empleado del que depende este adherente, en la MISMA venta. NULL en ventas a persona fisica.';
COMMENT ON COLUMN public.beneficiaries.plan_id IS
  'Plan contratado por ESTA persona. NULL en ventas a persona fisica, donde el plan es unico y vive en sales.plan_id.';

-- ---------------------------------------------------------------------
-- 2. Constraints declarativas
-- ---------------------------------------------------------------------
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_member_role;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_member_role
  CHECK (member_role IN ('empleado', 'adherente'));

-- Un empleado es raíz: nunca cuelga de nadie. Impide ciclos de dos pasos y deja
-- la jerarquía en exactamente dos niveles.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_empleado_sin_padre;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_empleado_sin_padre
  CHECK (member_role <> 'empleado' OR parent_beneficiary_id IS NULL);

ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_no_self_parent;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_no_self_parent
  CHECK (parent_beneficiary_id IS DISTINCT FROM id);

-- Requisito de Postgres para poder referenciar el par (id, sale_id).
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS uq_beneficiaries_id_sale;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT uq_beneficiaries_id_sale UNIQUE (id, sale_id);

-- "El padre está en la misma venta", declarativo. ON DELETE CASCADE: borrar al
-- empleado se lleva a sus adherentes.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS fk_beneficiaries_parent;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT fk_beneficiaries_parent
  FOREIGN KEY (parent_beneficiary_id, sale_id)
  REFERENCES public.beneficiaries (id, sale_id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ON DELETE SET NULL: si se retira un plan del catálogo, la persona no se borra;
-- queda sin plan y se ve en la pantalla.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS fk_beneficiaries_plan;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT fk_beneficiaries_plan
  FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_parent
  ON public.beneficiaries (parent_beneficiary_id)
  WHERE parent_beneficiary_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_sale_role_status
  ON public.beneficiaries (sale_id, member_role, status);

-- ---------------------------------------------------------------------
-- 3. La regla que no es declarativa: el padre tiene que ser un EMPLEADO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beneficiaries_validate_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rol_padre text;
BEGIN
  IF NEW.parent_beneficiary_id IS NOT NULL THEN
    SELECT member_role INTO v_rol_padre
    FROM public.beneficiaries
    WHERE id = NEW.parent_beneficiary_id;

    IF v_rol_padre IS DISTINCT FROM 'empleado' THEN
      RAISE EXCEPTION
        'Un adherente solo puede depender de un EMPLEADO, y ese beneficiario no lo es.'
        USING ERRCODE = '23514',
              HINT = 'La nomina tiene exactamente dos niveles: empleado -> adherentes. No se admite anidar un adherente debajo de otro.';
    END IF;
  END IF;

  -- Degradar a un empleado que tiene gente a cargo dejaría a sus adherentes
  -- colgando de alguien que ya no es empleado, violando la regla de arriba sin
  -- que ningún INSERT la dispare.
  IF TG_OP = 'UPDATE'
     AND OLD.member_role = 'empleado'
     AND NEW.member_role <> 'empleado'
     AND EXISTS (SELECT 1 FROM public.beneficiaries
                  WHERE parent_beneficiary_id = NEW.id) THEN
    RAISE EXCEPTION
      'El empleado tiene adherentes a cargo: no puede dejar de ser empleado.'
      USING ERRCODE = '23514',
            HINT = 'Reasigne o elimine primero a sus adherentes.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Por orden alfabético este trigger corre DESPUÉS de
-- trg_beneficiaries_block_when_sale_signed, que es lo correcto: primero se
-- rechaza tocar un contrato firmado, después se valida la forma de la nómina.
DROP TRIGGER IF EXISTS trg_beneficiaries_validate_nomina ON public.beneficiaries;
CREATE TRIGGER trg_beneficiaries_validate_nomina
  BEFORE INSERT OR UPDATE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.beneficiaries_validate_nomina();

-- PostgREST cachea el esquema: sin esto los embeds de plan_id y del padre
-- siguen fallando hasta el próximo reinicio del servicio.
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 5 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'las 3 columnas nuevas existen' AS chequeo,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='beneficiaries'
                     AND column_name IN ('member_role','parent_beneficiary_id','plan_id')) = 3
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'la FK compuesta al empleado existe',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname='fk_beneficiaries_parent'
                            AND conrelid='public.beneficiaries'::regclass)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'el trigger de forma de la nomina existe',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname='trg_beneficiaries_validate_nomina'
                            AND tgrelid='public.beneficiaries'::regclass
                            AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'ningun empleado cuelga de nadie',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.beneficiaries
                              WHERE member_role='empleado' AND parent_beneficiary_id IS NOT NULL)
       THEN 'OK' ELSE 'HAY FILAS INCONSISTENTES' END
UNION ALL
SELECT 'ningun adherente cuelga de un no-empleado',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.beneficiaries b
                              JOIN public.beneficiaries p ON p.id = b.parent_beneficiary_id
                             WHERE p.member_role <> 'empleado')
       THEN 'OK' ELSE 'HAY FILAS INCONSISTENTES' END;
