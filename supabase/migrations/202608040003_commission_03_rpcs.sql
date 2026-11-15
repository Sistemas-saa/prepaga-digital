-- Commission RPCs. All authorization and company boundaries are checked internally.

CREATE OR REPLACE FUNCTION public.commission_authorize_company(p_company_id uuid, p_write boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_user_id, 'super_admin'::public.app_role) THEN RETURN; END IF;
  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'company access denied' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_user_id, 'admin'::public.app_role)
     OR public.has_role(v_user_id, 'financiero'::public.app_role) THEN RETURN; END IF;
  IF NOT p_write AND (
    public.has_role(v_user_id, 'supervisor'::public.app_role)
    OR public.has_role(v_user_id, 'auditor'::public.app_role)
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'commission permission denied' USING ERRCODE = '42501';
END;
$$;

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
  v_promoter_type_id uuid;
  v_base numeric(14,2);
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  -- "Sec" has no confirmed business source yet. Preserve it as NULL instead of
  -- inventing a family-member or installment meaning.
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.promoter_type_id INTO v_promoter_type_id
  FROM public.commission_salespeople cs
  JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.is_active
  WHERE cs.company_id = v_sale.company_id AND cs.salesperson_id = v_sale.salesperson_id AND cs.is_active;
  IF v_promoter_type_id IS NULL THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

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
    AND (r.promoter_type_id IS NULL OR r.promoter_type_id = v_promoter_type_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.promoter_type_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  IF v_rule.id IS NULL THEN error_code := 'no_rule'; RETURN NEXT; RETURN; END IF;
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
  base_amount := round(v_base, 2);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, 2)
    ELSE v_rule.fixed_amount
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_resolve_rule(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, rule_id uuid, calc_mode text, percent numeric, base_type text,
  base_amount numeric, commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company_id uuid;
BEGIN
  SELECT s.company_id INTO v_company_id FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_company_id, false);
  RETURN QUERY SELECT c.sale_id, c.rule_id, c.calc_mode, c.percent, c.base_type,
                      c.base_amount, c.commission_amount, c.error_code
               FROM public.commission_calculate_sale(p_sale_id) c;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_preview(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid, calc_mode text,
  percent numeric, base_type text, base_amount numeric, commission_amount numeric,
  error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
         c.base_amount, c.commission_amount, c.error_code
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
$$;

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
  v_salesperson public.profiles%ROWTYPE; v_promoter public.commission_promoter_types%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  SELECT pt.* INTO v_promoter FROM public.commission_salespeople cs
    JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active AND pt.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, promoter_type_id, promoter_type_code,
    promoter_type_name, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_promoter.id, v_promoter.code, v_promoter.name, v_currency, v_user_id, p_notes
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
      jsonb_build_object('rule_id', r.id, 'calc_mode', r.calc_mode, 'percent', r.percent,
        'fixed_amount', r.fixed_amount, 'base', r.base, 'priority', r.priority,
        'specificity', r.specificity, 'valid_from', r.valid_from, 'valid_to', r.valid_to)
    FROM preview pv
    JOIN public.commission_rules r ON r.id = pv.rule_id
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

CREATE OR REPLACE FUNCTION public.commission_close_period(p_period_id uuid)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods can be closed' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_items i WHERE i.period_id = p_period_id) THEN RAISE EXCEPTION 'empty period cannot be closed' USING ERRCODE = '23514'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_items SET is_settled = true WHERE period_id = p_period_id;
  UPDATE public.commission_periods p SET status = 'cerrada', closed_at = now(), closed_by = v_user_id,
    total_amount = (SELECT COALESCE(sum(i.commission_amount), 0) FROM public.commission_items i WHERE i.period_id = p_period_id)
    WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_annul_period(p_period_id uuid, p_reason text)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status = 'anulada' THEN RAISE EXCEPTION 'period is already annulled' USING ERRCODE = '55000'; END IF;
  IF v_period.status = 'pagada' THEN RAISE EXCEPTION 'paid periods require an explicit accounting reversal' USING ERRCODE = '55000'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'annulment reason is required' USING ERRCODE = '23514'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_items SET is_settled = false WHERE period_id = p_period_id AND is_settled;
  UPDATE public.commission_periods p SET status = 'anulada', annulled_at = now(), annulled_by = v_user_id,
    annulment_reason = btrim(p_reason) WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_pay_period(p_period_id uuid)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'cerrada' THEN RAISE EXCEPTION 'only closed periods can be marked paid' USING ERRCODE = '55000'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_periods p
  SET status = 'pagada', paid_at = now(), paid_by = v_user_id
  WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean,
  promoter_type_id uuid, promoter_type_code text, promoter_type_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT p.id, btrim(concat_ws(' ', p.first_name, p.last_name)), p.email,
    COALESCE(cs.is_active, false), pt.id, pt.code, pt.name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  LEFT JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.company_id = cs.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_authorize_company(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_resolve_rule(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_close_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_annul_period(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_pay_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM PUBLIC;
