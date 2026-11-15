-- Porcentaje por defecto por vendedor, como respaldo cuando ninguna regla aplica.
--
-- Pedido: "en caso de no tener una regla asignada, darle un % configurable al
-- vendedor". Hasta ahora la única salida era crear una regla comodín (plan
-- «Todos»), lo que obliga a mantener reglas para cubrir huecos.
--
-- Comportamiento: la REGLA SIEMPRE MANDA. El porcentaje por defecto se usa
-- únicamente cuando el motor no encontró ninguna regla aplicable para esa venta.
-- Si el vendedor no tiene porcentaje por defecto, se sigue devolviendo 'no_rule'
-- y la liquidación sigue bloqueada: nunca se asume 0% en silencio.
--
-- Trazabilidad: el ítem liquidado guarda rule_id = NULL y un rule_snapshot con
-- source = 'salesperson_default', de modo que en una auditoría se distingue lo
-- calculado por regla de lo calculado por defecto.

-- 1) Configuración en el vendedor.
ALTER TABLE public.commission_salespeople
  ADD COLUMN IF NOT EXISTS default_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS default_base text NOT NULL DEFAULT 'sale_total_amount';

ALTER TABLE public.commission_salespeople
  DROP CONSTRAINT IF EXISTS commission_salespeople_default_percent_range;
ALTER TABLE public.commission_salespeople
  ADD CONSTRAINT commission_salespeople_default_percent_range
  CHECK (default_percent IS NULL OR default_percent BETWEEN 0 AND 100);

ALTER TABLE public.commission_salespeople
  DROP CONSTRAINT IF EXISTS commission_salespeople_default_base_check;
ALTER TABLE public.commission_salespeople
  ADD CONSTRAINT commission_salespeople_default_base_check
  CHECK (default_base IN ('plan_price', 'sale_total_amount'));

-- 2) Un ítem calculado por defecto no tiene regla, así que rule_id deja de ser
--    obligatorio. La FK se mantiene: si hay regla, tiene que existir.
ALTER TABLE public.commission_items ALTER COLUMN rule_id DROP NOT NULL;

-- 3) El trigger contable sólo valida la empresa de la regla cuando hay regla.
CREATE OR REPLACE FUNCTION public.commission_validate_accounting_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_salesperson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_periods' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.commission_periods WHERE id = NEW.period_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its period company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.sales WHERE id = NEW.sale_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its sale company and salesperson' USING ERRCODE = '23514';
    END IF;
    IF NEW.rule_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.commission_rules WHERE id = NEW.rule_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission item rule must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3.b) El listado de vendedores expone la nueva configuración. Cambia el tipo de
--      retorno, así que va con DROP + CREATE y re-otorgamiento del GRANT.
DROP FUNCTION IF EXISTS public.commission_list_salespeople(uuid);

CREATE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean,
  default_percent numeric, default_base text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT
    p.id,
    btrim(concat_ws(' ', p.first_name, p.last_name))::text,
    p.email::text,
    COALESCE(cs.is_active, false),
    cs.default_percent::numeric,
    COALESCE(cs.default_base, 'sale_total_amount')::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_list_salespeople(uuid) TO authenticated;

-- 4) El cálculo: si no hay regla, se intenta el porcentaje por defecto.
CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- 5) generate_period: los ítems sin regla ya no se pierden en el JOIN, y su
--    snapshot deja constancia de que salieron del porcentaje por defecto.
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
      commission_amount, concept, rule_id, rule_snapshot
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      CASE WHEN r.id IS NULL THEN
        jsonb_build_object('source', 'salesperson_default', 'calc_mode', 'percent',
          'percent', pv.percent, 'base', pv.base_type)
      ELSE
        jsonb_build_object('source', 'rule', 'rule_id', r.id, 'calc_mode', r.calc_mode,
          'percent', r.percent, 'fixed_amount', r.fixed_amount, 'base', r.base,
          'priority', r.priority, 'specificity', r.specificity,
          'valid_from', r.valid_from, 'valid_to', r.valid_to)
      END
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
$$;
