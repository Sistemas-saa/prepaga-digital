-- Commission module integrity, cross-company isolation and accounting guards.

CREATE OR REPLACE FUNCTION public.commission_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_validate_configuration_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_salespeople' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
    SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission promoter type must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_plan_settings' THEN
    SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission plan must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_rules' THEN
    IF NEW.salesperson_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule salesperson must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.promoter_type_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule promoter type must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.plan_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule plan must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
    SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period promoter type must belong to the same company' USING ERRCODE = '23514';
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
    SELECT company_id INTO v_company_id FROM public.commission_rules WHERE id = NEW.rule_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission item rule must belong to the same company' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_require_rpc_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.commission_rpc_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION '% may only be mutated through commission RPCs', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'commission_items' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'is_settled') IS DISTINCT FROM (to_jsonb(OLD) - 'is_settled') THEN
    RAISE EXCEPTION 'commission item snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commission_promoter_types_touch_updated_at ON public.commission_promoter_types;
CREATE TRIGGER commission_promoter_types_touch_updated_at BEFORE UPDATE ON public.commission_promoter_types
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_salespeople_touch_updated_at ON public.commission_salespeople;
CREATE TRIGGER commission_salespeople_touch_updated_at BEFORE UPDATE ON public.commission_salespeople
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_plan_settings_touch_updated_at ON public.commission_plan_settings;
CREATE TRIGGER commission_plan_settings_touch_updated_at BEFORE UPDATE ON public.commission_plan_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_rules_touch_updated_at ON public.commission_rules;
CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_settings_touch_updated_at ON public.commission_settings;
CREATE TRIGGER commission_settings_touch_updated_at BEFORE UPDATE ON public.commission_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();

DROP TRIGGER IF EXISTS commission_salespeople_validate_company ON public.commission_salespeople;
CREATE TRIGGER commission_salespeople_validate_company BEFORE INSERT OR UPDATE ON public.commission_salespeople
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_plan_settings_validate_company ON public.commission_plan_settings;
CREATE TRIGGER commission_plan_settings_validate_company BEFORE INSERT OR UPDATE ON public.commission_plan_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_rules_validate_company ON public.commission_rules;
CREATE TRIGGER commission_rules_validate_company BEFORE INSERT OR UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_periods_validate_company ON public.commission_periods;
CREATE TRIGGER commission_periods_validate_company BEFORE INSERT OR UPDATE ON public.commission_periods
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_accounting_company();
DROP TRIGGER IF EXISTS commission_items_validate_company ON public.commission_items;
CREATE TRIGGER commission_items_validate_company BEFORE INSERT OR UPDATE ON public.commission_items
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_accounting_company();

DROP TRIGGER IF EXISTS commission_periods_rpc_only ON public.commission_periods;
CREATE TRIGGER commission_periods_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.commission_periods
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();
DROP TRIGGER IF EXISTS commission_items_rpc_only ON public.commission_items;
CREATE TRIGGER commission_items_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.commission_items
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();

REVOKE ALL ON FUNCTION public.commission_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_validate_configuration_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_validate_accounting_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_require_rpc_mutation() FROM PUBLIC;
