-- Snapshot del TIPO DE VENTA en la liquidación de comisiones.
--
-- Contexto: `commission_rules.sale_type` ya existe como dimensión y el resolvedor
-- ya la matchea contra `sales.sale_type`. Lo que faltaba era dejar registrado en
-- la liquidación CUÁL era el tipo de la venta al momento de liquidarla.
--
-- Sin esto, auditar una liquidación obliga a ir a mirar `sales.sale_type` HOY,
-- que puede haber cambiado (o la venta puede haber mutado de estado). El ítem
-- liquidado tiene que ser autocontenido: es dato contable congelado.
--
-- Esta migración NO toca la lógica de resolución de reglas, ni el redondeo, ni
-- los `error_code`. Sólo propaga un dato más a lo largo de la cadena
-- commission_calculate_sale -> commission_preview -> commission_generate_period
-- -> commission_items.

-- ---------------------------------------------------------------------
-- 1) La columna en el ítem liquidado.
--    NULLABLE a propósito: hay filas históricas y ponerla NOT NULL las rompe.
--    El backfill del paso 5 las completa, pero la columna queda nullable para
--    no depender de que ese backfill haya corrido en todos los entornos.
-- ---------------------------------------------------------------------
ALTER TABLE public.commission_items
  ADD COLUMN IF NOT EXISTS sale_type text;

COMMENT ON COLUMN public.commission_items.sale_type IS
  'Tipo de la venta (sales.sale_type) al momento de liquidar. Snapshot inmutable de auditoría.';

-- ---------------------------------------------------------------------
-- 2) commission_calculate_sale: se agrega `sale_type` al RETURNS TABLE.
--
--    Postgres NO permite cambiar el tipo de retorno con CREATE OR REPLACE
--    (error 42P13: "cannot change return type of existing function"), así que
--    hay que DROP + CREATE. Y como commission_preview la consume con
--    CROSS JOIN LATERAL, se dropea PRIMERO commission_preview y se recrea
--    DESPUÉS, para que en ningún momento quede una versión de preview
--    apuntando a una firma vieja.
--
--    Nota: commission_resolve_rule(uuid) también llama a esta función, pero
--    selecciona columnas explícitas (c.sale_id, c.rule_id, ...), así que la
--    columna nueva no la afecta y no hace falta recrearla.
--
--    Los DROP pierden los GRANT, por eso se re-otorgan al final de cada CREATE
--    copiando exactamente los de 202608040003 / 202608040004.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.commission_preview(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.commission_calculate_sale(uuid);

CREATE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
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
    v_base := CASE v_default_base
      WHEN 'plan_price' THEN COALESCE(v_plan.price, 0)
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

  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
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

-- Se revoca tambien de `authenticated`, no solo de PUBLIC/anon: Supabase tiene
-- ALTER DEFAULT PRIVILEGES que otorga EXECUTE a los roles de API sobre las
-- funciones NUEVAS, y el DROP del paso 2 la volvio nueva. Sin esto, cualquier
-- usuario logueado podria invocarla por la Data API con el sale_id de OTRA
-- empresa: es SECURITY DEFINER y no llama a commission_authorize_company.
-- Es la misma revocacion que hace 20260804175027_commission_security_hardening.sql
-- y que verifica supabase/tests/commission_module_test.sql.
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) commission_preview: misma definición que en 202608040003, propagando
--    la columna nueva. Se conservan SECURITY DEFINER, search_path y los
--    GRANT/REVOKE originales (los perdió el DROP del paso 2).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.commission_preview(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid, calc_mode text,
  percent numeric, base_type text, base_amount numeric, commission_amount numeric,
  error_code text, sale_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_accrual_event text;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  SELECT st.accrual_event INTO v_accrual_event FROM public.commission_settings st
    WHERE st.company_id = p_company_id AND st.is_enabled;
  IF v_accrual_event IS NULL THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_salespeople cs WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active) THEN
    RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY
  SELECT c.sale_id, c.sale_date, c.client_display_id, c.client_sequence, c.client_name,
         c.plan_name, c.group_type, c.rule_id, c.calc_mode, c.percent, c.base_type,
         c.base_amount, c.commission_amount, c.error_code, c.sale_type
  FROM public.sales s
  CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c
  WHERE s.company_id = p_company_id AND s.salesperson_id = p_salesperson_id
    AND s.sale_date BETWEEN p_from AND p_to
    AND ((v_accrual_event = 'venta_completada' AND s.status::text = 'completado')
      OR (v_accrual_event = 'firma_completa' AND s.signature_completed_at IS NOT NULL))
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_items ci
      JOIN public.commission_periods cp ON cp.id = ci.period_id
      WHERE ci.sale_id = s.id AND cp.status <> 'anulada'
    )
  ORDER BY s.sale_date, s.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_preview(uuid, uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) commission_generate_period: idéntica a la de 20260804220000, salvo que
--    ahora escribe pv.sale_type en el ítem y lo agrega al rule_snapshot
--    (que es el registro inmutable de auditoría), junto a `source`.
--    El tipo de retorno no cambia (uuid), así que alcanza con CREATE OR REPLACE.
-- ---------------------------------------------------------------------
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
      END,
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

-- ---------------------------------------------------------------------
-- 5) Backfill de las filas históricas.
--
--    `commission_items` está protegida por el trigger
--    commission_require_rpc_mutation (202608040002), que rechaza con 42501
--    cualquier INSERT/UPDATE/DELETE que no venga de las RPC del módulo. La
--    puerta es la GUC `app.commission_rpc_mutation` = 'on' (local a la
--    transacción), así que el UPDATE va envuelto en un DO que la prende.
--
--    Ese mismo trigger además declara inmutable el snapshot en UPDATE: compara
--    to_jsonb(NEW) - 'is_settled' contra to_jsonb(OLD) - 'is_settled'. Como
--    `sale_type` es una columna NUEVA que hasta recién no existía, para las
--    filas históricas pasa de NULL a un valor y ESO dispararía la excepción de
--    inmutabilidad. Por eso el trigger se desactiva sólo durante el backfill
--    (ALTER TABLE ... DISABLE TRIGGER) y se vuelve a activar inmediatamente:
--    no se está relajando ninguna regla, se está completando el snapshot que
--    la columna nueva no podía tener.
-- ---------------------------------------------------------------------
DO $backfill$
DECLARE
  v_rows integer;
BEGIN
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  ALTER TABLE public.commission_items DISABLE TRIGGER commission_items_rpc_only;

  UPDATE public.commission_items ci
     SET sale_type = COALESCE(s.sale_type, 'venta_nueva')
    FROM public.sales s
   WHERE s.id = ci.sale_id
     AND ci.sale_type IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  ALTER TABLE public.commission_items ENABLE TRIGGER commission_items_rpc_only;
  RAISE NOTICE 'commission_items backfilleados con sale_type: %', v_rows;
END;
$backfill$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 5 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'columna commission_items.sale_type' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='commission_items' AND column_name='sale_type')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'commission_calculate_sale devuelve sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_calculate_sale' AND n.nspname='public'
              AND 'sale_type' = ANY(p.proargnames))
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'commission_preview devuelve sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_preview' AND n.nspname='public'
              AND 'sale_type' = ANY(p.proargnames))
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'commission_generate_period graba sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_generate_period' AND n.nspname='public'
              AND p.prosrc LIKE '%pv.sale_type%')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'sin ítems históricos sin sale_type',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.commission_items WHERE sale_type IS NULL)
       THEN 'OK' ELSE 'FALTA' END;
