-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — alinear con PRODUCCION: FK sales -> profiles
-- ============================================================================
-- POR QUE
--   `SaleTemplatesTab.handleSendDocuments` consulta la venta con el embed
--   PostgREST  `salesperson:salesperson_id(first_name, last_name)`  para poder
--   resolver  {{vendedor_nombre}}  ("Vendedor/a: ..." al pie del contrato).
--
--   En PRODUCCION (ejiycfqxgtrzaysgpzmx) eso funciona porque existe:
--       fk_sales_salesperson  FOREIGN KEY (salesperson_id) REFERENCES profiles(id)
--
--   En US TEST esa FK NO existe (solo esta la de auth.users), asi que PostgREST
--   responde:
--       "Could not find a relationship between 'sales' and 'salesperson_id'
--        in the schema cache"
--   y el boton "Enviar Documentos para Firma" falla en silencio: no crea ni un
--   documento ni un signature_link. O sea, en TEST no se puede completar el
--   flujo de firma con el codigo actual del repo.
--
-- QUE HACE
--   Agrega la MISMA constraint que ya tiene produccion. No borra ni modifica
--   datos. Verificado antes de escribir esto: 0 ventas con salesperson_id
--   huerfano respecto de profiles, asi que la constraint valida sin errores.
--
-- COMO SE APLICA
--   Pegar en el SQL Editor del proyecto US test (ykducvvcjzdpoojxlsig).
--   NO correrlo contra produccion: alli la FK ya existe.
-- ============================================================================

BEGIN;

-- Preflight: abortar si quedaron ventas apuntando a un usuario sin perfil.
DO $$
DECLARE v_huerfanas integer;
BEGIN
  SELECT count(*) INTO v_huerfanas
  FROM public.sales s
  WHERE s.salesperson_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.salesperson_id);

  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION
      'Hay % venta(s) con salesperson_id sin fila en profiles. Corregir esas filas antes de crear la FK.',
      v_huerfanas;
  END IF;
END $$;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS fk_sales_salesperson;

ALTER TABLE public.sales
  ADD CONSTRAINT fk_sales_salesperson
  FOREIGN KEY (salesperson_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;

-- PostgREST cachea el esquema: sin esto el embed sigue fallando hasta el
-- proximo reinicio del servicio.
NOTIFY pgrst, 'reload schema';

-- Verificacion (debe devolver la fila fk_sales_salesperson -> profiles):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.sales'::regclass AND contype = 'f';
