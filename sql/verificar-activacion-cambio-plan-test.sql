-- =====================================================================
-- Verificación de la ACTIVACIÓN AUTOMÁTICA de un cambio de plan
--
--   Proyecto: ykducvvcjzdpoojxlsig  (Supabase US test)
--   ⚠️ NO correr en producción BR (ejiycfqxgtrzaysgpzmx).
--
-- QUÉ HACE
-- Toma la venta-operación CMB-2026-000001 (creada desde la UI sobre el
-- contrato madre 2026-000024), la pasa a 'completado' —que es lo que hace
-- el trigger auto_advance_sale_status al completarse la última firma— y
-- comprueba que en el CONTRATO MADRE:
--   1. cambie el plan de Beta a Alfa
--   2. se aplique contract_start_date = 2026-09-01
--   3. el titular pase de 275.000 a 350.000
--   4. los 2 adherentes pasen a 240.000 y 400.000
--   5. la cuota del grupo se recalcule de 775.000 a 990.000
--   6. NO salte el 42501 del guard de beneficiarios de contratos firmados
--      (activate_plan_change usa set_config para eximirse)
--
-- TODO DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK: no deja ningún
-- cambio y no dispara ningún WhatsApp.
--
-- Pegar entero en el SQL Editor. El resultado sale por RAISE NOTICE.
-- =====================================================================

BEGIN;

DO $verificacion$
DECLARE
  c_op_id     uuid := '75600e18-482c-42ff-aeab-8b443f819137';  -- CMB-2026-000001
  c_madre_id  uuid := '68c704f5-4866-46f6-af3b-690401904b04';  -- 2026-000024

  v_plan_antes     text;
  v_plan_despues   text;
  v_fecha_despues  date;
  v_titular_antes  numeric;
  v_titular_desp   numeric;
  v_total_antes    numeric;
  v_total_desp     numeric;
  v_pc_status      text;
  v_pc_completed   timestamptz;
  v_fallas         integer := 0;
  r                record;
BEGIN
  SELECT p.name, s.titular_amount, s.total_amount
    INTO v_plan_antes, v_titular_antes, v_total_antes
  FROM public.sales s LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.id = c_madre_id;

  RAISE NOTICE '--- ANTES --- plan=% titular=% total=%', v_plan_antes, v_titular_antes, v_total_antes;

  -- Disparo de la activación.
  UPDATE public.sales SET status = 'completado' WHERE id = c_op_id;

  SELECT p.name, s.contract_start_date, s.titular_amount, s.total_amount
    INTO v_plan_despues, v_fecha_despues, v_titular_desp, v_total_desp
  FROM public.sales s LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.id = c_madre_id;

  SELECT status, completed_at INTO v_pc_status, v_pc_completed
  FROM public.plan_changes WHERE operation_sale_id = c_op_id;

  RAISE NOTICE '--- DESPUES --- plan=% inicio=% titular=% total=%',
    v_plan_despues, v_fecha_despues, v_titular_desp, v_total_desp;
  RAISE NOTICE 'plan_changes: status=% completed_at=%', v_pc_status, v_pc_completed;

  IF v_plan_despues <> 'Alfa' THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 1: el plan quedo en % (se esperaba Alfa)', v_plan_despues;
  ELSE
    RAISE NOTICE 'OK 1: el contrato madre paso de % a %', v_plan_antes, v_plan_despues;
  END IF;

  IF v_fecha_despues <> DATE '2026-09-01' THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 2: contract_start_date quedo en % (se esperaba 2026-09-01)', v_fecha_despues;
  ELSE
    RAISE NOTICE 'OK 2: contract_start_date = %', v_fecha_despues;
  END IF;

  IF v_titular_desp <> 350000 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 3: titular_amount quedo en % (se esperaba 350000)', v_titular_desp;
  ELSE
    RAISE NOTICE 'OK 3: titular de % a %', v_titular_antes, v_titular_desp;
  END IF;

  FOR r IN
    SELECT first_name, last_name, amount, is_primary
      FROM public.beneficiaries WHERE sale_id = c_madre_id ORDER BY is_primary DESC, first_name
  LOOP
    RAISE NOTICE 'integrante: % % | primary=% | monto %', r.first_name, r.last_name, r.is_primary, r.amount;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.beneficiaries
                  WHERE sale_id = c_madre_id AND first_name LIKE 'Violeta%' AND amount = 240000) THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 4: Violeta no quedo en 240000';
  ELSE
    RAISE NOTICE 'OK 4: Violeta 190000 -> 240000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.beneficiaries
                  WHERE sale_id = c_madre_id AND first_name LIKE 'Elpidio%' AND amount = 400000) THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 5: Elpidio no quedo en 400000';
  ELSE
    RAISE NOTICE 'OK 5: Elpidio 310000 -> 400000';
  END IF;

  IF v_total_desp <> 990000 THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 6: total quedo en % (se esperaba 990000)', v_total_desp;
  ELSE
    RAISE NOTICE 'OK 6: cuota del grupo de % a %', v_total_antes, v_total_desp;
  END IF;

  IF v_pc_status <> 'completed' OR v_pc_completed IS NULL THEN
    v_fallas := v_fallas + 1;
    RAISE WARNING 'FALLA 7: plan_changes quedo status=% completed_at=%', v_pc_status, v_pc_completed;
  ELSE
    RAISE NOTICE 'OK 7: plan_changes completed';
  END IF;

  IF v_fallas = 0 THEN
    RAISE NOTICE '=== RESULTADO: OK — el cambio de plan se aplica end-to-end, sin 42501 ===';
  ELSE
    RAISE NOTICE '=== RESULTADO: % falla(s) ===', v_fallas;
  END IF;
END
$verificacion$;

ROLLBACK;
