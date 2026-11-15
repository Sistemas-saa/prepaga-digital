-- Remove Data API execution from internal SECURITY DEFINER helpers.
-- Supabase projects may have explicit default EXECUTE grants for API roles, so
-- revoking only from PUBLIC is insufficient.

REVOKE ALL ON FUNCTION public.commission_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_validate_configuration_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_validate_accounting_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_require_rpc_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_authorize_company(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;
