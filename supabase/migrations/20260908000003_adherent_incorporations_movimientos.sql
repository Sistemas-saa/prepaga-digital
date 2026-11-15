-- Movimientos de nómina: `adherent_incorporations` pasa a cubrir ALTA y BAJA.
--
-- POR QUÉ ACÁ Y NO EN UNA TABLA NUEVA
-- El pedido fue explícito: para sumar un empleado o para darlo de baja se usa el
-- MISMO documento de anexo. Reusar esta tabla mantiene una sola serie de
-- numeración (ANX-YYYY-NNNNNN, que `generate_contract_number` asigna por
-- `sale_type='alta_adherente'`), una sola pantalla, un solo circuito de firma y
-- un solo juego de guardas de ciclo de vida. Una tabla `adherent_terminations`
-- paralela habría duplicado las cinco cosas.
--
-- QUÉ AGREGA
--   movement_type                 'alta' (default, = todo lo existente) | 'baja'
--   member_role                   qué se incorpora: 'empleado' o 'adherente'
--   adherent_plan_id              el plan de la persona que entra
--   parent_target_beneficiary_id  ALTA: de qué empleado del CONTRATO MADRE cuelga
--   target_beneficiary_id         BAJA: a quién se da de baja
--   termination_date              BAJA: fecha de fin de cobertura
--   termination_reason            BAJA: motivo, texto libre
--   cascade_dependents            BAJA: si también salen sus adherentes
--   deactivated_beneficiary_ids   BAJA: traza de a quién desactivó realmente
--
-- El default `movement_type = 'alta'` deja las incorporaciones existentes tal
-- como están, sin backfill.
--
-- QUÉ NO TOCA
-- Los NOT NULL de `adherent_first_name` / `adherent_last_name`: en una baja se
-- llenan con el snapshot del nombre de quien sale, que es justo lo que el anexo
-- tiene que imprimir.

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
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
  'alta = suma una persona al contrato madre (comportamiento historico). baja = la desvincula. Mismo anexo, misma serie ANX.';
COMMENT ON COLUMN public.adherent_incorporations.target_beneficiary_id IS
  'BAJA: beneficiario del CONTRATO MADRE que se desvincula. Obligatorio cuando movement_type = baja.';
COMMENT ON COLUMN public.adherent_incorporations.parent_target_beneficiary_id IS
  'ALTA de un adherente en un contrato de empresa: empleado del CONTRATO MADRE del que va a colgar.';
COMMENT ON COLUMN public.adherent_incorporations.deactivated_beneficiary_ids IS
  'BAJA: ids que la activacion realmente paso a inactive (el empleado y, si cascade_dependents, sus adherentes). Traza de auditoria.';

-- ---------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_movement_type;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_movement_type CHECK (movement_type IN ('alta', 'baja'));

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_member_role;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_member_role CHECK (member_role IN ('empleado', 'adherente'));

-- Una baja sin destinatario no es accionable: la activación no sabría a quién
-- desvincular y quedaría un anexo firmado sin efecto.
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_baja_target;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_baja_target
  CHECK (movement_type <> 'baja' OR target_beneficiary_id IS NOT NULL);

-- ON DELETE SET NULL, NO cascade: el anexo de baja es registro histórico y no se
-- borra porque alguien haya borrado al beneficiario.
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_target_beneficiary;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_target_beneficiary
  FOREIGN KEY (target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_parent_target_beneficiary;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_parent_target_beneficiary
  FOREIGN KEY (parent_target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_adherent_plan;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_adherent_plan
  FOREIGN KEY (adherent_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_target_beneficiary
  ON public.adherent_incorporations (target_beneficiary_id)
  WHERE target_beneficiary_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. El guard de ciclo de vida también congela los campos nuevos
-- ---------------------------------------------------------------------
-- Sin esto, un anexo de baja YA FIRMADO se podría re-apuntar a otra persona con
-- un simple UPDATE: el PDF sellado diría un nombre y la activación desvincularía
-- a otro. Es exactamente la clase de divergencia que el guard existe para evitar.
CREATE OR REPLACE FUNCTION public.adherent_incorporations_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del movimiento es inmutable después del borrador.
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
    -- Campos del movimiento de nómina (agregados en 20260908000003).
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
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
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
  FOR EACH ROW
  EXECUTE FUNCTION public.adherent_incorporations_guard_lifecycle();

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 4 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'las 9 columnas de movimiento existen' AS chequeo,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='adherent_incorporations'
                     AND column_name IN ('movement_type','member_role','adherent_plan_id',
                                         'parent_target_beneficiary_id','target_beneficiary_id',
                                         'termination_date','termination_reason',
                                         'cascade_dependents','deactivated_beneficiary_ids')) = 9
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'toda baja exige destinatario',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_ai_baja_target')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'las incorporaciones existentes quedaron como alta',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.adherent_incorporations WHERE movement_type <> 'alta')
       THEN 'OK' ELSE 'HAY FILAS INESPERADAS' END
UNION ALL
SELECT 'el guard congela los campos del movimiento',
       CASE WHEN pg_get_functiondef('public.adherent_incorporations_guard_lifecycle()'::regprocedure)
                 LIKE '%target_beneficiary_id%'
       THEN 'OK' ELSE 'ES LA VERSION VIEJA' END;
