-- =====================================================================
-- Verificación de la ACTIVACIÓN AUTOMÁTICA de una incorporación
--
--   Proyecto: ykducvvcjzdpoojxlsig  (Supabase US test)
--   ⚠️ NO correr en producción BR (ejiycfqxgtrzaysgpzmx).
--
-- QUÉ HACE
-- Toma la venta-operación ANX-2026-000001 (creada desde la UI con 2
-- adherentes de prueba), la pasa a 'completado' —que es lo que hace el
-- trigger auto_advance_sale_status cuando se completa la última firma— y
-- comprueba que:
--   1. los 2 adherentes se sumen al contrato madre 2026-000024
--   2. las 2 filas de adherent_incorporations queden 'completed'
--   3. la cuota mensual del grupo se recalcule: 775.000 + 350.000 = 1.125.000
--   4. no salte el 42501 del guard de contratos firmados
--
-- TODO DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK: no deja ningún
-- cambio en la base y no dispara ningún WhatsApp (el envío lo hace el
-- front/edge function, no la base).
--
-- Pegar entero en el SQL Editor y ejecutar. Al final imprime el resultado
-- por RAISE NOTICE (pestaña "Messages" / logs).
-- =====================================================================

BEGIN;

DO $verificacion$
DECLARE
  c_op_id     uuid := '549e2b34-301e-41fa-a143-55fd3b3dafbe';  -- ANX-2026-000001
  c_madre_id  uuid := '68c704f5-4866-46f6-af3b-690401904b04';  -- 2026-000024

  v_benef_antes    integer;
  v_benef_despues  integer;
  v_total_antes    numeric;
  v_total_despues  numeric;
  v_completadas    integer;
  v_sin_activar    integer;
  v_op_status      text;
  v_fallas         integer := 0;
  r                record;
BEGIN
  -- ---------------------------------------------------------------------
  -- Estado inicial
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO v_benef_antes FROM public.beneficiaries WHERE sale_id = c_madre_id;
  SELECT total_amount INTO v_total_antes FROM public.sales WHERE id = c_madre_id;

  RAISE NOTICE '--- ANTES ---';
  RAISE NOTICE 'contrato madre: % beneficiarios, total %', v_benef_antes, v_total_antes;

  -- ---------------------------------------------------------------------
  -- Disparo: la venta-operación pasa a 'completado'.
  -- Es exactamente lo que hace auto_advance_sale_status al completarse la
  -- última firma, sin necesidad de firmar de verdad.
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'completado' WHERE id = c_op_id;

  -- ---------------------------------------------------------------------
  -- Estado final
  -- ---------------------------------------------------------------------
  SELECT count(*) INTO v_benef_despues FROM public.beneficiaries WHERE sale_id = c_madre_id;
  SELECT total_amount INTO v_total_despues FROM public.sales WHERE id = c_madre_id;
  SELECT status INTO v_op_status FROM public.sales WHERE id = c_op_id;

  SELECT count(*) FILTER (WHERE status = 'completed'),
         count(*) FILTER (WHERE activated_beneficiary_id IS NULL)
    INTO v_completadas, v_sin_activar
  FROM public.adherent_incorporations WHERE operation_sale_id = c_op_id;

  RAISE NOTICE '--- DESPUES ---';
  RAISE NOTICE 'contrato madre: % beneficiarios, total %', v_benef_despues, v_total_despues;
  RAISE NOTICE 'venta-operacion: status=%', v_op_status;
  RAISE NOTICE 'incorporaciones completed=%, sin activar=%', v_completadas, v_sin_activar;

  -- ---------------------------------------------------------------------
  -- Chequeos
  -- ---------------------------------------------------------------------
  IF v_benef_despues <> v_benef_antes + 2 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 1: se esperaban % beneficiarios y hay %', v_benef_antes + 2, v_benef_despues;
  ELSE
    RAISE NOTICE 'OK 1: los 2 adherentes se sumaron al contrato madre';
  END IF;

  IF v_completadas <> 2 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 2: se esperaban 2 incorporaciones completed y hay %', v_completadas;
  ELSE
    RAISE NOTICE 'OK 2: las 2 incorporaciones quedaron completed';
  END IF;

  IF v_sin_activar <> 0 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 3: quedaron % incorporaciones sin activated_beneficiary_id', v_sin_activar;
  ELSE
    RAISE NOTICE 'OK 3: las 2 tienen activated_beneficiary_id';
  END IF;

  IF v_total_despues <> v_total_antes + 350000 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 4: total esperado % y quedo %', v_total_antes + 350000, v_total_despues;
  ELSE
    RAISE NOTICE 'OK 4: cuota del grupo recalculada a % (era %)', v_total_despues, v_total_antes;
  END IF;

  -- Los datos del formulario en papel tienen que haber viajado al contrato.
  FOR r IN
    SELECT first_name, last_name, dni, relationship, amount, immediate_coverage,
           entry_date, address, barrio, phone, is_primary, signature_required
      FROM public.beneficiaries
     WHERE sale_id = c_madre_id AND last_name = 'CLAUDEQA'
     ORDER BY first_name
  LOOP
    RAISE NOTICE 'adherente activado: % % | CI % | % | % | V.I.=% | ingreso % | % - % | tel %',
      r.first_name, r.last_name, r.dni, r.relationship, r.amount,
      r.immediate_coverage, r.entry_date, r.address, r.barrio, r.phone;

    IF r.is_primary IS NOT FALSE OR r.signature_required IS NOT FALSE THEN
      v_fallas := v_fallas + 1;
      RAISE WARNING 'FALLA 5: % quedo is_primary=% signature_required=%',
        r.first_name, r.is_primary, r.signature_required;
    END IF;
    IF r.address IS NULL OR r.barrio IS NULL OR r.entry_date IS NULL THEN
      v_fallas := v_fallas + 1;
      RAISE WARNING 'FALLA 6: % perdio domicilio/barrio/fecha de ingreso al activarse', r.first_name;
    END IF;
  END LOOP;

  IF v_fallas = 0 THEN
    RAISE NOTICE '=== RESULTADO: OK — la activacion automatica funciona end-to-end ===';
  ELSE
    RAISE NOTICE '=== RESULTADO: % falla(s) ===', v_fallas;
  END IF;
END
$verificacion$;

-- Nada de lo anterior queda: es sólo una verificación.
ROLLBACK;
