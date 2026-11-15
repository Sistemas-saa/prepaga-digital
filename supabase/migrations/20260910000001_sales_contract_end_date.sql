-- ============================================================================
-- Fin de vigencia del contrato (sales.contract_end_date)
-- ============================================================================
-- La lista de ventas mostraba "Vence: {signature_expires_at}", que es la
-- expiracion del LINK DE FIRMA, no la vigencia del contrato — por eso todas las
-- filas decian "No definido". Hasta ahora el sistema no registraba en ningun
-- lado hasta cuando esta vigente un contrato, asi que las renovaciones dependian
-- de que alguien se acordara.
--
-- Esta columna pasa a ser la fuente de verdad de la vigencia: la lee la columna
-- VIGENCIA de la pantalla de Ventas (src/lib/vigencia.ts) y el aviso de
-- vencimiento al vendedor (`notify_expiring_sales()`, migracion 20260910000002).
--
-- En US test la columna YA EXISTE con 17 ventas cargadas; en BR produccion no
-- existia. El ADD COLUMN IF NOT EXISTS deja las dos bases en el mismo estado sin
-- tocar los datos existentes.
--
-- Cero impacto: nace NULL y nadie la lee obligatoriamente. Una venta sin fecha
-- de fin simplemente no muestra vigencia y no genera avisos.
--
-- SIN BACKFILL A PROPOSITO. `contract_start_date + 1 year` es una suposicion
-- comercial: aplicada de golpe sobre los contratos historicos dispararia una
-- tanda de avisos falsos en la primera corrida del cron, y el indice unico de
-- 20260910000002 los deja pegados (no hay "des-notificar"). El autocompletado a
-- 12 meses vive en el formulario (SaleBasicTab), donde una persona lo ve y lo
-- puede corregir antes de guardar.
-- ============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS contract_end_date date;

COMMENT ON COLUMN public.sales.contract_end_date IS
  'Fin de vigencia del contrato. Alimenta la columna VIGENCIA de la lista de ventas y el aviso de vencimiento al vendedor (notify_expiring_sales). Se sugiere a 12 meses del inicio desde el formulario, pero es editable.';

-- El job diario filtra por esta columna sobre el universo de ventas cerradas.
-- Parcial porque la mayoria de las filas la tiene en NULL.
CREATE INDEX IF NOT EXISTS idx_sales_contract_end_date
  ON public.sales (contract_end_date)
  WHERE contract_end_date IS NOT NULL;
