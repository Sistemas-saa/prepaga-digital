-- Transactional smoke test against a populated test database.
-- Creates temporary commission configuration, exercises the full lifecycle,
-- and rolls everything back. It must never be run against production.
BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_manager_id uuid;
  v_salesperson_id uuid;
  v_sale_id uuid;
  v_plan_id uuid;
  v_sale_date date;
  v_plan_rule_id uuid;
  v_salesperson_rule_id uuid;
  v_resolved_rule_id uuid;
  v_resolved_percent numeric;
  v_period_id uuid;
  v_status text;
  v_total numeric;
  v_error_code text;
  v_annul_blocked boolean := false;
BEGIN
  SELECT s.company_id, s.salesperson_id, s.id, s.plan_id, s.sale_date
    INTO v_company_id, v_salesperson_id, v_sale_id, v_plan_id, v_sale_date
  FROM public.sales s
  JOIN public.profiles sp ON sp.id = s.salesperson_id
    AND sp.company_id = s.company_id AND sp.is_active
  JOIN public.user_roles seller_role ON seller_role.user_id = s.salesperson_id
    AND seller_role.role = 'vendedor'::public.app_role
  JOIN public.clients c ON c.id = s.client_id
  JOIN public.plans pl ON pl.id = s.plan_id AND pl.company_id = s.company_id
  WHERE s.status::text = 'completado'
    AND s.sale_date IS NOT NULL
    AND s.total_amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_items ci
      JOIN public.commission_periods cp ON cp.id = ci.period_id
      WHERE ci.sale_id = s.id AND cp.status <> 'anulada'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_salespeople cs
      WHERE cs.company_id = s.company_id AND cs.salesperson_id = s.salesperson_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_plan_settings ps
      WHERE ps.company_id = s.company_id AND ps.plan_id = s.plan_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_rules cr WHERE cr.company_id = s.company_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sales other
      WHERE other.salesperson_id = s.salesperson_id
        AND other.sale_date = s.sale_date
        AND other.status::text = 'completado'
        AND other.id <> s.id
    )
  ORDER BY s.sale_date DESC, s.id
  LIMIT 1;

  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'No isolated completed sale is available for commission lifecycle test';
  END IF;

  SELECT ur.user_id INTO v_manager_id
  FROM public.user_roles ur
  JOIN public.profiles manager ON manager.id = ur.user_id
  WHERE manager.company_id = v_company_id
    AND manager.is_active
    AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
  ORDER BY CASE WHEN ur.role = 'super_admin'::public.app_role THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_manager_id IS NULL THEN
    RAISE EXCEPTION 'No active admin is available for commission lifecycle test';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_manager_id::text, true);

  INSERT INTO public.commission_settings (
    company_id, accrual_event, liquidation_prefix, next_liquidation_number, is_enabled
  ) VALUES (v_company_id, 'venta_completada', 'TEST-ROLLBACK-', 1, true)
  ON CONFLICT (company_id) DO UPDATE SET
    accrual_event = EXCLUDED.accrual_event,
    liquidation_prefix = EXCLUDED.liquidation_prefix,
    next_liquidation_number = EXCLUDED.next_liquidation_number,
    is_enabled = EXCLUDED.is_enabled;


  INSERT INTO public.commission_salespeople (
    company_id, salesperson_id, is_active
  ) VALUES (v_company_id, v_salesperson_id, true);

  INSERT INTO public.commission_plan_settings (company_id, plan_id, group_type, is_active)
  VALUES (v_company_id, v_plan_id, 'INDIVIDUAL', true);

  INSERT INTO public.commission_rules (
    company_id, plan_id, calc_mode, percent, base, valid_from, priority, is_active, created_by
  ) VALUES (
    v_company_id, v_plan_id, 'percent', 10, 'sale_total_amount', v_sale_date, 100, true, v_manager_id
  ) RETURNING id INTO v_plan_rule_id;

  INSERT INTO public.commission_rules (
    company_id, salesperson_id, calc_mode, percent, base, valid_from, priority, is_active, created_by
  ) VALUES (
    v_company_id, v_salesperson_id, 'percent', 20, 'sale_total_amount', v_sale_date, 100, true, v_manager_id
  ) RETURNING id INTO v_salesperson_rule_id;

  SELECT r.rule_id, r.percent INTO v_resolved_rule_id, v_resolved_percent
  FROM public.commission_resolve_rule(v_sale_id) r;

  IF v_resolved_rule_id IS DISTINCT FROM v_salesperson_rule_id OR v_resolved_percent <> 20 THEN
    RAISE EXCEPTION 'Salesperson rule did not win precedence: rule %, percent %',
      v_resolved_rule_id, v_resolved_percent;
  END IF;

  v_period_id := public.commission_generate_period(
    v_company_id, v_salesperson_id, v_sale_date, v_sale_date,
    'COMISION TEST ROLLBACK', 'Transactional smoke test'
  );

  IF (SELECT count(*) FROM public.commission_items WHERE period_id = v_period_id) <> 1 THEN
    RAISE EXCEPTION 'Generated period does not contain exactly one item';
  END IF;

  IF (SELECT rule_id FROM public.commission_items WHERE period_id = v_period_id)
     IS DISTINCT FROM v_salesperson_rule_id THEN
    RAISE EXCEPTION 'Generated snapshot does not use the expected salesperson rule';
  END IF;

  SELECT status, total_amount INTO v_status, v_total
  FROM public.commission_close_period(v_period_id);
  IF v_status <> 'cerrada' OR v_total <= 0 THEN
    RAISE EXCEPTION 'Close transition failed: status %, total %', v_status, v_total;
  END IF;

  SELECT status INTO v_status
  FROM public.commission_annul_period(v_period_id, 'Transactional annulment test');
  IF v_status <> 'anulada' THEN
    RAISE EXCEPTION 'Valid annul transition failed: status %', v_status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commission_items
    WHERE period_id = v_period_id AND is_settled
  ) THEN
    RAISE EXCEPTION 'Annulled period retained settled items';
  END IF;

  v_period_id := public.commission_generate_period(
    v_company_id, v_salesperson_id, v_sale_date, v_sale_date,
    'COMISION TEST ROLLBACK 2', 'Regeneration after annulment'
  );
  PERFORM public.commission_close_period(v_period_id);

  SELECT status INTO v_status FROM public.commission_pay_period(v_period_id);
  IF v_status <> 'pagada' THEN
    RAISE EXCEPTION 'Pay transition failed: status %', v_status;
  END IF;

  BEGIN
    PERFORM public.commission_annul_period(v_period_id, 'must be rejected');
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_annul_blocked := true;
  END;
  IF NOT v_annul_blocked THEN
    RAISE EXCEPTION 'Paid period was unexpectedly annulled';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commission_items
    WHERE period_id = v_period_id AND NOT is_settled
  ) THEN
    RAISE EXCEPTION 'Paid period contains an unsettled item';
  END IF;

  -- ---------------------------------------------------------------------
  -- Porcentaje por defecto del vendedor: se usa SOLO cuando ninguna regla
  -- aplica, y la regla siempre le gana.
  -- ---------------------------------------------------------------------
  UPDATE public.commission_rules SET is_active = false WHERE company_id = v_company_id;

  -- Sin reglas y sin porcentaje por defecto -> no_rule (nunca 0% implicito).
  UPDATE public.commission_salespeople SET default_percent = NULL
  WHERE company_id = v_company_id AND salesperson_id = v_salesperson_id;

  SELECT r.error_code INTO v_error_code
  FROM public.commission_calculate_sale(v_sale_id) r;
  IF v_error_code IS DISTINCT FROM 'no_rule' THEN
    RAISE EXCEPTION 'Sin regla y sin default se esperaba no_rule, se obtuvo %', v_error_code;
  END IF;

  -- Con porcentaje por defecto -> calcula, sin regla asociada.
  UPDATE public.commission_salespeople
     SET default_percent = 7, default_base = 'sale_total_amount'
   WHERE company_id = v_company_id AND salesperson_id = v_salesperson_id;

  SELECT r.error_code, r.percent, r.rule_id
    INTO v_error_code, v_resolved_percent, v_resolved_rule_id
  FROM public.commission_calculate_sale(v_sale_id) r;
  IF v_error_code IS NOT NULL OR v_resolved_percent <> 7 OR v_resolved_rule_id IS NOT NULL THEN
    RAISE EXCEPTION 'Default del vendedor no aplico: error %, percent %, rule %',
      v_error_code, v_resolved_percent, v_resolved_rule_id;
  END IF;

  -- Con una regla vigente, la regla manda sobre el default.
  UPDATE public.commission_rules SET is_active = true
   WHERE id = v_salesperson_rule_id;

  SELECT r.percent, r.rule_id INTO v_resolved_percent, v_resolved_rule_id
  FROM public.commission_calculate_sale(v_sale_id) r;
  IF v_resolved_rule_id IS DISTINCT FROM v_salesperson_rule_id OR v_resolved_percent <> 20 THEN
    RAISE EXCEPTION 'La regla no gano sobre el default: rule %, percent %',
      v_resolved_rule_id, v_resolved_percent;
  END IF;

  RAISE NOTICE 'commission lifecycle test: OK (todas las aserciones pasaron)';
END $$;

ROLLBACK;
