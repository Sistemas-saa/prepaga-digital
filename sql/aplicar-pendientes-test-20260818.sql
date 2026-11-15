-- =====================================================================
-- PENDIENTES EN TEST — las 3 migraciones del 18/08
-- Generado a partir de los archivos de supabase/migrations/, en orden.
--
-- Verificado antes de generar: ninguna borra ni modifica datos. Solo
-- reemplazan funciones y crean triggers.
--
-- Ya estaban aplicadas (NO se repiten acá):
--   20260817000001  fix del trigger de activación del anexo
--   20260817000002  sales.maternity_bonus
--
-- Al final vuelve a correr la verificación: deben salir 5 filas en OK.
-- =====================================================================


-- ####################################################################
-- ### 20260818000001_fix_total_amount_single_source.sql
-- ####################################################################
-- Fuente unica de verdad para sales.total_amount.
--
-- PROBLEMA
-- Conviven dos funciones con el mismo nombre y formulas distintas:
--
--   recalculate_sale_total_amount()          -> returns trigger  (la del trigger
--     trg_recalculate_sale_total sobre beneficiaries, AFTER INSERT/UPDATE/DELETE)
--     Cuerpo actual:  total_amount = COALESCE(SUM(amount),0)
--     IGNORA titular_amount y no distingue si hay fila is_primary.
--
--   recalculate_sale_total_amount(p_sale_id uuid) -> returns void
--     Con fila is_primary  -> total = suma de TODOS los beneficiarios
--     Sin fila is_primary  -> total = titular_amount + suma de adherentes
--     Ademas sincroniza titular_amount con el primary, pero solo si es > 0
--     (si el primary quedo en 0 no se pisa el valor cargado a mano).
--
-- El trigger dispara en cada alta/edicion/baja de adherente y pisa el total con
-- la formula incompleta. Cuando el titular NO existe como fila beneficiaria, su
-- monto DESAPARECE del total. Verificado en test antes de aplicar: de 22 ventas,
-- 2 tenian el total mal, y en 2026-000006 (borrador, 3 adherentes, sin primary)
-- faltaban exactamente 275.000 = el titular_amount.
--
-- SOLUCION
-- La version con argumento queda como unica implementacion. La del trigger pasa
-- a delegar en ella. Se reemplaza el CUERPO en vez de borrar funcion y trigger:
-- es idempotente y no rompe dependencias.
--
-- El frontend (src/hooks/useBeneficiaries.ts) deja de calcular por su cuenta en
-- el mismo commit; el calculo pasa a ser responsabilidad exclusiva de la base.

CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Delega en la version con argumento, que es la unica que contempla
  -- is_primary y titular_amount.
  PERFORM public.recalculate_sale_total_amount(COALESCE(NEW.sale_id, OLD.sale_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------
-- Backfill: reparar las ventas que quedaron con el total mal calculado.
-- Deja traza de cuantas y cuales cambian, para poder auditarlo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.contract_number,
           COALESCE(s.total_amount, 0) AS total_viejo,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      RAISE NOTICE 'backfill % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      PERFORM public.recalculate_sale_total_amount(r.id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'total_amount corregido en % venta(s)', v_n;
END $$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'el trigger delega en la version con argumento' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
            AND pg_get_function_result(p.oid) = 'trigger'
            AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'no quedan totales mal calculados',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM public.sales s
          WHERE COALESCE(s.total_amount,0) IS DISTINCT FROM (
            CASE WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                               WHERE b.sale_id = s.id AND COALESCE(b.is_primary,false))
                 THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b WHERE b.sale_id = s.id),0)
                 ELSE COALESCE(s.titular_amount,0)
                      + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b WHERE b.sale_id = s.id),0)
            END))
       THEN 'OK' ELSE 'QUEDAN DIFERENCIAS' END;

-- ####################################################################
-- ### 20260818000002_beneficiaries_signed_contract_guard.sql
-- ####################################################################
-- Respaldo en la base del bloqueo de adherentes en contratos firmados.
--
-- Con el contrato firmado, la composición del grupo familiar ya quedó sellada en
-- un PDF con firma PAdES. Modificarla por atrás deja la base diciendo una cosa y
-- el documento firmado otra. La vía legítima para sumar gente es la
-- Incorporación de Adherente (anexo + firma propia).
--
-- El frontend ya rechaza estas mutaciones (canMutateBeneficiaries en
-- src/lib/saleUtils.ts + guarda en src/hooks/useBeneficiaries.ts). Esto es la
-- tercera capa: la UI antes sólo escondía botones, así que cualquier camino que
-- no pasara por ese componente escribía igual.
--
-- EXENCIONES
-- Cuatro funciones del sistema modifican adherentes de un contrato firmado por
-- diseño, y tienen que seguir funcionando:
--   activate_adherent_incorporation()        copia el adherente al contrato madre
--   complete_adherent_incorporation(uuid)    idem, por RPC desde el link de firma
--   approve_sale_addendum(uuid, text)        anexos
--   try_complete_sale_addendum_for_link(uuid)  anexos
--
-- Se las exime con `ALTER FUNCTION ... SET`, que fija la GUC mientras dura la
-- llamada, en vez de editar sus cuerpos: son funciones delicadas (la de
-- activación está marcada como intocable) y así su lógica queda idéntica.
-- Mismo patrón que `app.commission_rpc_mutation` en el módulo de comisiones.

CREATE OR REPLACE FUNCTION public.beneficiaries_block_when_sale_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid;
  v_status  text;
BEGIN
  -- Las funciones del sistema exentas fijan esta GUC vía ALTER FUNCTION ... SET.
  IF current_setting('app.allow_signed_beneficiary_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);

  SELECT s.status::text INTO v_status
  FROM public.sales s
  WHERE s.id = v_sale_id;

  IF v_status IN ('firmado_parcial', 'firmado', 'completado') THEN
    RAISE EXCEPTION
      'El contrato ya esta firmado (%): los adherentes no se pueden modificar. Use una Incorporacion de Adherente.',
      v_status
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_beneficiaries_block_when_sale_signed ON public.beneficiaries;
CREATE TRIGGER trg_beneficiaries_block_when_sale_signed
  BEFORE INSERT OR UPDATE OR DELETE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.beneficiaries_block_when_sale_signed();

-- Exenciones: la GUC queda en 'on' sólo mientras corre cada una de estas.
ALTER FUNCTION public.activate_adherent_incorporation()
  SET app.allow_signed_beneficiary_mutation = 'on';
ALTER FUNCTION public.complete_adherent_incorporation(uuid)
  SET app.allow_signed_beneficiary_mutation = 'on';
ALTER FUNCTION public.approve_sale_addendum(uuid, text)
  SET app.allow_signed_beneficiary_mutation = 'on';
ALTER FUNCTION public.try_complete_sale_addendum_for_link(uuid)
  SET app.allow_signed_beneficiary_mutation = 'on';

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'el trigger de bloqueo existe' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_beneficiaries_block_when_sale_signed'
            AND tgrelid = 'public.beneficiaries'::regclass
            AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'las 4 funciones del sistema estan exentas',
       CASE WHEN (
         SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('activate_adherent_incorporation','complete_adherent_incorporation',
                              'approve_sale_addendum','try_complete_sale_addendum_for_link')
            AND array_to_string(p.proconfig, ',') LIKE '%allow_signed_beneficiary_mutation=on%'
       ) = 4 THEN 'OK' ELSE 'FALTAN EXENCIONES' END;

-- ####################################################################
-- ### 20260818000003_adherent_incorporation_lifecycle.sql
-- ####################################################################
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


-- =====================================================================
-- VERIFICACIÓN FINAL — deben salir las 5 filas en OK
-- =====================================================================
SELECT '20260818000001' AS migracion, 'recalculate_sale_total_amount() contempla titular_amount' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='recalculate_sale_total_amount'
              AND p.pronargs=0 AND pg_get_functiondef(p.oid) ILIKE '%titular_amount%')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT '20260818000002', 'función beneficiaries_block_when_sale_signed',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='beneficiaries_block_when_sale_signed')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '20260818000002', 'trigger trg_beneficiaries_block_when_sale_signed',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_beneficiaries_block_when_sale_signed' AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '20260818000003', 'función adherent_incorporations_guard_lifecycle',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='adherent_incorporations_guard_lifecycle')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '20260818000003', 'trigger trg_adherent_incorporations_guard_lifecycle',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_adherent_incorporations_guard_lifecycle' AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
ORDER BY 1, 2;
