-- =====================================================================
-- Advisors de PRODUCCIÓN — Fase A (correcciones seguras, sin impacto)
--
--   Proyecto: ejiycfqxgtrzaysgpzmx  (Supabase BR PRODUCCIÓN)
--   Fecha:    2026-08-27
--
-- CÓMO SE USA
--   Pegar este archivo entero en el SQL Editor de Supabase (proyecto BR
--   producción) y ejecutar. Es idempotente: correrlo dos veces no rompe
--   ni cambia nada de más.
--
-- QUÉ HACE  (solo catálogo: funciones y privilegios — NUNCA tablas/filas)
--   A1. Fija search_path en admin_change_sale_status (SECURITY DEFINER) y
--       le revoca EXECUTE a anon.
--   A2. Revoca EXECUTE (anon/authenticated/public) a 13 funciones de
--       trigger SECURITY DEFINER que no se invocan por RPC.
--   A3. Revoca EXECUTE a anon en 3 RPCs que son solo-para-logueados.
--   A4. Fija search_path en 4 helpers de teléfono (cosmético).
--
-- GARANTÍA DE CERO IMPACTO OPERATIVO
--   - No corta la operativa: se puede seguir cargando ventas, firmando y
--     generando PDFs mientras corre.
--   - ALTER FUNCTION / REVOKE son cambios de metadatos del catálogo; no
--     bloquean sales/clients/documents. Único matiz: un REVOKE sobre una
--     trigger-fn muy activa espera <1s a que terminen las transacciones
--     que la están ejecutando en ese instante.
--   - No cambia comportamiento: solo se saca EXECUTE a roles que no usan
--     esas funciones y se fija search_path = public, pg_temp (lo mismo que
--     ya resuelve hoy contra public).
--   - Reversión: GRANT EXECUTE ... TO <rol>;  (no hay datos que restaurar)
--   - NO toca ninguna edge function (regla crítica de CLAUDE.md).
--
-- NO INCLUYE (deuda deliberada — ver el reporte):
--   multiple_permissive_policies (205), unindexed_foreign_keys (86),
--   unused_index (35), rls_enabled_no_policy en documents_backup_20260820
--   y payment_events, y las ~28 funciones token/helper que anon SÍ necesita.
--
-- VERIFICACIÓN al final: deben salir 0 filas en las 2 comprobaciones.
-- =====================================================================

BEGIN;

-- ####################################################################
-- ### A1. admin_change_sale_status
-- ####################################################################
-- SECURITY DEFINER sin search_path => function_search_path_mutable.
-- La función ya se auto-protege por rol con auth.uid(); anon nunca la usa.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_change_sale_status'
      AND pg_get_function_identity_arguments(p.oid) = 'p_sale_id uuid, p_new_status text, p_new_audit_status text, p_reason text'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.admin_change_sale_status(uuid, text, text, text) SET search_path = public, pg_temp';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_change_sale_status(uuid, text, text, text) FROM anon';
  END IF;
END $$;

-- ####################################################################
-- ### A2. Funciones de trigger SECURITY DEFINER ejecutables por anon/authenticated
-- ####################################################################
-- RETURNS trigger, 0 args: no se pueden invocar por RPC de forma útil y
-- corren como owner cuando las dispara el trigger, sin importar el GRANT.
-- Ninguna está referenciada en políticas RLS (verificado contra pg_policy).
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'auto_advance_sale_status',
    'check_vendedor_edit_restriction',
    'create_template_version',
    'create_user_profile',
    'enforce_contratada_step_order',
    'fn_audit_log',
    'generate_contract_number',
    'protect_closed_sale_documents',
    'recalculate_sale_total_amount',   -- SOLO la versión sin argumentos (la del trigger)
    'revoke_stale_contratada_links',
    'set_titular_amount_on_save',
    'tg_sync_client_phone_to_links',
    'debtout_set_updated_at'           -- de la otra app (DebtOut) que comparte el proyecto
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    -- match exacto: nombre en el schema public, tipo trigger, sin argumentos
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
        AND p.pronargs = 0
        AND p.prorettype = 'pg_catalog.trigger'::regtype
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM anon, authenticated, public', fn);
    END IF;
  END LOOP;
END $$;

-- ####################################################################
-- ### A3. RPCs solo-para-logueados ejecutables por anon
-- ####################################################################
-- Se auto-protegen por auth.uid() (NULL para anon). authenticated las conserva.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='get_sales_metrics'
               AND pg_get_function_identity_arguments(p.oid)='p_company_id uuid, p_from date, p_to date') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_sales_metrics(uuid, date, date) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='get_user_permissions'
               AND pg_get_function_identity_arguments(p.oid)='_user_id uuid') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_user_permissions(uuid) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='user_has_permission'
               AND pg_get_function_identity_arguments(p.oid)='_user_id uuid, _permission_key text') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM anon';
  END IF;
END $$;

-- ####################################################################
-- ### A4. function_search_path_mutable en helpers de teléfono (cosmético)
-- ####################################################################
-- No son SECURITY DEFINER (riesgo mínimo); fijar search_path es inocuo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='normalize_phone_e164'
               AND pg_get_function_identity_arguments(p.oid)='raw text, default_cc text') THEN
    EXECUTE 'ALTER FUNCTION public.normalize_phone_e164(text, text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='phone_is_e164'
               AND pg_get_function_identity_arguments(p.oid)='p text') THEN
    EXECUTE 'ALTER FUNCTION public.phone_is_e164(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='phone_has_country_code'
               AND pg_get_function_identity_arguments(p.oid)='digits text') THEN
    EXECUTE 'ALTER FUNCTION public.phone_has_country_code(text) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='tg_normalize_phone_e164'
               AND p.pronargs = 0) THEN
    EXECUTE 'ALTER FUNCTION public.tg_normalize_phone_e164() SET search_path = public, pg_temp';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN  (correr después del COMMIT — deben salir 0 filas)
-- =====================================================================

-- (1) Ninguna de las trigger-fns de A2 debe seguir con EXECUTE para anon/authenticated
SELECT p.proname, r.rolname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(p.proacl) a ON a.privilege_type = 'EXECUTE'
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.pronargs = 0
  AND p.prorettype = 'pg_catalog.trigger'::regtype
  AND p.proname IN (
    'auto_advance_sale_status','check_vendedor_edit_restriction','create_template_version',
    'create_user_profile','enforce_contratada_step_order','fn_audit_log','generate_contract_number',
    'protect_closed_sale_documents','recalculate_sale_total_amount','revoke_stale_contratada_links',
    'set_titular_amount_on_save','tg_sync_client_phone_to_links','debtout_set_updated_at')
  AND r.rolname IN ('anon','authenticated','public');

-- (2) admin_change_sale_status + los 3 RPCs de A3 no deben tener EXECUTE para anon,
--     y admin_change_sale_status debe tener search_path fijado
SELECT p.proname, 'anon puede ejecutar' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(p.proacl) a ON a.privilege_type = 'EXECUTE'
JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = 'anon'
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_change_sale_status','get_sales_metrics','get_user_permissions','user_has_permission')
UNION ALL
SELECT p.proname, 'search_path no fijado' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_change_sale_status'
  AND (p.proconfig IS NULL OR NOT (p.proconfig::text LIKE '%search_path%'));
