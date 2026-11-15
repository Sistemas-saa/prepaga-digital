-- Fix: commission_list_salespeople devolvía HTTP 400 en el frontend.
--
-- Causa: la función declara `email text` en su RETURNS TABLE, pero
-- `public.profiles.email` es `character varying`. En PL/pgSQL, RETURN QUERY
-- exige coincidencia exacta de tipos y lanza:
--
--   ERROR: structure of query does not match function result type
--   DETAIL: Returned type character varying does not match expected type
--           text in column 3.
--
-- SQLSTATE 42804, que PostgREST traduce a HTTP 400. Por eso el selector de
-- "Vendedor" en Comisiones > Nueva liquidación quedaba vacío y la consola se
-- llenaba de 400 sobre /rpc/commission_list_salespeople.
--
-- Solución: castear explícitamente a ::text las columnas que provienen de
-- tablas legacy con varchar. Sólo cambia el cast; la lógica, los permisos y
-- la firma de la función quedan idénticos.
--
-- NOTA: se mantiene el JOIN por `ur.user_id = p.id` tal como estaba, para no
-- alterar la semántica en un módulo contable sin decisión explícita. Ver el
-- riesgo documentado en docs/PLAN-COMISIONES.md sobre profiles.id vs
-- profiles.user_id.

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
  RETURN QUERY SELECT
    p.id,
    btrim(concat_ws(' ', p.first_name, p.last_name))::text,
    p.email::text,
    COALESCE(cs.is_active, false),
    pt.id,
    pt.code::text,
    pt.name::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  LEFT JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.company_id = cs.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

-- Los permisos no se recrean: CREATE OR REPLACE conserva los GRANT/REVOKE
-- existentes (REVOKE de PUBLIC/anon, GRANT EXECUTE a authenticated).
