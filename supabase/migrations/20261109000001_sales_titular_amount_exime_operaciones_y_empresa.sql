-- ============================================================================
-- Monto del titular > 0: exigirlo sólo donde corresponde
-- ============================================================================
-- BR prod tiene un CHECK que no está en ninguna migración del repo (se creó
-- directo en la base):
--
--   sales_titular_amount_positive_when_active
--   CHECK (status IN ('borrador','cancelado','rechazado')
--          OR (titular_amount IS NOT NULL AND titular_amount > 0))
--
-- Es correcto para una venta a persona física, pero bloquea dos casos que el
-- módulo de anexos y el de empresa crean CON titular_amount NULL/0 a propósito:
--
--   * ventas-operación (sale_type 'alta_adherente' / 'cambio_plan'): no cobran
--     un titular, cobran el anexo; la baja además va en 0;
--   * ventas a EMPRESA (clients.client_type = 'empresa'): la empresa no es
--     beneficiaria de sí misma, titular_amount = 0 y el total es la nómina.
--
-- Con el CHECK, esas ventas no pueden salir de 'borrador': "Enviar documentos"
-- no las pasa a 'enviado' y, peor, la ÚLTIMA firma revienta dentro de
-- auto_advance_sale_status (23514) y el anexo nunca se activa. Se detectó al
-- ensayar el pase sobre un clon de prod (2026-11-09).
--
-- Un CHECK no puede mirar clients, así que la regla pasa a un trigger con la
-- MISMA condición para persona física y las dos excepciones. El trigger se crea
-- ANTES de soltar el CHECK, en la misma transacción: no hay ventana sin regla.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_sales_titular_amount()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: la excepción de empresa lee clients, y quien dispara la
-- actualización puede no ver esa fila por RLS (p. ej. el firmante anónimo vía
-- auto_advance_sale_status). Sólo lee; search_path fijo.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

COMMENT ON FUNCTION public.validate_sales_titular_amount() IS
  'Reemplaza al CHECK sales_titular_amount_positive_when_active: fuera de borrador/cancelado/rechazado exige titular_amount > 0, salvo ventas-operación (alta_adherente, cambio_plan) y ventas a empresa.';

REVOKE ALL ON FUNCTION public.validate_sales_titular_amount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sales_validate_titular_amount ON public.sales;
CREATE TRIGGER trg_sales_validate_titular_amount
  BEFORE INSERT OR UPDATE OF status, titular_amount, sale_type, client_id ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_sales_titular_amount();

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_titular_amount_positive_when_active;
