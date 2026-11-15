-- Smoke test transaccional del flujo de CAMBIO DE PLAN.
--
-- Ejercita el circuito completo sobre una base de test poblada y revierte todo
-- al final. NUNCA correr contra producción: va contra US test
-- (ykducvvcjzdpoojxlsig). Verificar el nombre del proyecto antes de ejecutar.
--
-- Qué cubre:
--   1. venta cerrada como contrato madre, con titular + un adherente
--   2. cambio de plan aplicado por trigger al pasar la operación a 'completado'
--      (plan_id, contract_start_date, titular_amount, monto del adherente)
--   3. recálculo de la cuota mensual del grupo
--   4. idempotencia: reactivar no vuelve a aplicar
--   5. entradas malformadas en members_snapshot se IGNORAN sin abortar la firma
--   6. una operación 'cancelled' no se aplica aunque la venta llegue a 'completado'
--   7. puerta de salida: una venta normal no dispara nada
--   8. el guard de contratos firmados (42501) no bloquea la activación
BEGIN;

DO $$
DECLARE
  v_company_id      uuid;
  v_client_id       uuid;
  v_plan_viejo      uuid;
  v_plan_nuevo      uuid;
  v_salesperson_id  uuid;

  v_parent_id       uuid;
  v_ben_id          uuid;
  v_op_id           uuid;
  v_pc_id           uuid;

  v_plan_actual     uuid;
  v_fecha_actual    date;
  v_titular_amount  numeric;
  v_ben_amount      numeric;
  v_total           numeric;
  v_pc_status       text;
  v_pc_completed    timestamptz;

  v_op_mal_id       uuid;
  v_pc_mal_id       uuid;
  v_op_canc_id      uuid;
  v_pc_canc_id      uuid;
  v_normal_id       uuid;
  v_pc_normal_id    uuid;

  -- Montos distintivos para poder rastrear el efecto en el total.
  c_titular_viejo   numeric := 300000;
  c_ben_viejo       numeric := 200000;
  c_titular_nuevo   numeric := 450000;
  c_ben_nuevo       numeric := 250000;
  c_fecha_nueva     date    := (CURRENT_DATE + INTERVAL '30 days')::date;
BEGIN
  -- ---------------------------------------------------------------------
  -- 0. Preflight: el vocabulario que escribe el CÓDIGO tiene que ser el que
  --    acepta la BASE. Se chequea primero para fallar con un mensaje útil en
  --    vez de un 23514 críptico a mitad del test.
  --
  --    Valores que usa el código hoy:
  --      status 'draft'/'cancelled'  -> usePlanChanges.ts
  --      reason  'separacion' | 'mayor_cobertura' | 'menor_cobertura'
  -- ---------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plan_changes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%draft%'
  ) THEN
    RAISE EXCEPTION 'Preflight: plan_changes no tiene el CHECK de status esperado';
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. Datos base. Se toman dos planes DISTINTOS de la misma empresa para
  --    poder verificar el cambio; si la base de test no tiene dos, el test
  --    aborta con un mensaje claro en vez de dar un falso OK.
  -- ---------------------------------------------------------------------
  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at LIMIT 1;
  SELECT id INTO v_client_id  FROM public.clients WHERE company_id = v_company_id LIMIT 1;
  SELECT user_id INTO v_salesperson_id FROM public.profiles WHERE company_id = v_company_id LIMIT 1;

  SELECT id INTO v_plan_viejo FROM public.plans WHERE company_id = v_company_id ORDER BY created_at LIMIT 1;
  SELECT id INTO v_plan_nuevo FROM public.plans
   WHERE company_id = v_company_id AND id <> v_plan_viejo ORDER BY created_at LIMIT 1;

  IF v_company_id IS NULL OR v_client_id IS NULL OR v_plan_viejo IS NULL OR v_plan_nuevo IS NULL THEN
    RAISE EXCEPTION 'Preflight: la base de test no tiene empresa/cliente/2 planes para armar el escenario';
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. Contrato madre FIRMADO, con titular + un adherente.
  --    Firmado a propósito: así el test también prueba que el guard
  --    trg_beneficiaries_block_when_sale_signed (42501) no rompe la activación.
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (
    company_id, client_id, plan_id, salesperson_id, sale_type, status,
    titular_amount, total_amount, sale_date, contract_start_date
  ) VALUES (
    v_company_id, v_client_id, v_plan_viejo, v_salesperson_id, 'venta_nueva', 'firmado',
    c_titular_viejo, c_titular_viejo + c_ben_viejo, CURRENT_DATE, CURRENT_DATE
  ) RETURNING id INTO v_parent_id;

  INSERT INTO public.beneficiaries (
    sale_id, first_name, last_name, dni, relationship, is_primary, amount
  ) VALUES (
    v_parent_id, 'TEST-PC', 'Adherente', '9999101', 'Hijo/a', false, c_ben_viejo
  ) RETURNING id INTO v_ben_id;

  -- ---------------------------------------------------------------------
  -- 3. Venta-operación + cambio de plan en 'draft'.
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (
    company_id, client_id, plan_id, salesperson_id, sale_type, status,
    total_amount, sale_date
  ) VALUES (
    v_company_id, v_client_id, v_plan_nuevo, v_salesperson_id, 'cambio_plan', 'borrador',
    c_titular_nuevo + c_ben_nuevo, CURRENT_DATE
  ) RETURNING id INTO v_op_id;

  INSERT INTO public.plan_changes (
    company_id, client_id, operation_sale_id, parent_sale_id,
    previous_plan_id, new_plan_id, reason, titular_name,
    new_contract_start_date, members_snapshot, status
  ) VALUES (
    v_company_id, v_client_id, v_op_id, v_parent_id,
    v_plan_viejo, v_plan_nuevo, 'mayor_cobertura', 'TEST-PC Titular',
    c_fecha_nueva,
    jsonb_build_array(
      jsonb_build_object('beneficiary_id', NULL, 'is_primary', true,
                         'name', 'TEST-PC Titular', 'new_amount', c_titular_nuevo),
      jsonb_build_object('beneficiary_id', v_ben_id, 'is_primary', false,
                         'name', 'TEST-PC Adherente', 'new_amount', c_ben_nuevo)
    ),
    'draft'
  ) RETURNING id INTO v_pc_id;

  -- ---------------------------------------------------------------------
  -- 4. Activación: la venta-operación pasa a 'completado'.
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'completado' WHERE id = v_op_id;

  SELECT plan_id, contract_start_date, titular_amount, total_amount
    INTO v_plan_actual, v_fecha_actual, v_titular_amount, v_total
  FROM public.sales WHERE id = v_parent_id;

  IF v_plan_actual IS DISTINCT FROM v_plan_nuevo THEN
    RAISE EXCEPTION 'El contrato madre no tomó el plan nuevo (esperado %, quedó %)', v_plan_nuevo, v_plan_actual;
  END IF;

  IF v_fecha_actual IS DISTINCT FROM c_fecha_nueva THEN
    RAISE EXCEPTION 'contract_start_date no se aplicó (esperado %, quedó %)', c_fecha_nueva, v_fecha_actual;
  END IF;

  IF v_titular_amount IS DISTINCT FROM c_titular_nuevo THEN
    RAISE EXCEPTION 'titular_amount no se aplicó (esperado %, quedó %)', c_titular_nuevo, v_titular_amount;
  END IF;

  SELECT amount INTO v_ben_amount FROM public.beneficiaries WHERE id = v_ben_id;
  IF v_ben_amount IS DISTINCT FROM c_ben_nuevo THEN
    RAISE EXCEPTION 'El monto del adherente no se aplicó (esperado %, quedó %)', c_ben_nuevo, v_ben_amount;
  END IF;

  -- La cuota del grupo la calcula SÓLO la base (bug conocido #10 de CLAUDE.md).
  IF v_total IS DISTINCT FROM (c_titular_nuevo + c_ben_nuevo) THEN
    RAISE EXCEPTION 'total_amount mal recalculado (esperado %, quedó %)',
      c_titular_nuevo + c_ben_nuevo, v_total;
  END IF;

  SELECT status, completed_at INTO v_pc_status, v_pc_completed
  FROM public.plan_changes WHERE id = v_pc_id;
  IF v_pc_status <> 'completed' OR v_pc_completed IS NULL THEN
    RAISE EXCEPTION 'El cambio de plan no quedó completed (status=%, completed_at=%)', v_pc_status, v_pc_completed;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. Idempotencia: volver a tocar la venta-operación no re-aplica nada.
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'firmado'    WHERE id = v_op_id;
  UPDATE public.sales SET status = 'completado' WHERE id = v_op_id;

  SELECT titular_amount, total_amount INTO v_titular_amount, v_total
  FROM public.sales WHERE id = v_parent_id;
  IF v_titular_amount IS DISTINCT FROM c_titular_nuevo
     OR v_total IS DISTINCT FROM (c_titular_nuevo + c_ben_nuevo) THEN
    RAISE EXCEPTION 'La reactivación volvió a aplicar el cambio (titular=%, total=%)', v_titular_amount, v_total;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. members_snapshot malformado: se ignora, NUNCA aborta la firma.
  --    Es el caso que más importa: un snapshot roto no puede impedir que la
  --    venta pase a 'completado'.
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (
    company_id, client_id, plan_id, salesperson_id, sale_type, status, total_amount, sale_date
  ) VALUES (
    v_company_id, v_client_id, v_plan_viejo, v_salesperson_id, 'cambio_plan', 'borrador', 0, CURRENT_DATE
  ) RETURNING id INTO v_op_mal_id;

  INSERT INTO public.plan_changes (
    company_id, client_id, operation_sale_id, parent_sale_id,
    new_plan_id, reason, titular_name, members_snapshot, status
  ) VALUES (
    v_company_id, v_client_id, v_op_mal_id, v_parent_id,
    v_plan_viejo, 'menor_cobertura', 'TEST-PC Titular',
    jsonb_build_array(
      jsonb_build_object('is_primary', 'si', 'new_amount', '1.500,00'),
      jsonb_build_object('beneficiary_id', 'no-es-uuid', 'is_primary', false, 'new_amount', 999),
      jsonb_build_object('beneficiary_id', NULL, 'is_primary', false, 'new_amount', 999)
    ),
    'draft'
  ) RETURNING id INTO v_pc_mal_id;

  UPDATE public.sales SET status = 'completado' WHERE id = v_op_mal_id;

  SELECT titular_amount INTO v_titular_amount FROM public.sales WHERE id = v_parent_id;
  IF v_titular_amount IS DISTINCT FROM c_titular_nuevo THEN
    RAISE EXCEPTION 'Un snapshot malformado modificó el titular (quedó %)', v_titular_amount;
  END IF;

  SELECT status INTO v_pc_status FROM public.plan_changes WHERE id = v_pc_mal_id;
  IF v_pc_status <> 'completed' THEN
    RAISE EXCEPTION 'El snapshot malformado dejó la operación en % en vez de completed', v_pc_status;
  END IF;

  -- ---------------------------------------------------------------------
  -- 7. Una operación 'cancelled' no se aplica.
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (
    company_id, client_id, plan_id, salesperson_id, sale_type, status, total_amount, sale_date
  ) VALUES (
    v_company_id, v_client_id, v_plan_viejo, v_salesperson_id, 'cambio_plan', 'borrador', 0, CURRENT_DATE
  ) RETURNING id INTO v_op_canc_id;

  INSERT INTO public.plan_changes (
    company_id, client_id, operation_sale_id, parent_sale_id,
    new_plan_id, reason, titular_name, members_snapshot, status
  ) VALUES (
    v_company_id, v_client_id, v_op_canc_id, v_parent_id,
    v_plan_viejo, 'separacion', 'TEST-PC Titular',
    jsonb_build_array(jsonb_build_object('beneficiary_id', NULL, 'is_primary', true, 'new_amount', 1)),
    'cancelled'
  ) RETURNING id INTO v_pc_canc_id;

  UPDATE public.sales SET status = 'completado' WHERE id = v_op_canc_id;

  SELECT titular_amount INTO v_titular_amount FROM public.sales WHERE id = v_parent_id;
  IF v_titular_amount IS DISTINCT FROM c_titular_nuevo THEN
    RAISE EXCEPTION 'Una operación cancelada se aplicó igual (titular quedó %)', v_titular_amount;
  END IF;

  SELECT status INTO v_pc_status FROM public.plan_changes WHERE id = v_pc_canc_id;
  IF v_pc_status <> 'cancelled' THEN
    RAISE EXCEPTION 'La operación cancelada cambió a %', v_pc_status;
  END IF;

  -- ---------------------------------------------------------------------
  -- 8. Puerta de salida: una venta NORMAL no dispara nada.
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (
    company_id, client_id, plan_id, salesperson_id, sale_type, status, total_amount, sale_date
  ) VALUES (
    v_company_id, v_client_id, v_plan_viejo, v_salesperson_id, 'venta_nueva', 'borrador', 0, CURRENT_DATE
  ) RETURNING id INTO v_normal_id;

  INSERT INTO public.plan_changes (
    company_id, client_id, operation_sale_id, parent_sale_id,
    new_plan_id, reason, titular_name, members_snapshot, status
  ) VALUES (
    v_company_id, v_client_id, v_normal_id, v_parent_id,
    v_plan_viejo, 'separacion', 'TEST-PC Titular',
    jsonb_build_array(jsonb_build_object('beneficiary_id', NULL, 'is_primary', true, 'new_amount', 1)),
    'draft'
  ) RETURNING id INTO v_pc_normal_id;

  UPDATE public.sales SET status = 'completado' WHERE id = v_normal_id;

  SELECT status INTO v_pc_status FROM public.plan_changes WHERE id = v_pc_normal_id;
  IF v_pc_status <> 'draft' THEN
    RAISE EXCEPTION 'La puerta de salida falló: una venta normal aplicó el cambio (status=%)', v_pc_status;
  END IF;

  SELECT titular_amount INTO v_titular_amount FROM public.sales WHERE id = v_parent_id;
  IF v_titular_amount IS DISTINCT FROM c_titular_nuevo THEN
    RAISE EXCEPTION 'Una venta normal modificó el contrato madre (titular quedó %)', v_titular_amount;
  END IF;

  RAISE NOTICE 'plan change lifecycle test: OK (8/8 escenarios)';
END $$;

ROLLBACK;
