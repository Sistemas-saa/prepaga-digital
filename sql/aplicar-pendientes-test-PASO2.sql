-- =====================================================================
-- PASO 2 -- 20260818000002 (bloqueo de adherentes en contratos firmados)
--
-- Es lo unico que quedaba pendiente de la entrega A en test.
-- El PASO 1 la habia dejado afuera porque su bloque de exenciones usaba
-- ALTER FUNCTION ... SET sobre una GUC placeholder, y Supabase lo rechaza
-- con 42501. La migracion se reescribio: la exencion ahora la resuelve el
-- propio trigger leyendo la pila de llamadas (PG_CONTEXT), sin tocar
-- ninguna de las 4 funciones del sistema.
--
-- Trae un PREFLIGHT que ABORTA todo si alguna de las 4 no existe o no es
-- PL/pgSQL. Nunca deja el trigger instalado sin exenciones.
--
-- Correr TODO junto. Al final salen 3 filas de verificacion (deben decir OK)
-- y el ledger de migraciones.
-- =====================================================================


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
--   activate_adherent_incorporation()          copia el adherente al contrato madre
--   complete_adherent_incorporation(uuid)      idem, por RPC desde el link de firma
--   approve_sale_addendum(uuid, text)          anexos
--   try_complete_sale_addendum_for_link(uuid)  anexos
--
-- POR QUÉ NO SE USA `ALTER FUNCTION ... SET` (era la versión anterior de este
-- archivo, y nunca se pudo aplicar en ningún entorno):
--   `app.allow_signed_beneficiary_mutation` es una GUC "placeholder": no la
--   declara ninguna extensión. PostgreSQL exige SUPERUSUARIO para fijar un
--   placeholder con ALTER FUNCTION/ROLE/DATABASE, y en Supabase el rol
--   `postgres` no lo es -> `42501: permission denied to set parameter`.
--   El módulo de comisiones no tiene ese problema porque NO usa ALTER FUNCTION:
--   hace `PERFORM set_config('app.commission_rpc_mutation','on',true)` DENTRO
--   del cuerpo de cada RPC (ver 202608040003_commission_03_rpcs.sql:223), y
--   set_config sí está permitido para cualquier rol.
--
-- Copiar ese patrón exigiría reescribir el cuerpo de las 4 funciones, y 3 de
-- ellas (complete_adherent_incorporation, approve_sale_addendum,
-- try_complete_sale_addendum_for_link) NO están en el repo: sólo existen en la
-- base. Un CREATE OR REPLACE a ciegas las rompería.
--
-- Por eso la exención se resuelve del lado del trigger, mirando la PILA DE
-- LLAMADAS (`GET DIAGNOSTICS ... PG_CONTEXT`): si la escritura viene de adentro
-- de alguna de las 4, pasa. Ninguna de las 4 se toca.
-- Se conserva además el atajo por GUC, para que siga andando si alguna de esas
-- funciones adopta el patrón de comisiones (o si un superusuario llega a
-- aplicar el ALTER FUNCTION).


-- ---------------------------------------------------------------------
-- 0. PREFLIGHT — sin exención garantizada, NO se instala el trigger
-- ---------------------------------------------------------------------
-- Instalar el bloqueo sin exenciones sería peor que no instalarlo: frenaría a
-- la propia activación del anexo y el adherente nunca se sumaría al contrato
-- madre. Si algo no cierra, esto aborta la migración entera.
DO $preflight$
DECLARE
  v_faltan text;
  v_opacas text;
BEGIN
  SELECT string_agg(f, ', ')
    INTO v_faltan
    FROM unnest(ARRAY[
      'public.activate_adherent_incorporation()',
      'public.complete_adherent_incorporation(uuid)',
      'public.approve_sale_addendum(uuid,text)',
      'public.try_complete_sale_addendum_for_link(uuid)'
    ]) AS f
   WHERE to_regprocedure(f) IS NULL;

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'No existen estas funciones del sistema, que deben quedar exentas: %. Revisar antes de instalar el bloqueo.',
      v_faltan;
  END IF;

  -- La pila de PG_CONTEXT sólo muestra funciones PL/pgSQL. Una función exenta
  -- escrita en SQL plano sería invisible ahí, y el trigger la bloquearía.
  SELECT string_agg(p.proname || ' (lenguaje ' || l.lanname || ')', ', ')
    INTO v_opacas
    FROM pg_proc p
    JOIN pg_language  l ON l.oid = p.prolang
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('activate_adherent_incorporation','complete_adherent_incorporation',
                       'approve_sale_addendum','try_complete_sale_addendum_for_link')
     AND l.lanname <> 'plpgsql'
     AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%allow_signed_beneficiary_mutation=on%';

  IF v_opacas IS NOT NULL THEN
    RAISE EXCEPTION
      'Estas funciones no son PL/pgSQL, asi que no aparecen en PG_CONTEXT y quedarian bloqueadas: %. Darles la exencion por GUC (set_config en su cuerpo) antes de instalar el trigger.',
      v_opacas;
  END IF;
END
$preflight$;


-- ---------------------------------------------------------------------
-- 1. Exención por GUC — se intenta, y si no se puede, no pasa nada
-- ---------------------------------------------------------------------
-- Falla con 42501 salvo que la corra un superusuario. La exención real es la
-- de PG_CONTEXT (paso 2), así que esto es sólo un extra.
DO $exenciones$
BEGIN
  EXECUTE 'ALTER FUNCTION public.activate_adherent_incorporation()         SET app.allow_signed_beneficiary_mutation = ''on''';
  EXECUTE 'ALTER FUNCTION public.complete_adherent_incorporation(uuid)     SET app.allow_signed_beneficiary_mutation = ''on''';
  EXECUTE 'ALTER FUNCTION public.approve_sale_addendum(uuid, text)         SET app.allow_signed_beneficiary_mutation = ''on''';
  EXECUTE 'ALTER FUNCTION public.try_complete_sale_addendum_for_link(uuid) SET app.allow_signed_beneficiary_mutation = ''on''';
  RAISE NOTICE 'Exencion por GUC aplicada a las 4 funciones del sistema.';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin privilegio para ALTER FUNCTION ... SET (esperado en Supabase). La exencion queda por PG_CONTEXT.';
END
$exenciones$;


-- ---------------------------------------------------------------------
-- 2. El trigger de bloqueo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beneficiaries_block_when_sale_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid;
  v_status  text;
  v_ctx     text;
BEGIN
  -- Exención A: GUC local, el patrón del módulo de comisiones.
  IF current_setting('app.allow_signed_beneficiary_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Exención B: la escritura viene de adentro de una de las 4 funciones del
  -- sistema. PG_CONTEXT trae la pila de llamadas PL/pgSQL completa.
  GET DIAGNOSTICS v_ctx = PG_CONTEXT;
  IF v_ctx ~ 'function [a-z_.]*(activate_adherent_incorporation|complete_adherent_incorporation|approve_sale_addendum|try_complete_sale_addendum_for_link)' THEN
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


-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 3 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'el trigger de bloqueo existe' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_beneficiaries_block_when_sale_signed'
            AND tgrelid = 'public.beneficiaries'::regclass
            AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'la guarda lee la pila de llamadas',
       CASE WHEN pg_get_functiondef('public.beneficiaries_block_when_sale_signed()'::regprocedure)
                 LIKE '%PG_CONTEXT%'
       THEN 'OK' ELSE 'ES LA VERSION VIEJA' END
UNION ALL
SELECT 'las 4 funciones del sistema quedan exentas',
       CASE WHEN (
         SELECT count(*) FROM pg_proc p
           JOIN pg_language  l ON l.oid = p.prolang
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('activate_adherent_incorporation','complete_adherent_incorporation',
                              'approve_sale_addendum','try_complete_sale_addendum_for_link')
            AND (l.lanname = 'plpgsql'
                 OR array_to_string(p.proconfig, ',') LIKE '%allow_signed_beneficiary_mutation=on%')
       ) >= 4 THEN 'OK' ELSE 'ALGUNA QUEDARIA BLOQUEADA' END;


-- =====================================================================
-- LEDGER -- registrar en supabase_migrations lo que ya esta aplicado
--
-- Las del 17/08 y 18/08 se aplicaron a mano desde el editor, asi que no
-- quedaron anotadas: hoy el ledger solo tiene las tres del 19/08. Sin esto,
-- un `supabase db push` posterior intenta re-aplicarlas.
-- Solo escribe el registro; no ejecuta nada de SQL.
-- =====================================================================
insert into supabase_migrations.schema_migrations (version) values
  ('20260817000001'), ('20260817000002'),
  ('20260818000001'), ('20260818000002'), ('20260818000003')
on conflict (version) do nothing;

select array_agg(version order by version) as ledger_final
  from supabase_migrations.schema_migrations
 where version >= '20260817';
