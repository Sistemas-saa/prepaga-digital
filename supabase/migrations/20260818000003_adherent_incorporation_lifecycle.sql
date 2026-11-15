-- Ciclo de vida de una Incorporación de Adherente.
--
-- Hasta ahora el frontend no tenía ni edición ni cancelación: un error de tipeo
-- quedaba para siempre y sólo se arreglaba borrando la venta-operación a mano.
-- Se agregaron `useUpdateAdherentIncorporation` y
-- `useCancelAdherentIncorporation` en src/hooks/useAdherentIncorporations.ts.
--
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
-- `adherent_incorporations` tiene DOS policies permisivas de UPDATE, y las
-- permisivas se combinan con OR: restringir una por estado no bloquearía nada,
-- porque la otra seguiría dejando pasar la fila. Habría que tocar las dos, que
-- es justamente el cambio de semántica de RLS que el proyecto evita. Un trigger
-- se aplica una sola vez, sin importar qué policy autorizó el acceso.
--
-- QUÉ IMPIDE
--   1. Editar los datos del adherente después de `draft`. El anexo ya se generó
--      y puede estar firmado: cambiar el snapshot dejaría el documento firmado
--      diciendo una cosa y la base otra.
--   2. Reabrir una incorporación `completed` o `cancelled`.
--
-- QUÉ SIGUE PERMITIENDO
-- Todas las transiciones hacia adelante que hacen las funciones del sistema
-- (draft -> sent -> signed -> completed, y la cancelación desde draft/sent),
-- además de los campos de control (activated_beneficiary_id, completed_at,
-- updated_at), que se escriben justamente al completar.

CREATE OR REPLACE FUNCTION public.adherent_incorporations_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del adherente es inmutable después del borrador.
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
  ) THEN
    RAISE EXCEPTION
      'La incorporacion esta en estado "%": los datos del adherente ya no se pueden editar. Cancelela y cree una nueva.',
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'La incorporacion ya esta en estado final "%" y no se puede reabrir.', OLD.status
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

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — debe decir OK
-- ---------------------------------------------------------------------
SELECT 'el trigger de ciclo de vida existe' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_adherent_incorporations_guard_lifecycle'
            AND tgrelid = 'public.adherent_incorporations'::regclass
            AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END AS estado;
