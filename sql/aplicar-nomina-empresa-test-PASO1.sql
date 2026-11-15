-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — Venta a EMPRESA: nomina de empleados
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
--
-- ⚠️ NO CORRER ESTO CONTRA PRODUCCION (ejiycfqxgtrzaysgpzmx).
--    El modulo de anexos ni siquiera existe alla; ver CLAUDE.md, "Estado por
--    entorno". Llevarlo a BR es un trabajo aparte, con su propio runbook.
--
-- ----------------------------------------------------------------------------
-- POR QUE
-- ----------------------------------------------------------------------------
--   Un contrato con titular EMPRESA cargaba a los empleados como adherentes
--   planos: sin plan propio, sin adherentes propios y con un unico plan a nivel
--   `sales.plan_id`. Eso no alcanza para una venta corporativa, donde cada
--   empleado contrata su plan y suma su propio grupo familiar, con costos
--   independientes. Y no existia ninguna forma de dar de baja a nadie.
--
-- ----------------------------------------------------------------------------
-- QUE HACE  (5 bloques, en este orden)
-- ----------------------------------------------------------------------------
--   1. beneficiaries += member_role / parent_beneficiary_id / plan_id, con sus
--      constraints y el trigger que valida la forma de la nomina.
--   2. clients += contacto de RR.HH. (nombre / telefono / email).
--   3. adherent_incorporations += movimiento de nomina (alta | baja) y sus
--      campos; el guard de ciclo de vida pasa a congelarlos tambien.
--   4. recalculate_sale_total_amount(uuid) deja de sumar a los inactivos.
--   5. activate_adherent_incorporation() gana la rama de BAJA y — critico — el
--      loop de alta pasa a excluir las bajas.
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO
-- ----------------------------------------------------------------------------
--   · Los defaults de las columnas nuevas ('adherente', NULL, NULL, 'alta')
--     reproducen exactamente el comportamiento actual: una venta a persona
--     fisica y las 3 incorporaciones existentes no cambian en nada.
--   · El filtro por `status` del bloque 4 es diff CERO hoy: las 39 filas de
--     `beneficiaries` estan en 'active'. El bloque incluye un control que
--     ABORTA la transaccion si el filtro cambiara algun total CALCULADO.
--     Ese control compara la formula vieja contra la nueva, NO contra
--     `sales.total_amount`: hay ventas (las de CAMBIO DE PLAN) cuyo total
--     guardado legitimamente no sale de esa formula.
--   · No se borra ni se modifica ningun dato existente. La unica sentencia que
--     escribe datos es la normalizacion defensiva de `status` (0 filas
--     esperadas).
--   · NO se toca `beneficiaries_status_check` (admite tambien
--     'pending_addendum_signature', del flujo legado sale_addendums).
--   · NO se toca el regex de exencion de trg_beneficiaries_block_when_sale_signed
--     ni ninguna de las 4 funciones que exime.
--
-- ----------------------------------------------------------------------------
-- COMO SE APLICA  (PASO 1 de 2)
-- ----------------------------------------------------------------------------
--   Pegar entero en el SQL Editor del proyecto US test y ejecutar. Si algo no
--   cierra, el preflight o el control abortan y NO queda nada aplicado.
--   Despues, correr el bloque de VERIFICACION del final (esta separado del
--   COMMIT a proposito: el editor muestra solo el ultimo resultado).
--
--   Luego correr sql/aplicar-nomina-empresa-test-PASO2.sql, que siembra las dos
--   plantillas nuevas (contrato de empresa y anexo de movimiento). Sin ese paso
--   no hay nada que adjuntar a la venta y el flujo queda inutilizable.
--
--   Y por ultimo regenerar src/integrations/supabase/types.ts. En PowerShell
--   usar `| Out-File -Encoding utf8`: el `>` de PS 5.1 escribe UTF-16LE y rompe
--   el archivo.
--
-- ----------------------------------------------------------------------------
-- REVERSION
-- ----------------------------------------------------------------------------
--   DROP TRIGGER IF EXISTS trg_beneficiaries_validate_nomina ON public.beneficiaries;
--   DROP FUNCTION IF EXISTS public.beneficiaries_validate_nomina();
--   ALTER TABLE public.beneficiaries
--     DROP CONSTRAINT IF EXISTS fk_beneficiaries_parent,
--     DROP CONSTRAINT IF EXISTS fk_beneficiaries_plan,
--     DROP CONSTRAINT IF EXISTS uq_beneficiaries_id_sale,
--     DROP CONSTRAINT IF EXISTS chk_beneficiaries_member_role,
--     DROP CONSTRAINT IF EXISTS chk_beneficiaries_empleado_sin_padre,
--     DROP CONSTRAINT IF EXISTS chk_beneficiaries_no_self_parent,
--     DROP COLUMN IF EXISTS member_role,
--     DROP COLUMN IF EXISTS parent_beneficiary_id,
--     DROP COLUMN IF EXISTS plan_id;
--   -- y volver a aplicar 20260813000003 / 20260817000001 / 20260818000001 /
--   -- 20260818000003 para restaurar las dos funciones y el guard anteriores.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PREFLIGHT
-- ============================================================================
DO $preflight$
DECLARE
  v_dup integer;
  v_falta text;
BEGIN
  -- Este script asume el esquema de la Entrega A ya aplicado.
  SELECT string_agg(t, ', ') INTO v_falta
  FROM unnest(ARRAY['public.beneficiaries','public.adherent_incorporations',
                    'public.clients','public.plans','public.sales']) AS t
  WHERE to_regclass(t) IS NULL;

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas tablas: %. Este script es para US test con la Entrega A aplicada.', v_falta;
  END IF;

  IF to_regprocedure('public.activate_adherent_incorporation()') IS NULL THEN
    RAISE EXCEPTION
      'No existe activate_adherent_incorporation(). Aplicar antes 20260813000003 y 20260817000001.';
  END IF;

  IF to_regprocedure('public.recalculate_sale_total_amount(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'No existe recalculate_sale_total_amount(uuid). Aplicar antes 20260813000003 y 20260818000001.';
  END IF;

  SELECT count(*) INTO v_dup
  FROM (SELECT id FROM public.beneficiaries GROUP BY id HAVING count(*) > 1) t;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'beneficiaries.id no es unico (% duplicados).', v_dup;
  END IF;
END
$preflight$;


-- ============================================================================
-- 1. beneficiaries: jerarquia empleado -> adherentes, y plan por persona
-- ============================================================================
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS member_role           text NOT NULL DEFAULT 'adherente',
  ADD COLUMN IF NOT EXISTS parent_beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id               uuid;

COMMENT ON COLUMN public.beneficiaries.member_role IS
  'empleado = titular de su propio plan dentro de un contrato de empresa; adherente = persona a cargo.';
COMMENT ON COLUMN public.beneficiaries.parent_beneficiary_id IS
  'Empleado del que depende este adherente, en la MISMA venta. NULL en ventas a persona fisica.';
COMMENT ON COLUMN public.beneficiaries.plan_id IS
  'Plan contratado por ESTA persona. NULL en ventas a persona fisica (el plan vive en sales.plan_id).';

ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS chk_beneficiaries_member_role;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT chk_beneficiaries_member_role
  CHECK (member_role IN ('empleado', 'adherente'));

ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS chk_beneficiaries_empleado_sin_padre;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT chk_beneficiaries_empleado_sin_padre
  CHECK (member_role <> 'empleado' OR parent_beneficiary_id IS NULL);

ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS chk_beneficiaries_no_self_parent;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT chk_beneficiaries_no_self_parent
  CHECK (parent_beneficiary_id IS DISTINCT FROM id);

-- Requisito de Postgres para poder referenciar el par (id, sale_id).
ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS uq_beneficiaries_id_sale;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT uq_beneficiaries_id_sale UNIQUE (id, sale_id);

-- "El padre esta en la misma venta", declarativo. ON DELETE CASCADE: borrar al
-- empleado se lleva a sus adherentes.
ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS fk_beneficiaries_parent;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT fk_beneficiaries_parent
  FOREIGN KEY (parent_beneficiary_id, sale_id)
  REFERENCES public.beneficiaries (id, sale_id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.beneficiaries DROP CONSTRAINT IF EXISTS fk_beneficiaries_plan;
ALTER TABLE public.beneficiaries ADD  CONSTRAINT fk_beneficiaries_plan
  FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_parent
  ON public.beneficiaries (parent_beneficiary_id) WHERE parent_beneficiary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_sale_role_status
  ON public.beneficiaries (sale_id, member_role, status);

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
    FROM public.beneficiaries WHERE id = NEW.parent_beneficiary_id;

    IF v_rol_padre IS DISTINCT FROM 'empleado' THEN
      RAISE EXCEPTION
        'Un adherente solo puede depender de un EMPLEADO, y ese beneficiario no lo es.'
        USING ERRCODE = '23514',
              HINT = 'La nomina tiene exactamente dos niveles: empleado -> adherentes. No se admite anidar un adherente debajo de otro.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.member_role = 'empleado'
     AND NEW.member_role <> 'empleado'
     AND EXISTS (SELECT 1 FROM public.beneficiaries WHERE parent_beneficiary_id = NEW.id) THEN
    RAISE EXCEPTION
      'El empleado tiene adherentes a cargo: no puede dejar de ser empleado.'
      USING ERRCODE = '23514',
            HINT = 'Reasigne o elimine primero a sus adherentes.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_beneficiaries_validate_nomina ON public.beneficiaries;
CREATE TRIGGER trg_beneficiaries_validate_nomina
  BEFORE INSERT OR UPDATE ON public.beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.beneficiaries_validate_nomina();


-- ============================================================================
-- 2. clients: contacto de RR.HH. del cliente empresa
-- ============================================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS hr_contact_name  text,
  ADD COLUMN IF NOT EXISTS hr_contact_phone text,
  ADD COLUMN IF NOT EXISTS hr_contact_email text;

COMMENT ON COLUMN public.clients.hr_contact_name IS
  'Contacto de RR.HH. de un cliente empresa: con quien se gestionan altas y bajas de nomina.';


-- ============================================================================
-- 3. adherent_incorporations: movimiento de nomina (alta | baja)
-- ============================================================================
ALTER TABLE public.adherent_incorporations
  ADD COLUMN IF NOT EXISTS movement_type                text NOT NULL DEFAULT 'alta',
  ADD COLUMN IF NOT EXISTS member_role                  text NOT NULL DEFAULT 'adherente',
  ADD COLUMN IF NOT EXISTS adherent_plan_id             uuid,
  ADD COLUMN IF NOT EXISTS parent_target_beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS target_beneficiary_id        uuid,
  ADD COLUMN IF NOT EXISTS termination_date             date,
  ADD COLUMN IF NOT EXISTS termination_reason           text,
  ADD COLUMN IF NOT EXISTS cascade_dependents           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_beneficiary_ids  uuid[];

COMMENT ON COLUMN public.adherent_incorporations.movement_type IS
  'alta = suma una persona al contrato madre (historico). baja = la desvincula. Mismo anexo, misma serie ANX.';
COMMENT ON COLUMN public.adherent_incorporations.target_beneficiary_id IS
  'BAJA: beneficiario del CONTRATO MADRE que se desvincula. Obligatorio cuando movement_type = baja.';
COMMENT ON COLUMN public.adherent_incorporations.deactivated_beneficiary_ids IS
  'BAJA: ids que la activacion realmente paso a inactive. Traza de auditoria.';

ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS chk_ai_movement_type;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT chk_ai_movement_type
  CHECK (movement_type IN ('alta', 'baja'));

ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS chk_ai_member_role;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT chk_ai_member_role
  CHECK (member_role IN ('empleado', 'adherente'));

ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS chk_ai_baja_target;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT chk_ai_baja_target
  CHECK (movement_type <> 'baja' OR target_beneficiary_id IS NOT NULL);

-- ON DELETE SET NULL, NO cascade: el anexo de baja es registro historico.
ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS fk_ai_target_beneficiary;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT fk_ai_target_beneficiary
  FOREIGN KEY (target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS fk_ai_parent_target_beneficiary;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT fk_ai_parent_target_beneficiary
  FOREIGN KEY (parent_target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations DROP CONSTRAINT IF EXISTS fk_ai_adherent_plan;
ALTER TABLE public.adherent_incorporations ADD  CONSTRAINT fk_ai_adherent_plan
  FOREIGN KEY (adherent_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_target_beneficiary
  ON public.adherent_incorporations (target_beneficiary_id) WHERE target_beneficiary_id IS NOT NULL;

-- El guard de ciclo de vida congela tambien los campos del movimiento: sin esto
-- un anexo de baja YA FIRMADO se podria re-apuntar a otra persona.
CREATE OR REPLACE FUNCTION public.adherent_incorporations_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' AND (
       NEW.adherent_first_name      IS DISTINCT FROM OLD.adherent_first_name
    OR NEW.adherent_last_name       IS DISTINCT FROM OLD.adherent_last_name
    OR NEW.adherent_document_number IS DISTINCT FROM OLD.adherent_document_number
    OR NEW.adherent_birth_date      IS DISTINCT FROM OLD.adherent_birth_date
    OR NEW.adherent_relationship    IS DISTINCT FROM OLD.adherent_relationship
    OR NEW.adherent_email           IS DISTINCT FROM OLD.adherent_email
    OR NEW.adherent_phone           IS DISTINCT FROM OLD.adherent_phone
    OR NEW.adherent_amount          IS DISTINCT FROM OLD.adherent_amount
    OR NEW.coverage_start_date      IS DISTINCT FROM OLD.coverage_start_date
    OR NEW.movement_type                IS DISTINCT FROM OLD.movement_type
    OR NEW.member_role                  IS DISTINCT FROM OLD.member_role
    OR NEW.adherent_plan_id             IS DISTINCT FROM OLD.adherent_plan_id
    OR NEW.parent_target_beneficiary_id IS DISTINCT FROM OLD.parent_target_beneficiary_id
    OR NEW.target_beneficiary_id        IS DISTINCT FROM OLD.target_beneficiary_id
    OR NEW.termination_date             IS DISTINCT FROM OLD.termination_date
    OR NEW.cascade_dependents           IS DISTINCT FROM OLD.cascade_dependents
  ) THEN
    RAISE EXCEPTION
      'El movimiento esta en estado "%": sus datos ya no se pueden editar. Cancelelo y cree uno nuevo.',
      OLD.status USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'El movimiento ya esta en estado final "%" y no se puede reabrir.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_adherent_incorporations_guard_lifecycle ON public.adherent_incorporations;
CREATE TRIGGER trg_adherent_incorporations_guard_lifecycle
  BEFORE UPDATE ON public.adherent_incorporations
  FOR EACH ROW EXECUTE FUNCTION public.adherent_incorporations_guard_lifecycle();


-- ============================================================================
-- 4. El total de la venta deja de contar a los dados de baja
-- ============================================================================
UPDATE public.beneficiaries SET status = 'active'
 WHERE status IS NULL OR btrim(status) = '';

CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_primary boolean;
  v_sum numeric;
  v_primary numeric;
  v_titular numeric;
BEGIN
  -- Solo la nomina ACTIVA. Un beneficiario 'inactive' fue dado de baja por un
  -- anexo firmado: su fila se conserva como historia, pero no factura.
  SELECT COALESCE(bool_or(COALESCE(is_primary, false)), false),
         COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_has_primary, v_sum
  FROM public.beneficiaries
  WHERE sale_id = p_sale_id
    AND COALESCE(status, 'active') = 'active';

  IF v_has_primary THEN
    SELECT COALESCE(amount, 0) INTO v_primary
    FROM public.beneficiaries
    WHERE sale_id = p_sale_id
      AND COALESCE(is_primary, false)
      AND COALESCE(status, 'active') = 'active'
    LIMIT 1;

    IF v_primary > 0 THEN
      UPDATE public.sales SET total_amount = v_sum, titular_amount = v_primary WHERE id = p_sale_id;
    ELSE
      UPDATE public.sales SET total_amount = v_sum WHERE id = p_sale_id;
    END IF;
  ELSE
    SELECT COALESCE(titular_amount, 0) INTO v_titular FROM public.sales WHERE id = p_sale_id;
    UPDATE public.sales SET total_amount = v_titular + v_sum WHERE id = p_sale_id;
  END IF;
END;
$function$;


-- OJO CON QUE SE COMPARA: las DOS FORMULAS entre si (la de antes, sin filtro,
-- contra la nueva, con filtro) y NO cada una contra `sales.total_amount`.
--
-- La diferencia importa. Hay ventas cuyo total guardado legitimamente NO sale
-- de esta formula: las venta-operacion de CAMBIO DE PLAN (`CMB-*`) no tienen
-- ninguna fila en `beneficiaries` y llevan su importe directo en
-- `total_amount`, puesto por `useCreatePlanChange`. Compararlas contra la
-- formula las marca como diferencia y aborta una migracion que en realidad no
-- las toca. (Paso en US test con CMB-2026-000001 y CMB-2026-000002.)
--
-- De paso, eso deja a la vista que `recalculate_sale_total_amount` pondria en
-- CERO el total de un cambio de plan si alguna vez se la llamara sobre esa
-- venta. Hoy no pasa: el trigger dispara sobre `beneficiaries` y esas ventas no
-- tienen ninguno, y `activate_plan_change` recalcula el contrato MADRE, no la
-- operacion. Es deuda preexistente, ajena a esta migracion.
DO $control$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.contract_number,
           -- Formula ANTERIOR: suma todos los beneficiarios.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_viejo,
           -- Formula NUEVA: solo los activos.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false)
                             AND COALESCE(b.status,'active') = 'active')
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      RAISE WARNING 'el filtro cambiaria % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_n > 0 THEN
    RAISE EXCEPTION
      'El filtro por status cambiaria el total calculado de % venta(s). Significa que ya hay beneficiarios inactivos: revisar los WARNING antes de aplicar.', v_n;
  END IF;

  RAISE NOTICE 'Control OK: el filtro por status no cambia ningun total calculado.';
END
$control$;


-- ============================================================================
-- 5. Activacion: rama de BAJA + el loop de alta deja de tomar las bajas
-- ============================================================================
-- ⚠️ Se conserva el MISMO nombre y la MISMA firma: esta funcion es una de las 4
--    que trg_beneficiaries_block_when_sale_signed exime por PG_CONTEXT, y eso es
--    lo que le permite escribir en un contrato ya firmado. No se toca el regex
--    del guard ni se usa set_config.
CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
  v_parent_id uuid;
  v_plan_id uuid;
  v_member_role text;
  v_fin date;
  v_ids uuid[];
BEGIN
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- ---------------- ALTA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
      -- Sin este filtro una BAJA caeria aca y copiaria a la persona al contrato
      -- madre, en silencio y justo al reves de lo pedido.
      AND COALESCE(movement_type, 'alta') = 'alta'
  LOOP
    v_new_id := NULL;

    v_parent_id := NULL;
    IF r.parent_target_beneficiary_id IS NOT NULL THEN
      SELECT b.id INTO v_parent_id
      FROM public.beneficiaries b
      WHERE b.id = r.parent_target_beneficiary_id
        AND b.sale_id = r.parent_sale_id
        AND b.member_role = 'empleado';
    END IF;

    v_member_role := COALESCE(r.member_role, 'adherente');
    IF v_member_role = 'empleado' THEN
      v_parent_id := NULL;
    END IF;

    IF r.operation_beneficiary_id IS NOT NULL THEN
      SELECT COALESCE(r.adherent_plan_id, b.plan_id) INTO v_plan_id
      FROM public.beneficiaries b WHERE b.id = r.operation_beneficiary_id;

      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false, false,
             v_member_role, v_parent_id, v_plan_id
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false,
        v_member_role, v_parent_id, r.adherent_plan_id
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- ---------------- BAJA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND movement_type = 'baja'
      AND parent_sale_id IS NOT NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    v_fin := COALESCE(r.termination_date, r.coverage_end_date, CURRENT_DATE);

    WITH bajas AS (
      UPDATE public.beneficiaries
         SET status = 'inactive',
             coverage_end_date = v_fin,
             signature_required = false
       WHERE sale_id = r.parent_sale_id
         AND COALESCE(status, 'active') = 'active'
         AND ( id = r.target_beneficiary_id
               OR ( COALESCE(r.cascade_dependents, true)
                    AND parent_beneficiary_id = r.target_beneficiary_id ) )
      RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM bajas;

    UPDATE public.adherent_incorporations
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        activated_beneficiary_id = r.target_beneficiary_id,
        deactivated_beneficiary_ids = v_ids
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre: el alta la sube, la baja la baja.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMIT;

-- PostgREST cachea el esquema: sin esto los embeds de las columnas nuevas
-- siguen fallando hasta el proximo reinicio del servicio.
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFICACION — las 11 filas deben decir OK
-- ============================================================================
SELECT 'beneficiaries: las 3 columnas de nomina' AS chequeo,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='beneficiaries'
                     AND column_name IN ('member_role','parent_beneficiary_id','plan_id')) = 3
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'beneficiaries: FK compuesta al empleado',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_beneficiaries_parent'
                          AND conrelid='public.beneficiaries'::regclass)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'beneficiaries: trigger de forma de la nomina',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_beneficiaries_validate_nomina'
                          AND tgrelid='public.beneficiaries'::regclass AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'beneficiaries: el CHECK de status sigue admitiendo pending_addendum_signature',
       CASE WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint
                                        WHERE conname='beneficiaries_status_check'
                                          AND conrelid='public.beneficiaries'::regclass))
                 LIKE '%pending_addendum_signature%'
       THEN 'OK' ELSE 'SE ROMPIO EL FLUJO LEGADO sale_addendums' END
UNION ALL
SELECT 'clients: las 3 columnas de contacto RR.HH.',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='clients'
                     AND column_name IN ('hr_contact_name','hr_contact_phone','hr_contact_email')) = 3
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'adherent_incorporations: las 9 columnas de movimiento',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='adherent_incorporations'
                     AND column_name IN ('movement_type','member_role','adherent_plan_id',
                                         'parent_target_beneficiary_id','target_beneficiary_id',
                                         'termination_date','termination_reason',
                                         'cascade_dependents','deactivated_beneficiary_ids')) = 9
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'adherent_incorporations: las filas existentes quedaron como alta',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.adherent_incorporations WHERE movement_type <> 'alta')
       THEN 'OK' ELSE 'HAY FILAS INESPERADAS' END
UNION ALL
SELECT 'el guard de ciclo de vida congela los campos del movimiento',
       CASE WHEN pg_get_functiondef('public.adherent_incorporations_guard_lifecycle()'::regprocedure)
                 LIKE '%target_beneficiary_id%'
       THEN 'OK' ELSE 'ES LA VERSION VIEJA' END
UNION ALL
SELECT 'recalculate_sale_total_amount filtra por status',
       CASE WHEN pg_get_functiondef('public.recalculate_sale_total_amount(uuid)'::regprocedure)
                 LIKE '%COALESCE(status, ''active'') = ''active''%'
       THEN 'OK' ELSE 'ES LA VERSION VIEJA' END
UNION ALL
SELECT 'la activacion excluye las bajas del loop de alta',
       CASE WHEN pg_get_functiondef('public.activate_adherent_incorporation()'::regprocedure)
                 LIKE '%COALESCE(movement_type, ''alta'') = ''alta''%'
       THEN 'OK' ELSE 'FALTA EL FILTRO (una baja copiaria a la persona)' END
UNION ALL
SELECT 'la activacion sigue siendo PL/pgSQL (exencion por PG_CONTEXT)',
       CASE WHEN (SELECT l.lanname FROM pg_proc p
                    JOIN pg_language l ON l.oid = p.prolang
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public' AND p.proname='activate_adherent_incorporation') = 'plpgsql'
       THEN 'OK' ELSE 'QUEDARIA BLOQUEADA POR EL GUARD' END;
