-- Fix: los importes se calculaban con 2 decimales aunque el guarani es entero.
--
-- Problema: commission_calculate_sale declaraba `v_base numeric(14,2)` y
-- redondeaba a 2 decimales. El frontend en cambio ya formatea PYG con 0
-- decimales (formatCommissionCurrency en src/lib/commissionCurrency.ts).
-- Resultado: los items IMPRESOS no suman el total IMPRESO, porque el total es
-- la suma de valores con centimos y cada linea se muestra redondeada. En una
-- liquidacion eso es un descuadre visible contra el reporte legado, que maneja
-- enteros (43.364 / total 4.164.827).
--
-- Solucion: redondear al numero de decimales de la moneda de la empresa,
-- tomado de company_currency_settings.decimal_places, con DEFAULT 0 (guaranies)
-- cuando no hay fila configurada — hoy la tabla esta vacia. Queda parametrizable
-- para una empresa que opere en otra moneda.
--
-- v_base pasa de numeric(14,2) a numeric para no redondear antes de tiempo:
-- el redondeo ocurre una sola vez, al final, sobre el valor exacto.

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
  v_base numeric;
  v_decimals integer;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  -- Decimales de la moneda de la empresa. Sin fila configurada => 0 (PYG).
  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

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
