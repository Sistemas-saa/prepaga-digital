-- Smoke test transaccional de sales.total_amount y del bloqueo de adherentes.
--
-- Corre sobre una base de test poblada y revierte todo al final. NUNCA correr
-- contra produccion: va contra US test (ykducvvcjzdpoojxlsig). Verificar el
-- nombre del proyecto antes de ejecutar.
--
-- Requiere las migraciones:
--   20260818000001_fix_total_amount_single_source.sql
--   20260818000002_beneficiaries_signed_contract_guard.sql
--
-- Que cubre:
--   1. sin fila primary: total = titular_amount + suma de adherentes
--   2. UPDATE del monto de un adherente recalcula
--   3. DELETE de un adherente recalcula
--   4. sin adherentes: total = titular_amount
--   5. con fila primary: total = suma de TODOS
--   6. primary en 0 NO pisa titular_amount
--   7. contrato firmado: INSERT/UPDATE/DELETE de adherentes rechazado
--   8. la activacion de una incorporacion SI puede escribir en un firmado

BEGIN;

DO $$
DECLARE
  v_company_id     uuid;
  v_client_id      uuid;
  v_plan_id        uuid;
  v_salesperson_id uuid;

  v_sale_id        uuid;
  v_ben_a          uuid;
  v_ben_b          uuid;
  v_primary_id     uuid;

  v_total          numeric;
  v_titular        numeric;
  v_bloqueado      boolean;

  c_titular        numeric := 300000;
  c_monto_a        numeric := 120000;
  c_monto_b        numeric :=  80000;
BEGIN
  -- ---------------------------------------------------------------------
  -- 0. Preflight: sin las migraciones aplicadas el test no prueba nada.
  -- ---------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
       AND pg_get_function_result(p.oid) = 'trigger'
       AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%'
  ) THEN
    RAISE EXCEPTION 'FALTA la migracion 20260818000001: el trigger todavia no delega en la version con argumento';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_beneficiaries_block_when_sale_signed'
       AND tgrelid = 'public.beneficiaries'::regclass AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FALTA la migracion 20260818000002: no existe el trigger de bloqueo';
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. Datos base
  -- ---------------------------------------------------------------------
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  SELECT id INTO v_client_id  FROM public.clients WHERE company_id = v_company_id LIMIT 1;
  SELECT id INTO v_plan_id    FROM public.plans   WHERE company_id = v_company_id LIMIT 1;
  SELECT id INTO v_salesperson_id FROM public.profiles WHERE company_id = v_company_id LIMIT 1;

  IF v_company_id IS NULL OR v_client_id IS NULL OR v_plan_id IS NULL THEN
    RAISE EXCEPTION 'La base de test no tiene empresa/cliente/plan para armar el escenario';
  END IF;

  INSERT INTO public.sales (company_id, client_id, plan_id, salesperson_id,
                            status, sale_date, titular_amount, total_amount)
  VALUES (v_company_id, v_client_id, v_plan_id, v_salesperson_id,
          'borrador', current_date, c_titular, c_titular)
  RETURNING id INTO v_sale_id;

  -- ---------------------------------------------------------------------
  -- 2. SIN fila primary: total = titular_amount + suma de adherentes.
  --    Este es EXACTAMENTE el caso que el trigger viejo calculaba mal: hacia
  --    SUM(amount) a secas y el monto del titular desaparecia del total.
  -- ---------------------------------------------------------------------
  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
  VALUES (v_sale_id, 'Adherente', 'Uno', c_monto_a, false)
  RETURNING id INTO v_ben_a;

  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_titular + c_monto_a THEN
    RAISE EXCEPTION 'CASO 1 (sin primary): esperaba % y quedo %', c_titular + c_monto_a, v_total;
  END IF;

  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
  VALUES (v_sale_id, 'Adherente', 'Dos', c_monto_b, false)
  RETURNING id INTO v_ben_b;

  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_titular + c_monto_a + c_monto_b THEN
    RAISE EXCEPTION 'CASO 1 (dos adherentes): esperaba % y quedo %',
      c_titular + c_monto_a + c_monto_b, v_total;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. UPDATE del monto
  -- ---------------------------------------------------------------------
  UPDATE public.beneficiaries SET amount = c_monto_b * 2 WHERE id = v_ben_b;

  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_titular + c_monto_a + (c_monto_b * 2) THEN
    RAISE EXCEPTION 'CASO 2 (update): esperaba % y quedo %',
      c_titular + c_monto_a + (c_monto_b * 2), v_total;
  END IF;

  -- ---------------------------------------------------------------------
  -- 4. DELETE
  -- ---------------------------------------------------------------------
  DELETE FROM public.beneficiaries WHERE id = v_ben_b;

  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_titular + c_monto_a THEN
    RAISE EXCEPTION 'CASO 3 (delete): esperaba % y quedo %', c_titular + c_monto_a, v_total;
  END IF;

  DELETE FROM public.beneficiaries WHERE id = v_ben_a;

  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_titular THEN
    RAISE EXCEPTION 'CASO 4 (sin adherentes): esperaba % y quedo %', c_titular, v_total;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. CON fila primary: el total es la suma de TODOS, y titular_amount se
  --    sincroniza con el monto del primary.
  -- ---------------------------------------------------------------------
  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
  VALUES (v_sale_id, 'Titular', 'Como Beneficiario', c_titular, true)
  RETURNING id INTO v_primary_id;

  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
  VALUES (v_sale_id, 'Adherente', 'Tres', c_monto_a, false)
  RETURNING id INTO v_ben_a;

  SELECT total_amount, titular_amount INTO v_total, v_titular
  FROM public.sales WHERE id = v_sale_id;

  IF v_total IS DISTINCT FROM c_titular + c_monto_a THEN
    RAISE EXCEPTION 'CASO 5 (con primary): esperaba % y quedo %', c_titular + c_monto_a, v_total;
  END IF;
  IF v_titular IS DISTINCT FROM c_titular THEN
    RAISE EXCEPTION 'CASO 5: titular_amount debia sincronizarse en % y quedo %', c_titular, v_titular;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. Primary en 0 NO pisa titular_amount.
  --    Pasa al crear el primary y olvidarse el monto: sin la guarda, el
  --    titular_amount cargado a mano se perdia.
  -- ---------------------------------------------------------------------
  UPDATE public.beneficiaries SET amount = 0 WHERE id = v_primary_id;

  SELECT titular_amount INTO v_titular FROM public.sales WHERE id = v_sale_id;
  IF v_titular IS DISTINCT FROM c_titular THEN
    RAISE EXCEPTION 'CASO 6: un primary en 0 NO debia pisar titular_amount (quedo %)', v_titular;
  END IF;

  -- ---------------------------------------------------------------------
  -- 7. Contrato firmado: los adherentes quedan de solo lectura.
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'firmado' WHERE id = v_sale_id;

  v_bloqueado := false;
  BEGIN
    INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
    VALUES (v_sale_id, 'No', 'Deberia Entrar', 1000, false);
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'CASO 7: el INSERT sobre un contrato firmado NO fue rechazado';
  END IF;

  v_bloqueado := false;
  BEGIN
    UPDATE public.beneficiaries SET amount = 999 WHERE id = v_ben_a;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'CASO 7: el UPDATE sobre un contrato firmado NO fue rechazado';
  END IF;

  v_bloqueado := false;
  BEGIN
    DELETE FROM public.beneficiaries WHERE id = v_ben_a;
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'CASO 7: el DELETE sobre un contrato firmado NO fue rechazado';
  END IF;

  -- ---------------------------------------------------------------------
  -- 8. Las funciones del sistema SI pueden escribir en un contrato firmado:
  --    es como se incorpora un adherente por anexo. Se simula fijando la
  --    misma GUC que les pone el ALTER FUNCTION ... SET.
  -- ---------------------------------------------------------------------
  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'on', true);

  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, amount, is_primary)
  VALUES (v_sale_id, 'Incorporado', 'Por Anexo', c_monto_b, false)
  RETURNING id INTO v_ben_b;

  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'off', true);

  IF v_ben_b IS NULL THEN
    RAISE EXCEPTION 'CASO 8: la activacion de una incorporacion quedo bloqueada y no deberia';
  END IF;

  -- Y el total siguio recalculandose correctamente.
  SELECT total_amount INTO v_total FROM public.sales WHERE id = v_sale_id;
  IF v_total IS DISTINCT FROM c_monto_a + c_monto_b THEN
    RAISE EXCEPTION 'CASO 8: esperaba % y quedo %', c_monto_a + c_monto_b, v_total;
  END IF;

  RAISE NOTICE 'TODOS LOS CASOS OK';
END $$;

ROLLBACK;
