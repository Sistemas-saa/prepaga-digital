-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — alinear con BR prod la regla del monto del titular
-- ============================================================================
-- Aplica la migracion 20261109000001 (ya aplicada en BR prod el 2026-11-15 con
-- el pase de la Entrega A): el monto del titular > 0 se exige con un trigger que
-- exime a los anexos (alta_adherente / cambio_plan) y a las ventas a empresa,
-- en lugar del CHECK sales_titular_amount_positive_when_active.
--
-- SOLO PARA US TEST. En BR prod ya esta aplicado: no correrlo ahi (no haria
-- dano, es idempotente, pero no hace falta).
--
-- Que hace:
--   * crea/reemplaza la funcion validate_sales_titular_amount() y su trigger;
--   * borra el CHECK viejo si existe (si US test nunca lo tuvo, no pasa nada);
--   * registra la version 20261109000001 en el historial de migraciones.
-- Que NO hace: no escribe ni borra ninguna venta. El trigger solo mira las
-- ventas que se crean o cambian de estado DESPUES de aplicarlo.
--
-- Ojo: si US test no tenia el CHECK, desde ahora una venta a PERSONA FISICA no
-- puede salir de borrador sin "Monto Titular / Plan" > 0. Es la misma regla que
-- prod, que es justamente el objetivo (que los ensayos sean fieles).
--
-- Como correrlo: pegar el archivo ENTERO en el SQL Editor de US test y Run.
-- Es una sola sentencia DO (atomica) + un SELECT final de verificacion.
-- ============================================================================

DO $aplicar$
BEGIN
  -- replace(chr(13)): el SQL Editor en Windows pega con CRLF.
  EXECUTE replace($m$
CREATE OR REPLACE FUNCTION public.validate_sales_titular_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.status IN ('borrador', 'cancelado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  IF NEW.titular_amount IS NOT NULL AND NEW.titular_amount > 0 THEN
    RETURN NEW;
  END IF;

  -- Venta-operación: el importe es el del anexo, no el de un titular.
  IF COALESCE(NEW.sale_type, '') IN ('alta_adherente', 'cambio_plan') THEN
    RETURN NEW;
  END IF;

  -- Venta a empresa: la empresa no cobra como titular; el total es la nómina.
  IF EXISTS (SELECT 1 FROM public.clients c
              WHERE c.id = NEW.client_id AND c.client_type = 'empresa') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'La venta % no puede pasar a "%" sin monto del titular (titular_amount debe ser mayor a 0).',
                  COALESCE(NEW.contract_number, NEW.id::text), NEW.status
    USING ERRCODE = '23514',
          HINT = 'Cargá el Monto Titular / Plan en la pestaña Básico. Sólo los anexos y las ventas a empresa pueden ir con 0.';
END;
$fn$;

COMMENT ON FUNCTION public.validate_sales_titular_amount() IS
  'Reemplaza al CHECK sales_titular_amount_positive_when_active: fuera de borrador/cancelado/rechazado exige titular_amount > 0, salvo ventas-operación (alta_adherente, cambio_plan) y ventas a empresa.';

REVOKE ALL ON FUNCTION public.validate_sales_titular_amount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sales_validate_titular_amount ON public.sales;
CREATE TRIGGER trg_sales_validate_titular_amount
  BEFORE INSERT OR UPDATE OF status, titular_amount, sale_type, client_id ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_sales_titular_amount();

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_titular_amount_positive_when_active;
$m$, chr(13), '');

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES ('20261109000001', 'sales_titular_amount_exime_operaciones_y_empresa',
            ARRAY['-- aplicada por sql/aplicar-titular-amount-test.sql'])
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$aplicar$;

-- Verificacion: las 4 filas tienen que decir OK.
SELECT 'trigger trg_sales_validate_titular_amount' AS control,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sales'::regclass
                          AND tgname = 'trg_sales_validate_titular_amount' AND NOT tgisinternal)
            THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'funcion validate_sales_titular_amount',
       CASE WHEN to_regprocedure('public.validate_sales_titular_amount()') IS NOT NULL THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'CHECK viejo eliminado',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales'::regclass
                              AND conname = 'sales_titular_amount_positive_when_active')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'version 20261109000001 registrada',
       CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
              OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261109000001')
            THEN 'OK' ELSE 'FALTA' END;
