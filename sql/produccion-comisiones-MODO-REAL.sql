-- ============================================================================
-- COMISIONES — PASAR DE MODO PRUEBA A MODO REAL (BR prod)
-- ============================================================================
-- Correr SOLO cuando las liquidaciones de prueba cuadren con la planilla manual.
--
-- ANTES: anular desde la pantalla de Comisiones todas las liquidaciones
-- PRUEBA-... (boton Anular, motivo "Liquidacion de prueba"). Anular exige un
-- usuario logueado, por eso no lo hace este script. Anular no borra nada.
--
-- Que hace este script:
--   * aborta si queda alguna liquidacion PRUEBA-... sin anular (y las nombra);
--   * cambia el prefijo a 'LIQ-' y reinicia la numeracion en 1.
-- No toca reglas, vendedores ni configuracion de planes: eso ya quedo cargado.
-- ============================================================================

DO $modo_real$
DECLARE
  v_empresa constant uuid := '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6';
  v_pendientes text;
BEGIN
  SELECT string_agg(liquidation_number || ' (' || status || ')', ', ' ORDER BY liquidation_number)
    INTO v_pendientes
    FROM public.commission_periods
   WHERE company_id = v_empresa AND liquidation_number LIKE 'PRUEBA-%' AND status <> 'anulada';
  IF v_pendientes IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan liquidaciones de prueba sin anular: %. Anularlas desde la pantalla de Comisiones y volver a correr. No se hizo nada.', v_pendientes;
  END IF;

  UPDATE public.commission_settings
     SET liquidation_prefix = 'LIQ-', next_liquidation_number = 1
   WHERE company_id = v_empresa;

  RAISE NOTICE 'Modo real: la proxima liquidacion sera LIQ-000001.';
END
$modo_real$;
