-- Preserve the access model while avoiding overlapping permissive policies.

DROP POLICY IF EXISTS commission_promoter_types_write ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_insert ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_update ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_delete ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_insert ON public.commission_promoter_types
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_promoter_types_update ON public.commission_promoter_types
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_promoter_types_delete ON public.commission_promoter_types
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_salespeople_write ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_insert ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_update ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_delete ON public.commission_salespeople;
CREATE POLICY commission_salespeople_insert ON public.commission_salespeople
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_salespeople_update ON public.commission_salespeople
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_salespeople_delete ON public.commission_salespeople
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_plan_settings_write ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_insert ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_update ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_delete ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_insert ON public.commission_plan_settings
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_plan_settings_update ON public.commission_plan_settings
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_plan_settings_delete ON public.commission_plan_settings
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_insert ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_update ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_delete ON public.commission_rules;
CREATE POLICY commission_rules_insert ON public.commission_rules
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_rules_update ON public.commission_rules
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_rules_delete ON public.commission_rules
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_settings_write ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_insert ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_update ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_delete ON public.commission_settings;
CREATE POLICY commission_settings_insert ON public.commission_settings
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_settings_update ON public.commission_settings
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_settings_delete ON public.commission_settings
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_periods_staff_read ON public.commission_periods;
DROP POLICY IF EXISTS commission_periods_salesperson_read ON public.commission_periods;
DROP POLICY IF EXISTS commission_periods_read ON public.commission_periods;
CREATE POLICY commission_periods_read ON public.commission_periods
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR (salesperson_id = (SELECT auth.uid()) AND status IN ('cerrada', 'pagada'))
);

DROP POLICY IF EXISTS commission_items_staff_read ON public.commission_items;
DROP POLICY IF EXISTS commission_items_salesperson_read ON public.commission_items;
DROP POLICY IF EXISTS commission_items_read ON public.commission_items;
CREATE POLICY commission_items_read ON public.commission_items
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR (
    salesperson_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.commission_periods p
      WHERE p.id = period_id AND p.status IN ('cerrada', 'pagada')
    )
  )
);
