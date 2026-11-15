-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — Comisiones: reporte de liquidacion
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
-- MIGRACION  20261007000001_commission_report_additive (espejo en supabase/migrations)
--
-- ⚠️ NO CORRER ESTO CONTRA PRODUCCION (ejiycfqxgtrzaysgpzmx).
--    El modulo de comisiones NO existe en BR (ver CLAUDE.md, "Modulo de
--    Comisiones"). El preflight aborta solo si faltan sus tablas, pero no
--    confiar en eso: este script es SOLO para US test.
--
-- ----------------------------------------------------------------------------
-- QUE HACE  (todo ADITIVO; nada existente cambia de comportamiento)
-- ----------------------------------------------------------------------------
--   1. Nueva base de calculo 'net_of_fee_and_tax' = (total - gasto adm.) / IVA.
--      Solo se AMPLIAN los CHECK de commission_rules.base y
--      commission_salespeople.default_base: ninguna regla existente la usa.
--   2. commission_settings += tax_divisor (default 1.10) y
--      maternity_extra_amount (NULL = apagado);
--      commission_plan_settings += report_code (codigo corto para el Excel).
--   3. Tabla commission_admin_fees (gasto administrativo por tipo de venta, con
--      vigencia) + helper interno commission_admin_fee_for().
--   4. commission_calculate_sale: copia textual + la rama de la base neta.
--   5. commission_generate_period: copia textual + el detalle de la base neta
--      en el rule_snapshot SOLO para esa base ('{}' para las demas).
--   6. Tabla commission_period_adjustments (viatico, recupero, bonificacion,
--      adicional, descuento, otro). Escritura SOLO por RPC y SOLO en borrador.
--   7. RPCs: commission_add_adjustment, commission_delete_adjustment,
--      commission_suggest_maternity_adjustments, commission_export_rows.
--   8. Vista commission_period_payable (security_invoker): total a cobrar.
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO  (se verifica DENTRO de la transaccion)
-- ----------------------------------------------------------------------------
--   Antes de tocar nada se fotografia:
--     · el resultado de commission_calculate_sale para TODAS las ventas de las
--       empresas con commission_settings;
--     · cada liquidacion y sus items (md5 de las filas completas);
--     · la configuracion del modulo (settings, reglas, vendedores, planes);
--     · fuente, firma, atributos y GRANTs de TODAS las funciones commission_*.
--   Al final se vuelve a fotografiar y el bloque CONTROL hace RAISE EXCEPTION
--   (=> ROLLBACK si se ejecuta como UNA transaccion: psql -1, apply_migration o
--   `db push`; el SQL Editor del dashboard puede no mantener la sesion entre
--   sentencias, asi que ahi NO esta garantizado el rollback) si:
--     · cambio una sola fila del calculo, de las liquidaciones o de la config;
--     · cambio cualquier funcion commission_* que no sea una de las 2
--       reemplazadas (incluye commission_require_rpc_mutation y
--       commission_preview);
--     · el cuerpo nuevo de las 2 reemplazadas, quitandole los fragmentos
--       insertados (que estan como literales en el CONTROL), no es
--       EXACTAMENTE el cuerpo vivo de antes. Eso prueba que solo se
--       INSERTO codigo y, de paso, detecta drift entre el repo y US test: si
--       la funcion viva no es la de 20260819000003, el script aborta.
--   Se normaliza CRLF/LF antes de comparar.
--
-- ----------------------------------------------------------------------------
-- COMO SE APLICA
-- ----------------------------------------------------------------------------
--   Pegar ENTERO en el SQL Editor del proyecto US test y ejecutar.
--   · Si aparece un error que empieza con "CONTROL:" o "Faltan", NO se aplico
--     nada (la transaccion se revierte). Copiar el mensaje y avisar.
--   · Si termina bien, el resultado visible es el SELECT de VERIFICACION del
--     final: TODAS las filas deben decir OK.
--   · Es idempotente: correrlo dos veces no cambia nada y vuelve a dar OK.
--   Despues: regenerar src/integrations/supabase/types.ts (en PowerShell con
--   `| Out-File -Encoding utf8`).
--
-- ----------------------------------------------------------------------------
-- REVERSION (manual; solo si hiciera falta)
-- ----------------------------------------------------------------------------
--   Volver a aplicar los pasos 2 y 4 de 20260819000003 (las 2 funciones) y:
--   DROP VIEW IF EXISTS public.commission_period_payable;
--   DROP FUNCTION IF EXISTS public.commission_export_rows(uuid[]);
--   DROP FUNCTION IF EXISTS public.commission_suggest_maternity_adjustments(uuid);
--   DROP FUNCTION IF EXISTS public.commission_delete_adjustment(uuid);
--   DROP FUNCTION IF EXISTS public.commission_add_adjustment(uuid, text, text, numeric, numeric, numeric, smallint, text, uuid);
--   DROP TABLE IF EXISTS public.commission_period_adjustments;
--   DROP FUNCTION IF EXISTS public.commission_validate_adjustment();
--   DROP FUNCTION IF EXISTS public.commission_admin_fee_for(uuid, text, date);
--   DROP TABLE IF EXISTS public.commission_admin_fees;
--   (y los CHECK/columnas del paso 1-2 solo si no hay reglas con la base nueva)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. PREFLIGHT — prerequisitos y foto del "antes"
-- ============================================================================
DO $preflight$
DECLARE
  v_falta text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_falta
  FROM unnest(ARRAY['public.commission_settings','public.commission_salespeople',
                    'public.commission_plan_settings','public.commission_rules',
                    'public.commission_periods','public.commission_items',
                    'public.sales','public.clients','public.beneficiaries',
                    'public.company_currency_settings']) AS t
  WHERE to_regclass(t) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas tablas: %. Este script es para US test con el modulo de comisiones aplicado.', v_falta;
  END IF;

  SELECT string_agg(f, ', ') INTO v_falta
  FROM unnest(ARRAY['public.commission_calculate_sale(uuid)',
                    'public.commission_preview(uuid,uuid,date,date)',
                    'public.commission_generate_period(uuid,uuid,date,date,text,text)',
                    'public.commission_require_rpc_mutation()',
                    'public.commission_touch_updated_at()',
                    'public.commission_authorize_company(uuid,boolean)',
                    'public.commission_can_read_company(uuid)',
                    'public.commission_can_write_company(uuid)']) AS f
  WHERE to_regprocedure(f) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas funciones: %.', v_falta;
  END IF;

  -- commission_calculate_sale tiene que ser la de 20260819000003 (devuelve sale_type).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.commission_calculate_sale(uuid)'::regprocedure
      AND 'sale_type' = ANY(p.proargnames)
  ) THEN
    RAISE EXCEPTION 'commission_calculate_sale no devuelve sale_type: falta aplicar 20260819000003.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'commission_items'
                   AND column_name = 'sale_type') THEN
    RAISE EXCEPTION 'commission_items.sale_type no existe: falta aplicar 20260819000003.';
  END IF;

  -- Columnas que leen commission_export_rows y commission_suggest_maternity_adjustments.
  SELECT string_agg(x.tbl || '.' || x.col, ', ') INTO v_falta
  FROM (VALUES ('sales', 'maternity_bonus'), ('sales', 'adherents_count'),
               ('sales', 'contract_number'), ('sales', 'total_amount'),
               ('clients', 'client_type'), ('beneficiaries', 'status'),
               ('beneficiaries', 'is_primary')) AS x(tbl, col)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = x.tbl
                      AND c.column_name = x.col);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas columnas: %. Este script es para US test.', v_falta;
  END IF;
END
$preflight$;

-- Foto del "antes". Tablas en un esquema de trabajo (cr_scratch) y no TEMP: el SQL Editor no
-- mantiene la sesion entre los pasos del script y las TEMP desaparecian
-- (42P01 relation "_cr_calc_before" does not exist). Se borra al final.
DROP SCHEMA IF EXISTS cr_scratch CASCADE;
CREATE SCHEMA cr_scratch;


-- (a) Lo que calcula HOY el motor para cada venta de las empresas con modulo.
--     commission_calculate_sale es SECURITY DEFINER y no llama a
--     commission_authorize_company, asi que corre como el owner (postgres)
--     tambien desde el SQL Editor, donde auth.uid() es NULL.
CREATE TABLE cr_scratch._cr_calc_before AS
SELECT c.*
FROM public.sales s
JOIN public.commission_settings st ON st.company_id = s.company_id
CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c;

-- (b) Huella de cada liquidacion y de sus items (dato contable congelado).
CREATE TABLE cr_scratch._cr_periods_before AS
SELECT p.id, p.status, p.total_amount,
       md5(to_jsonb(p)::text) AS period_md5,
       (SELECT count(*) FROM public.commission_items i WHERE i.period_id = p.id) AS items_count,
       (SELECT sum(i.commission_amount) FROM public.commission_items i WHERE i.period_id = p.id) AS items_sum,
       (SELECT md5(string_agg(to_jsonb(i)::text, '|' ORDER BY i.item_number))
          FROM public.commission_items i WHERE i.period_id = p.id) AS items_md5
FROM public.commission_periods p;

-- (c) Huella de la configuracion (sin las columnas que agrega este script).
CREATE TABLE cr_scratch._cr_config_before AS
SELECT 'commission_settings'::text AS t,
       md5(string_agg((to_jsonb(x) - 'tax_divisor' - 'maternity_extra_amount')::text, '|' ORDER BY x.company_id)) AS h
  FROM public.commission_settings x
UNION ALL
SELECT 'commission_rules', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_rules x
UNION ALL
SELECT 'commission_salespeople', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_salespeople x
UNION ALL
SELECT 'commission_plan_settings', md5(string_agg((to_jsonb(x) - 'report_code')::text, '|' ORDER BY x.id)) FROM public.commission_plan_settings x;

-- (d) Fuente y atributos de TODAS las funciones commission_* existentes.
CREATE TABLE cr_scratch._cr_src_before AS
SELECT p.oid, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS result,
       p.prosrc, p.prosecdef, p.provolatile,
       p.proconfig::text AS proconfig, p.proacl::text AS proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'commission\_%';


-- ============================================================================
-- 1. Nueva base de calculo 'net_of_fee_and_tax' en los dos CHECK
--    (solo se AMPLIA la lista: todo valor valido hoy sigue siendo valido)
-- ============================================================================
ALTER TABLE public.commission_rules DROP CONSTRAINT IF EXISTS commission_rules_base_check;
ALTER TABLE public.commission_rules ADD CONSTRAINT commission_rules_base_check
  CHECK (base IN ('plan_price', 'sale_total_amount', 'per_adherent', 'net_of_fee_and_tax'));

ALTER TABLE public.commission_salespeople DROP CONSTRAINT IF EXISTS commission_salespeople_default_base_check;
ALTER TABLE public.commission_salespeople ADD CONSTRAINT commission_salespeople_default_base_check
  CHECK (default_base IN ('plan_price', 'sale_total_amount', 'net_of_fee_and_tax'));


-- ============================================================================
-- 2. Columnas de configuracion del reporte
-- ============================================================================
-- Los CHECK van aparte (DROP IF EXISTS + ADD) y no en linea con el ADD COLUMN,
-- para que una segunda corrida sea un no-op limpio.
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS tax_divisor numeric(6,4) NOT NULL DEFAULT 1.10,
  ADD COLUMN IF NOT EXISTS maternity_extra_amount numeric(14,2);

ALTER TABLE public.commission_settings DROP CONSTRAINT IF EXISTS commission_settings_tax_divisor_check;
ALTER TABLE public.commission_settings ADD CONSTRAINT commission_settings_tax_divisor_check
  CHECK (tax_divisor >= 1);
ALTER TABLE public.commission_settings DROP CONSTRAINT IF EXISTS commission_settings_maternity_extra_nonneg;
ALTER TABLE public.commission_settings ADD CONSTRAINT commission_settings_maternity_extra_nonneg
  CHECK (maternity_extra_amount IS NULL OR maternity_extra_amount >= 0);

COMMENT ON COLUMN public.commission_settings.tax_divisor IS
  'Divisor de IVA de la base neta (1.10 = IVA 10%). Solo lo usa la base net_of_fee_and_tax.';
COMMENT ON COLUMN public.commission_settings.maternity_extra_amount IS
  'Monto del adicional por prima de maternidad que sugiere commission_suggest_maternity_adjustments. NULL = apagado.';

ALTER TABLE public.commission_plan_settings
  ADD COLUMN IF NOT EXISTS report_code text;

ALTER TABLE public.commission_plan_settings DROP CONSTRAINT IF EXISTS commission_plan_settings_report_code_check;
ALTER TABLE public.commission_plan_settings ADD CONSTRAINT commission_plan_settings_report_code_check
  CHECK (report_code IS NULL OR (btrim(report_code) <> '' AND length(report_code) <= 20));

COMMENT ON COLUMN public.commission_plan_settings.report_code IS
  'Codigo corto del plan para la columna Plan del reporte de liquidacion. NULL = usar el nombre del plan.';


-- ============================================================================
-- 3. Gasto administrativo por tipo de venta (con vigencia)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.commission_admin_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_admin_fees_sale_type_not_blank CHECK (btrim(sale_type) <> ''),
  CONSTRAINT commission_admin_fees_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT commission_admin_fees_valid_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT commission_admin_fees_company_type_from_key UNIQUE (company_id, sale_type, valid_from)
);

CREATE INDEX IF NOT EXISTS commission_admin_fees_created_by_idx
  ON public.commission_admin_fees (created_by) WHERE created_by IS NOT NULL;

COMMENT ON TABLE public.commission_admin_fees IS
  'Gasto administrativo que se descuenta del total de la venta en la base net_of_fee_and_tax. Sin fila vigente => error admin_fee_not_configured (nunca se asume 0).';

DROP TRIGGER IF EXISTS commission_admin_fees_touch_updated_at ON public.commission_admin_fees;
CREATE TRIGGER commission_admin_fees_touch_updated_at BEFORE UPDATE ON public.commission_admin_fees
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();

ALTER TABLE public.commission_admin_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_admin_fees_read ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_read ON public.commission_admin_fees
FOR SELECT TO authenticated USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_insert ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_insert ON public.commission_admin_fees
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_update ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_update ON public.commission_admin_fees
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_delete ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_delete ON public.commission_admin_fees
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

REVOKE ALL ON TABLE public.commission_admin_fees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_admin_fees TO authenticated;

-- Helper interno: el gasto vigente para (empresa, tipo de venta, fecha).
-- NULL si no hay ninguno: el que llama decide que eso es un error.
CREATE OR REPLACE FUNCTION public.commission_admin_fee_for(p_company_id uuid, p_sale_type text, p_on date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.amount
  FROM public.commission_admin_fees f
  WHERE f.company_id = p_company_id
    AND f.sale_type = p_sale_type
    AND f.is_active
    AND p_on IS NOT NULL
    AND f.valid_from <= p_on
    AND (f.valid_to IS NULL OR f.valid_to >= p_on)
  ORDER BY f.valid_from DESC, f.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.commission_admin_fee_for(uuid, text, date) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 4. commission_calculate_sale — copia TEXTUAL de 20260819000003 (L48-175)
--    con SOLO estas inserciones (el control del paso 9 lo demuestra):
--      · DECLARE v_admin_fee / v_tax_divisor
--      · rama "sin regla": guarda de gasto + WHEN 'net_of_fee_and_tax'
--      · rama "regla":     guarda de gasto + WHEN 'net_of_fee_and_tax'
--    Misma firma y mismo retorno => CREATE OR REPLACE conserva los GRANT; igual
--    se repite el REVOKE de 20260819000003.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text, sale_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_base numeric;
  v_decimals integer;
  v_default_percent numeric(5,2);
  v_default_base text;
  v_admin_fee numeric;
  v_tax_divisor numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');
  -- Mismo COALESCE que usa el resolvedor de reglas, para que lo que se muestra
  -- y lo que se liquida sea exactamente el valor contra el que se matcheó.
  sale_type := COALESCE(v_sale.sale_type, 'venta_nueva');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.default_percent, cs.default_base
    INTO v_default_percent, v_default_base
  FROM public.commission_salespeople cs
  WHERE cs.company_id = v_sale.company_id
    AND cs.salesperson_id = v_sale.salesperson_id
    AND cs.is_active;
  IF NOT FOUND THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  -- Sin regla aplicable: respaldo con el porcentaje por defecto del vendedor.
  IF v_rule.id IS NULL THEN
    IF v_default_percent IS NULL THEN
      error_code := 'no_rule'; RETURN NEXT; RETURN;
    END IF;
    v_default_base := COALESCE(v_default_base, 'sale_total_amount');
    -- [reporte] Base neta: (total - gasto administrativo) / divisor de IVA.
    -- Sin gasto vigente NO se asume 0: la venta queda con error y bloquea.
    IF v_default_base = 'net_of_fee_and_tax' THEN
      v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
      SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
      IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
        calc_mode := 'percent'; percent := v_default_percent; base_type := v_default_base;
        error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
      END IF;
    END IF;
    v_base := CASE v_default_base
      WHEN 'plan_price' THEN COALESCE(v_plan.price, 0)
      WHEN 'net_of_fee_and_tax' THEN (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor
      ELSE COALESCE(v_sale.total_amount, 0)
    END;
    rule_id := NULL;
    calc_mode := 'percent';
    percent := v_default_percent;
    base_type := v_default_base;
    base_amount := round(v_base, v_decimals);
    IF v_base <= 0 THEN error_code := 'invalid_base_amount'; RETURN NEXT; RETURN; END IF;
    commission_amount := round(v_base * v_default_percent / 100, v_decimals);
    error_code := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- [reporte] Misma base neta para las reglas, con el mismo criterio.
  IF v_rule.base = 'net_of_fee_and_tax' THEN
    v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
    SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
    rule_id := v_rule.id; calc_mode := v_rule.calc_mode; percent := v_rule.percent; base_type := v_rule.base;
    IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
      error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
    END IF;
    -- Tambien en modo 'fixed': una base neta <= 0 no puede llegar a commission_items.
    IF COALESCE(v_sale.total_amount, 0) - v_admin_fee <= 0 THEN
      base_amount := round((COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor, v_decimals);
      error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'net_of_fee_and_tax' THEN v_base := (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor;
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 5. commission_generate_period — copia TEXTUAL de 20260819000003 (L243-321)
--    con UNA sola insercion: al rule_snapshot se le concatena (||) el detalle
--    de la base neta SOLO cuando base_type = 'net_of_fee_and_tax'. Para
--    cualquier otra base se concatena '{}'::jsonb, que deja el objeto identico:
--    los snapshots de siempre salen byte a byte iguales.
--    No se agregan columnas a commission_items.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active
  ) THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot, sale_type
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      CASE WHEN r.id IS NULL THEN
        jsonb_build_object('source', 'salesperson_default', 'calc_mode', 'percent',
          'percent', pv.percent, 'base', pv.base_type, 'sale_type', pv.sale_type)
      ELSE
        jsonb_build_object('source', 'rule', 'rule_id', r.id, 'calc_mode', r.calc_mode,
          'percent', r.percent, 'fixed_amount', r.fixed_amount, 'base', r.base,
          'priority', r.priority, 'specificity', r.specificity,
          'valid_from', r.valid_from, 'valid_to', r.valid_to, 'sale_type', pv.sale_type)
      END
      || CASE WHEN pv.base_type = 'net_of_fee_and_tax' THEN
        jsonb_build_object('admin_fee', public.commission_admin_fee_for(p_company_id, pv.sale_type, pv.sale_date),
          'tax_divisor', v_settings.tax_divisor,
          'gross_amount', (SELECT s2.total_amount FROM public.sales s2 WHERE s2.id = pv.sale_id))
      ELSE '{}'::jsonb END,
      pv.sale_type
    FROM preview pv
    LEFT JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) TO authenticated;


-- ============================================================================
-- 6. Ajustes de la liquidacion (viatico, recupero, bonificacion, ...)
--    Solo se escriben por RPC, como commission_periods / commission_items.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.commission_period_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.commission_periods(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.commission_items(id) ON DELETE RESTRICT,
  concept text NOT NULL,
  calc_mode text NOT NULL,
  base_amount numeric(14,2),
  percent numeric(5,2),
  amount numeric(14,2) NOT NULL,
  sign smallint NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_period_adjustments_concept_check
    CHECK (concept IN ('viatico', 'recupero', 'bonificacion', 'adicional', 'descuento', 'otro')),
  CONSTRAINT commission_period_adjustments_calc_mode_check CHECK (calc_mode IN ('amount', 'percent')),
  CONSTRAINT commission_period_adjustments_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_period_adjustments_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT commission_period_adjustments_base_nonnegative CHECK (base_amount IS NULL OR base_amount >= 0),
  CONSTRAINT commission_period_adjustments_sign_check CHECK (sign IN (1, -1)),
  CONSTRAINT commission_period_adjustments_calc_values CHECK (
    (calc_mode = 'amount' AND percent IS NULL AND base_amount IS NULL)
    OR (calc_mode = 'percent' AND percent IS NOT NULL AND base_amount IS NOT NULL AND base_amount >= 0)
  ),
  CONSTRAINT commission_period_adjustments_sign_concept CHECK (
    (concept = 'descuento' AND sign = -1)
    OR (concept IN ('viatico', 'recupero', 'bonificacion', 'adicional') AND sign = 1)
    OR concept = 'otro'
  )
);

CREATE INDEX IF NOT EXISTS commission_period_adjustments_period_idx
  ON public.commission_period_adjustments (period_id);
CREATE INDEX IF NOT EXISTS commission_period_adjustments_company_idx
  ON public.commission_period_adjustments (company_id);
CREATE INDEX IF NOT EXISTS commission_period_adjustments_item_idx
  ON public.commission_period_adjustments (item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_period_adjustments_created_by_idx
  ON public.commission_period_adjustments (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS commission_period_adjustments_item_concept_key
  ON public.commission_period_adjustments (period_id, item_id, concept) WHERE item_id IS NOT NULL;

COMMENT ON TABLE public.commission_period_adjustments IS
  'Ajustes de una liquidacion. amount siempre >= 0; el signo va en sign. Solo se escriben via commission_add_adjustment / commission_delete_adjustment / commission_suggest_maternity_adjustments, y solo con el periodo en borrador.';

CREATE OR REPLACE FUNCTION public.commission_validate_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id uuid;
  v_company_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_period_id := OLD.period_id;
  ELSE
    v_period_id := NEW.period_id;
  END IF;

  SELECT p.company_id, p.status INTO v_company_id, v_status
  FROM public.commission_periods p WHERE p.id = v_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'borrador' THEN
    RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.period_id IS DISTINCT FROM OLD.period_id THEN
    RAISE EXCEPTION 'commission adjustment cannot move to another period' USING ERRCODE = '23514';
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'commission adjustment must match its period company' USING ERRCODE = '23514';
  END IF;
  IF NEW.item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_items i
    WHERE i.id = NEW.item_id AND i.period_id = NEW.period_id
  ) THEN
    RAISE EXCEPTION 'commission adjustment item must belong to its period' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_validate_adjustment() FROM PUBLIC, anon, authenticated;

-- Orden de disparo (alfabetico): primero _rpc_only, despues _validate.
DROP TRIGGER IF EXISTS commission_period_adjustments_rpc_only ON public.commission_period_adjustments;
CREATE TRIGGER commission_period_adjustments_rpc_only
BEFORE INSERT OR UPDATE OR DELETE ON public.commission_period_adjustments
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();

DROP TRIGGER IF EXISTS commission_period_adjustments_validate ON public.commission_period_adjustments;
CREATE TRIGGER commission_period_adjustments_validate
BEFORE INSERT OR UPDATE OR DELETE ON public.commission_period_adjustments
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_adjustment();

ALTER TABLE public.commission_period_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_period_adjustments_read ON public.commission_period_adjustments;
CREATE POLICY commission_period_adjustments_read ON public.commission_period_adjustments
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR EXISTS (
    SELECT 1 FROM public.commission_periods p
    WHERE p.id = period_id
      AND p.salesperson_id = (SELECT auth.uid())
      AND p.status IN ('cerrada', 'pagada')
  )
);

REVOKE ALL ON TABLE public.commission_period_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commission_period_adjustments TO authenticated;


-- ============================================================================
-- 7. RPCs de ajustes y de exportacion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_add_adjustment(
  p_period_id uuid,
  p_concept text,
  p_calc_mode text,
  p_amount numeric DEFAULT NULL,
  p_base_amount numeric DEFAULT NULL,
  p_percent numeric DEFAULT NULL,
  p_sign smallint DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_item_id uuid DEFAULT NULL
)
RETURNS public.commission_period_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.commission_periods%ROWTYPE;
  v_row public.commission_period_adjustments%ROWTYPE;
  v_user_id uuid := (SELECT auth.uid());
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_mode text := lower(btrim(COALESCE(p_calc_mode, '')));
  v_decimals integer;
  v_amount numeric;
  v_sign smallint;
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;

  IF v_concept NOT IN ('viatico', 'recupero', 'bonificacion', 'adicional', 'descuento', 'otro') THEN
    RAISE EXCEPTION 'invalid adjustment concept: %', p_concept USING ERRCODE = '23514';
  END IF;
  IF v_mode NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'invalid adjustment calc mode: %', p_calc_mode USING ERRCODE = '23514';
  END IF;

  -- Signo: lo fija el concepto, salvo 'otro', que lo exige explicito.
  IF v_concept = 'otro' THEN
    IF p_sign IS NULL OR p_sign NOT IN (1, -1) THEN
      RAISE EXCEPTION 'sign (1 or -1) is required for concept otro' USING ERRCODE = '23514';
    END IF;
    v_sign := p_sign;
  ELSE
    v_sign := CASE WHEN v_concept = 'descuento' THEN -1 ELSE 1 END;
    IF p_sign IS NOT NULL AND p_sign <> v_sign THEN
      RAISE EXCEPTION 'sign % does not match concept %', p_sign, v_concept USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Mismo redondeo que commission_calculate_sale: decimales de la moneda, default 0.
  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_period.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  IF v_mode = 'amount' THEN
    IF p_base_amount IS NOT NULL OR p_percent IS NOT NULL THEN
      RAISE EXCEPTION 'amount mode does not accept base amount or percent' USING ERRCODE = '23514';
    END IF;
    IF p_amount IS NULL OR p_amount < 0 THEN
      RAISE EXCEPTION 'amount is required and must be >= 0' USING ERRCODE = '23514';
    END IF;
    v_amount := round(p_amount, v_decimals);
  ELSE
    IF p_amount IS NOT NULL THEN
      RAISE EXCEPTION 'percent mode computes the amount; do not send amount' USING ERRCODE = '23514';
    END IF;
    IF p_base_amount IS NULL OR p_base_amount < 0 THEN
      RAISE EXCEPTION 'base amount is required and must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
      RAISE EXCEPTION 'percent is required and must be between 0 and 100' USING ERRCODE = '23514';
    END IF;
    v_amount := round(p_base_amount * p_percent / 100, v_decimals);
  END IF;

  IF p_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_items i WHERE i.id = p_item_id AND i.period_id = p_period_id
  ) THEN
    RAISE EXCEPTION 'adjustment item does not belong to this period' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_period_adjustments (
    period_id, company_id, item_id, concept, calc_mode, base_amount, percent,
    amount, sign, notes, created_by
  ) VALUES (
    p_period_id, v_period.company_id, p_item_id, v_concept, v_mode,
    CASE WHEN v_mode = 'percent' THEN p_base_amount END,
    CASE WHEN v_mode = 'percent' THEN p_percent END,
    v_amount, v_sign, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_delete_adjustment(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id uuid;
  v_period public.commission_periods%ROWTYPE;
BEGIN
  SELECT a.period_id INTO v_period_id FROM public.commission_period_adjustments a WHERE a.id = p_adjustment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission adjustment not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = v_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  DELETE FROM public.commission_period_adjustments a WHERE a.id = p_adjustment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_suggest_maternity_adjustments(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.commission_periods%ROWTYPE;
  v_user_id uuid := (SELECT auth.uid());
  v_extra numeric;
  v_decimals integer;
  v_count integer;
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;

  SELECT st.maternity_extra_amount INTO v_extra
  FROM public.commission_settings st WHERE st.company_id = v_period.company_id;
  IF v_extra IS NULL THEN
    RAISE EXCEPTION 'maternity extra amount is not configured' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_period.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_period_adjustments (
    period_id, company_id, item_id, concept, calc_mode, base_amount, percent,
    amount, sign, notes, created_by
  )
  SELECT p_period_id, v_period.company_id, ci.id, 'adicional', 'amount', NULL, NULL,
         round(v_extra, v_decimals), 1, 'Prima de maternidad', v_user_id
  FROM public.commission_items ci
  JOIN public.sales s ON s.id = ci.sale_id
  WHERE ci.period_id = p_period_id
    AND COALESCE(s.maternity_bonus, false)
  ORDER BY ci.item_number
  ON CONFLICT (period_id, item_id, concept) WHERE item_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Filas para el Excel de liquidacion. Lectura: staff con permiso de lectura de
-- comisiones (commission_authorize_company(company, false)) de CADA empresa
-- involucrada. gross_amount / admin_fee / tax_divisor salen del rule_snapshot y
-- son NULL para items liquidados con otra base (o antes de este script);
-- sale_total_amount es el total ACTUAL de la venta, para que el reporte tenga un
-- "Total" tambien en esos items.
CREATE OR REPLACE FUNCTION public.commission_export_rows(p_period_ids uuid[])
RETURNS TABLE (
  period_id uuid, item_id uuid, sale_id uuid, item_number integer, group_type text,
  sale_date date, client_name text, client_display_id text, plan_name text,
  report_code text, sale_type text, contract_number text, lives integer,
  base_type text, calc_mode text, percent numeric, base_amount numeric,
  commission_amount numeric, gross_amount numeric, admin_fee numeric,
  tax_divisor numeric, sale_total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_period_ids IS NULL OR cardinality(p_period_ids) = 0 THEN
    RETURN;
  END IF;

  FOR v_company_id IN
    SELECT DISTINCT cp.company_id FROM public.commission_periods cp WHERE cp.id = ANY(p_period_ids)
  LOOP
    PERFORM public.commission_authorize_company(v_company_id, false);
  END LOOP;

  RETURN QUERY
  SELECT ci.period_id::uuid,
         ci.id::uuid,
         ci.sale_id::uuid,
         ci.item_number::integer,
         ci.group_type::text,
         ci.sale_date::date,
         ci.client_name::text,
         ci.client_display_id::text,
         ci.plan_name::text,
         ps.report_code::text,
         COALESCE(ci.sale_type, ci.rule_snapshot->>'sale_type')::text,
         s.contract_number::text,
         (CASE
            WHEN c.client_type = 'empresa' OR COALESCE(bn.has_primary, false) THEN COALESCE(bn.n_active, 0)
            WHEN COALESCE(bn.n_active, 0) > 0 THEN bn.n_active + 1
            ELSE COALESCE(s.adherents_count, 0) + 1
          END)::integer,
         (ci.rule_snapshot->>'base')::text,
         (ci.rule_snapshot->>'calc_mode')::text,
         ci.percent::numeric,
         ci.base_amount::numeric,
         ci.commission_amount::numeric,
         (ci.rule_snapshot->>'gross_amount')::numeric,
         (ci.rule_snapshot->>'admin_fee')::numeric,
         (ci.rule_snapshot->>'tax_divisor')::numeric,
         s.total_amount::numeric
  FROM public.commission_items ci
  LEFT JOIN public.sales s ON s.id = ci.sale_id
  LEFT JOIN public.clients c ON c.id = s.client_id
  LEFT JOIN public.commission_plan_settings ps
    ON ps.company_id = ci.company_id AND ps.plan_id = s.plan_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE COALESCE(b.status, 'active') = 'active')::integer AS n_active,
           bool_or(COALESCE(b.is_primary, false) AND COALESCE(b.status, 'active') = 'active') AS has_primary
    FROM public.beneficiaries b
    WHERE b.sale_id = ci.sale_id
  ) bn ON true
  WHERE ci.period_id = ANY(p_period_ids)
  ORDER BY ci.period_id, ci.item_number;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_add_adjustment(uuid, text, text, numeric, numeric, numeric, smallint, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_delete_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_suggest_maternity_adjustments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_export_rows(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_add_adjustment(uuid, text, text, numeric, numeric, numeric, smallint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_delete_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_suggest_maternity_adjustments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_export_rows(uuid[]) TO authenticated;


-- ============================================================================
-- 8. Vista: total a cobrar por liquidacion
--    total_items sale de los ITEMS, no de commission_periods.total_amount: en un
--    borrador ese total vale 0 hasta el cierre (comportamiento existente).
--    security_invoker => aplica la RLS de quien consulta (el vendedor solo ve
--    sus liquidaciones cerradas/pagadas, igual que en las tablas).
-- ============================================================================
CREATE OR REPLACE VIEW public.commission_period_payable
WITH (security_invoker = true) AS
SELECT p.id AS period_id,
       p.company_id,
       p.salesperson_id,
       p.status,
       p.currency_code,
       it.total_items,
       it.items_count,
       adj.viatico,
       adj.recupero,
       adj.bonificacion,
       adj.adicional,
       adj.descuento,
       adj.otro,
       adj.total_adjustments,
       (it.total_items + adj.total_adjustments)::numeric(14,2) AS total_a_cobrar
FROM public.commission_periods p
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(i.commission_amount), 0)::numeric(14,2) AS total_items,
         count(*)::integer AS items_count
  FROM public.commission_items i
  WHERE i.period_id = p.id
) it
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'viatico'), 0)::numeric(14,2) AS viatico,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'recupero'), 0)::numeric(14,2) AS recupero,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'bonificacion'), 0)::numeric(14,2) AS bonificacion,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'adicional'), 0)::numeric(14,2) AS adicional,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'descuento'), 0)::numeric(14,2) AS descuento,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'otro'), 0)::numeric(14,2) AS otro,
         COALESCE(sum(a.sign * a.amount), 0)::numeric(14,2) AS total_adjustments
  FROM public.commission_period_adjustments a
  WHERE a.period_id = p.id
) adj;

REVOKE ALL ON TABLE public.commission_period_payable FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commission_period_payable TO authenticated;


-- ============================================================================
-- 9. CONTROL FINAL — si algo del comportamiento existente cambio, ABORTA
-- ============================================================================
CREATE TABLE cr_scratch._cr_calc_after AS
SELECT c.*
FROM public.sales s
JOIN public.commission_settings st ON st.company_id = s.company_id
CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c;

CREATE TABLE cr_scratch._cr_periods_after AS
SELECT p.id, p.status, p.total_amount,
       md5(to_jsonb(p)::text) AS period_md5,
       (SELECT count(*) FROM public.commission_items i WHERE i.period_id = p.id) AS items_count,
       (SELECT sum(i.commission_amount) FROM public.commission_items i WHERE i.period_id = p.id) AS items_sum,
       (SELECT md5(string_agg(to_jsonb(i)::text, '|' ORDER BY i.item_number))
          FROM public.commission_items i WHERE i.period_id = p.id) AS items_md5
FROM public.commission_periods p;

CREATE TABLE cr_scratch._cr_config_after AS
SELECT 'commission_settings'::text AS t,
       md5(string_agg((to_jsonb(x) - 'tax_divisor' - 'maternity_extra_amount')::text, '|' ORDER BY x.company_id)) AS h
  FROM public.commission_settings x
UNION ALL
SELECT 'commission_rules', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_rules x
UNION ALL
SELECT 'commission_salespeople', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_salespeople x
UNION ALL
SELECT 'commission_plan_settings', md5(string_agg((to_jsonb(x) - 'report_code')::text, '|' ORDER BY x.id)) FROM public.commission_plan_settings x;

DO $control$
DECLARE
  v_n integer;
  r record;
  v_frag text;
  v_new text;
  v_old text;
  v_stripped text;
  v_hits integer;
  -- Fragmentos insertados, LITERALES. Quitandolos del cuerpo nuevo tiene que
  -- quedar EXACTAMENTE el cuerpo vivo de antes. Si el cuerpo vivo en esta base
  -- no es el del repo (drift), este control falla y no se aplica nada.
  v_frags_calc text[] := ARRAY[
    $frag$  v_admin_fee numeric;
  v_tax_divisor numeric;
$frag$,
    $frag$    -- [reporte] Base neta: (total - gasto administrativo) / divisor de IVA.
    -- Sin gasto vigente NO se asume 0: la venta queda con error y bloquea.
    IF v_default_base = 'net_of_fee_and_tax' THEN
      v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
      SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
      IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
        calc_mode := 'percent'; percent := v_default_percent; base_type := v_default_base;
        error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
      END IF;
    END IF;
$frag$,
    $frag$      WHEN 'net_of_fee_and_tax' THEN (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor
$frag$,
    $frag$  -- [reporte] Misma base neta para las reglas, con el mismo criterio.
  IF v_rule.base = 'net_of_fee_and_tax' THEN
    v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
    SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
    rule_id := v_rule.id; calc_mode := v_rule.calc_mode; percent := v_rule.percent; base_type := v_rule.base;
    IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
      error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
    END IF;
    -- Tambien en modo 'fixed': una base neta <= 0 no puede llegar a commission_items.
    IF COALESCE(v_sale.total_amount, 0) - v_admin_fee <= 0 THEN
      base_amount := round((COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor, v_decimals);
      error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
    END IF;
  END IF;

$frag$,
    $frag$    WHEN 'net_of_fee_and_tax' THEN v_base := (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor;
$frag$
  ];
  v_frags_gen text[] := ARRAY[
    $frag$
      || CASE WHEN pv.base_type = 'net_of_fee_and_tax' THEN
        jsonb_build_object('admin_fee', public.commission_admin_fee_for(p_company_id, pv.sale_type, pv.sale_date),
          'tax_divisor', v_settings.tax_divisor,
          'gross_amount', (SELECT s2.total_amount FROM public.sales s2 WHERE s2.id = pv.sale_id))
      ELSE '{}'::jsonb END$frag$
  ];
BEGIN
  -- (a) El motor calcula lo mismo para todas las ventas.
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_calc_after EXCEPT ALL SELECT * FROM cr_scratch._cr_calc_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_calc_before EXCEPT ALL SELECT * FROM cr_scratch._cr_calc_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: commission_calculate_sale cambio su resultado en % fila(s). No se aplica nada.', v_n;
  END IF;

  -- (b) Liquidaciones e items intactos.
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_periods_after EXCEPT ALL SELECT * FROM cr_scratch._cr_periods_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_periods_before EXCEPT ALL SELECT * FROM cr_scratch._cr_periods_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: cambiaron % liquidacion(es) o sus items. No se aplica nada.', v_n;
  END IF;

  -- (c) Configuracion intacta (sin contar las columnas nuevas).
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_config_after EXCEPT ALL SELECT * FROM cr_scratch._cr_config_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_config_before EXCEPT ALL SELECT * FROM cr_scratch._cr_config_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: cambio la configuracion existente del modulo. No se aplica nada.';
  END IF;

  -- (d) Toda funcion commission_* que ya existia, salvo las 2 reemplazadas, sigue
  --     identica (fuente, firma, retorno, SECURITY DEFINER, volatilidad,
  --     search_path y GRANTs). Incluye commission_require_rpc_mutation y
  --     commission_preview.
  FOR r IN
    SELECT b.proname, b.args
    FROM cr_scratch._cr_src_before b
    LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname NOT IN ('commission_calculate_sale', 'commission_generate_period')
      AND (p.oid IS NULL
           OR replace(p.prosrc, E'\r', '') IS DISTINCT FROM replace(b.prosrc, E'\r', '')
           OR pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM b.args
           OR pg_get_function_result(p.oid) IS DISTINCT FROM b.result
           OR p.prosecdef IS DISTINCT FROM b.prosecdef
           OR p.provolatile IS DISTINCT FROM b.provolatile
           OR p.proconfig::text IS DISTINCT FROM b.proconfig
           OR p.proacl::text IS DISTINCT FROM b.proacl)
  LOOP
    RAISE EXCEPTION 'CONTROL: la funcion %(%) cambio y no debia. No se aplica nada.', r.proname, r.args;
  END LOOP;

  -- (e) Las 2 reemplazadas conservan firma, retorno y atributos...
  FOR r IN
    SELECT b.proname, b.args
    FROM cr_scratch._cr_src_before b
    LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname IN ('commission_calculate_sale', 'commission_generate_period')
      AND (p.oid IS NULL
           OR pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM b.args
           OR pg_get_function_result(p.oid) IS DISTINCT FROM b.result
           OR p.prosecdef IS DISTINCT FROM b.prosecdef
           OR p.provolatile IS DISTINCT FROM b.provolatile
           OR p.proconfig::text IS DISTINCT FROM b.proconfig
           OR p.proacl::text IS DISTINCT FROM b.proacl)
  LOOP
    RAISE EXCEPTION 'CONTROL: % cambio de firma, atributos o GRANTs. No se aplica nada.', r.proname;
  END LOOP;

  -- ...y su cuerpo nuevo es el viejo MAS los fragmentos, nada mas.
  FOR r IN
    SELECT b.proname, b.prosrc AS old_src, p.prosrc AS new_src
    FROM cr_scratch._cr_src_before b
    JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname IN ('commission_calculate_sale', 'commission_generate_period')
  LOOP
    v_old := replace(r.old_src, E'\r', '');
    v_new := replace(r.new_src, E'\r', '');

    IF v_old LIKE '%net_of_fee_and_tax%' THEN
      -- Segunda corrida: la base ya tenia esta version. Tiene que quedar igual.
      IF v_new IS DISTINCT FROM v_old THEN
        RAISE EXCEPTION 'CONTROL: % ya tenia net_of_fee_and_tax pero con OTRO cuerpo. No se aplica nada.', r.proname;
      END IF;
      CONTINUE;
    END IF;

    v_stripped := v_new;
    FOREACH v_frag IN ARRAY CASE WHEN r.proname = 'commission_calculate_sale' THEN v_frags_calc ELSE v_frags_gen END
    LOOP
      v_frag := replace(v_frag, E'\r', '');
      v_hits := (length(v_stripped) - length(replace(v_stripped, v_frag, ''))) / length(v_frag);
      IF v_hits <> 1 THEN
        RAISE EXCEPTION 'CONTROL: un fragmento insertado aparece % vez/veces en % (se esperaba 1). No se aplica nada.', v_hits, r.proname;
      END IF;
      v_stripped := replace(v_stripped, v_frag, '');
    END LOOP;

    IF v_stripped IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'CONTROL: el cuerpo vivo de % no es el del repo (20260819000003). Hay drift: no se aplica nada.', r.proname
        USING HINT = 'Comparar pg_get_functiondef de la base contra supabase/migrations/20260819000003_commission_sale_type_snapshot.sql.';
    END IF;
  END LOOP;

  -- (f) El guard de mutacion por RPC sigue siendo el mismo objeto, sin cambios
  --     (ya cubierto por (d); se deja explicito porque es el candado contable).
  IF NOT EXISTS (
    SELECT 1 FROM cr_scratch._cr_src_before b JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname = 'commission_require_rpc_mutation'
      AND replace(p.prosrc, E'\r', '') = replace(b.prosrc, E'\r', '')
  ) THEN
    RAISE EXCEPTION 'CONTROL: commission_require_rpc_mutation cambio. No se aplica nada.';
  END IF;

  RAISE NOTICE 'CONTROL OK: calculo, liquidaciones, configuracion y funciones existentes sin cambios.';
END
$control$;

DROP SCHEMA IF EXISTS cr_scratch CASCADE;


-- ============================================================================
-- Registro en el historial de migraciones (para que un `db push` posterior no
-- intente re-aplicarla). Usa la columna `name` solo si existe en esta version
-- de supabase_migrations.
-- ============================================================================
DO $registro$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE 'supabase_migrations.schema_migrations no existe: no se registra la version.';
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
                  AND column_name = 'name') THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20261007000001', 'commission_report_additive')
    ON CONFLICT (version) DO NOTHING;
  ELSE
    INSERT INTO supabase_migrations.schema_migrations (version)
    VALUES ('20261007000001')
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$registro$;

COMMIT;

-- PostgREST cachea el esquema: sin esto la tabla/vista/RPCs nuevas dan 404
-- hasta el proximo reinicio del servicio.
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFICACION — todas las filas deben decir OK
-- ============================================================================
SELECT 'commission_settings: tax_divisor y maternity_extra_amount' AS chequeo,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'commission_settings'
                     AND column_name IN ('tax_divisor', 'maternity_extra_amount')) = 2
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'commission_plan_settings: report_code',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'commission_plan_settings'
                            AND column_name = 'report_code')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'CHECK commission_rules_base_check admite net_of_fee_and_tax',
       CASE WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint
                                        WHERE conname = 'commission_rules_base_check'
                                          AND conrelid = 'public.commission_rules'::regclass))
                 LIKE '%net_of_fee_and_tax%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'CHECK commission_salespeople_default_base_check admite net_of_fee_and_tax',
       CASE WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint
                                        WHERE conname = 'commission_salespeople_default_base_check'
                                          AND conrelid = 'public.commission_salespeople'::regclass))
                 LIKE '%net_of_fee_and_tax%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'tabla commission_admin_fees con RLS',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class
                          WHERE oid = to_regclass('public.commission_admin_fees') AND relrowsecurity)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'tabla commission_period_adjustments con RLS',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class
                          WHERE oid = to_regclass('public.commission_period_adjustments') AND relrowsecurity)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trigger ' || t.name,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = t.name AND tgrelid = to_regclass(t.tbl) AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
FROM (VALUES ('commission_admin_fees_touch_updated_at', 'public.commission_admin_fees'),
             ('commission_period_adjustments_rpc_only', 'public.commission_period_adjustments'),
             ('commission_period_adjustments_validate', 'public.commission_period_adjustments')) AS t(name, tbl)
UNION ALL
SELECT 'funcion ' || f.sig,
       CASE WHEN to_regprocedure('public.' || f.sig) IS NULL THEN 'FALTA'
            WHEN EXISTS (SELECT 1 FROM pg_proc p
                          WHERE p.oid = to_regprocedure('public.' || f.sig)
                            AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public, pg_temp'])
                 AND has_function_privilege('authenticated', to_regprocedure('public.' || f.sig), 'EXECUTE') = f.api
                 AND NOT has_function_privilege('anon', to_regprocedure('public.' || f.sig), 'EXECUTE')
       THEN 'OK' ELSE 'GRANTS / ATRIBUTOS MAL' END
FROM (VALUES ('commission_add_adjustment(uuid,text,text,numeric,numeric,numeric,smallint,text,uuid)', true),
             ('commission_delete_adjustment(uuid)', true),
             ('commission_suggest_maternity_adjustments(uuid)', true),
             ('commission_export_rows(uuid[])', true),
             ('commission_admin_fee_for(uuid,text,date)', false),
             ('commission_validate_adjustment()', false)) AS f(sig, api)
UNION ALL
SELECT 'commission_calculate_sale conoce net_of_fee_and_tax y sigue cerrada a la API',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE oid = 'public.commission_calculate_sale(uuid)'::regprocedure)
                 LIKE '%admin_fee_not_configured%'
                 AND NOT has_function_privilege('authenticated', 'public.commission_calculate_sale(uuid)', 'EXECUTE')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'commission_generate_period guarda admin_fee en el snapshot',
       CASE WHEN (SELECT prosrc FROM pg_proc
                   WHERE oid = 'public.commission_generate_period(uuid,uuid,date,date,text,text)'::regprocedure)
                 LIKE '%''admin_fee''%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'vista commission_period_payable con security_invoker',
       CASE WHEN to_regclass('public.commission_period_payable') IS NULL THEN 'FALTA'
            WHEN EXISTS (SELECT 1 FROM pg_class
                          WHERE oid = to_regclass('public.commission_period_payable')
                            AND relkind = 'v'
                            AND reloptions @> ARRAY['security_invoker=true'])
                 AND has_table_privilege('authenticated', 'public.commission_period_payable', 'SELECT')
                 AND NOT has_table_privilege('anon', 'public.commission_period_payable', 'SELECT')
       THEN 'OK' ELSE 'OPCIONES / GRANTS MAL' END
UNION ALL
SELECT 'commission_period_adjustments: authenticated solo lee',
       CASE WHEN to_regclass('public.commission_period_adjustments') IS NULL THEN 'FALTA'
            WHEN has_table_privilege('authenticated', 'public.commission_period_adjustments', 'SELECT')
                 AND NOT has_table_privilege('authenticated', 'public.commission_period_adjustments', 'INSERT')
                 AND NOT has_table_privilege('authenticated', 'public.commission_period_adjustments', 'UPDATE')
                 AND NOT has_table_privilege('authenticated', 'public.commission_period_adjustments', 'DELETE')
                 AND NOT has_table_privilege('anon', 'public.commission_period_adjustments', 'SELECT')
       THEN 'OK' ELSE 'GRANTS MAL' END
UNION ALL
SELECT 'RLS en las 8 tablas commission_*',
       CASE WHEN n = 8 THEN 'OK' ELSE 'REVISAR (' || n || ' tablas con RLS)' END
FROM (SELECT count(*) AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relname LIKE 'commission\_%' AND c.relkind = 'r'
         AND c.relrowsecurity) x
UNION ALL
SELECT 'version 20261007000001 registrada',
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'OK (sin tabla de historial)'
            WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261007000001')
       THEN 'OK' ELSE 'FALTA' END;
