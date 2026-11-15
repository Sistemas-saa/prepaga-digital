-- Commission RLS and explicit grants. Anonymous users receive no access.

CREATE OR REPLACE FUNCTION public.commission_can_read_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.get_user_company_id((SELECT auth.uid())) = p_company_id
      AND (
        public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'financiero'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'supervisor'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'auditor'::public.app_role)
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.commission_can_write_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.get_user_company_id((SELECT auth.uid())) = p_company_id
      AND (
        public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'financiero'::public.app_role)
      )
    )
  )
$$;

ALTER TABLE public.commission_promoter_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_salespeople ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_plan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_promoter_types_read ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_read ON public.commission_promoter_types FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_promoter_types_write ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_write ON public.commission_promoter_types FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_salespeople_read ON public.commission_salespeople;
CREATE POLICY commission_salespeople_read ON public.commission_salespeople FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id) OR salesperson_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS commission_salespeople_write ON public.commission_salespeople;
CREATE POLICY commission_salespeople_write ON public.commission_salespeople FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_plan_settings_read ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_read ON public.commission_plan_settings FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_plan_settings_write ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_write ON public.commission_plan_settings FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_rules_read ON public.commission_rules;
CREATE POLICY commission_rules_read ON public.commission_rules FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
CREATE POLICY commission_rules_write ON public.commission_rules FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_settings_read ON public.commission_settings;
CREATE POLICY commission_settings_read ON public.commission_settings FOR SELECT TO authenticated
USING (
  public.commission_can_read_company(company_id)
  OR (
    public.get_user_company_id((SELECT auth.uid())) = company_id
    AND public.has_role((SELECT auth.uid()), 'vendedor'::public.app_role)
  )
);
DROP POLICY IF EXISTS commission_settings_write ON public.commission_settings;
CREATE POLICY commission_settings_write ON public.commission_settings FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_periods_staff_read ON public.commission_periods;
CREATE POLICY commission_periods_staff_read ON public.commission_periods FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_periods_salesperson_read ON public.commission_periods;
CREATE POLICY commission_periods_salesperson_read ON public.commission_periods FOR SELECT TO authenticated
USING (salesperson_id = (SELECT auth.uid()) AND status IN ('cerrada', 'pagada'));

DROP POLICY IF EXISTS commission_items_staff_read ON public.commission_items;
CREATE POLICY commission_items_staff_read ON public.commission_items FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_items_salesperson_read ON public.commission_items;
CREATE POLICY commission_items_salesperson_read ON public.commission_items FOR SELECT TO authenticated
USING (
  salesperson_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.commission_periods p
    WHERE p.id = period_id AND p.status IN ('cerrada', 'pagada')
  )
);

REVOKE ALL ON TABLE public.commission_promoter_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_salespeople FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_plan_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_periods FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_items FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_promoter_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_salespeople TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_plan_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_settings TO authenticated;
GRANT SELECT ON TABLE public.commission_periods TO authenticated;
GRANT SELECT ON TABLE public.commission_items TO authenticated;

REVOKE ALL ON FUNCTION public.commission_can_read_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_can_write_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_can_read_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_can_write_company(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.commission_resolve_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_preview(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_close_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_annul_period(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_pay_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_list_salespeople(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.commission_resolve_rule(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.commission_close_period(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_annul_period(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.commission_pay_period(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM anon;
