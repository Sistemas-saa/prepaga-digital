-- Smoke test transaccional del flujo de INCORPORACIÓN DE ADHERENTE.
--
-- Ejercita el circuito completo sobre una base de test poblada y revierte todo
-- al final. NUNCA correr contra producción: va contra US test
-- (ykducvvcjzdpoojxlsig). Verificar el nombre del proyecto antes de ejecutar.
--
-- Qué cubre:
--   1. venta cerrada como contrato madre
--   2. alta con UN adherente
--   3. activación por trigger al pasar la venta-operación a 'completado'
--   4. idempotencia: reactivar no duplica
--   5. VARIOS funcionarios en un mismo anexo (migración 000002)
--   6. camino de respaldo sin operation_beneficiary_id
--   7. puerta de salida: una venta normal no dispara nada
BEGIN;

DO $$
DECLARE
  v_company_id      uuid;
  v_client_id       uuid;
  v_plan_id         uuid;
  v_salesperson_id  uuid;
  v_parent_id       uuid;
  v_parent_status   text;
  v_parent_source   text;
  v_total_antes     numeric;
  v_total_despues   numeric;
  v_total_esperado  numeric;
  v_suma_benef      numeric;
  v_tiene_titular   boolean;

  v_op_id           uuid;
  v_inc_id          uuid;
  v_op_ben_id       uuid;
  v_ben_id          uuid;
  v_ben_sale_id     uuid;
  v_ben_primary     boolean;
  v_ben_firma       boolean;
  v_inc_status      text;
  v_inc_completed   timestamptz;

  v_op3_id          uuid;
  v_op_fb_id        uuid;
  v_normal_id       uuid;
  v_normal_inc_id   uuid;
  v_count           integer;

  -- Monto distintivo para poder rastrear el efecto en el total.
  c_monto           numeric := 123456;

  v_def             text;
  v_permitidos      text;
BEGIN
  -- ---------------------------------------------------------------------
  -- 0. Preflight: el vocabulario que escribe el CÓDIGO tiene que ser el que
  --    acepta la BASE. Se chequea primero para fallar con un mensaje útil en
  --    vez de un 23514 críptico a mitad del test.
  --
  --    Valores que usa el código hoy:
  --      status 'draft'      -> useAdherentIncorporations.ts (INSERT)
  --      status 'completed'  -> activate_adherent_incorporation() (trigger)
  --      source 'existing_sale' -> useAdherentIncorporations.ts (INSERT)
  --
  --    OJO: sales.status SI va en espanol ('borrador','completado'). El
  --    vocabulario en ingles es solo de adherent_incorporations.
  -- ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.adherent_incorporations'::regclass
    AND conname = 'adherent_incorporations_status_check';

  IF v_def IS NOT NULL THEN
    v_permitidos := regexp_replace(v_def, '^.*ARRAY\[|\]\)\)$', '', 'g');
    IF v_def NOT LIKE '%''draft''%' OR v_def NOT LIKE '%''completed''%' THEN
      RAISE EXCEPTION 'DRIFT en adherent_incorporations.status -- la base acepta: % -- el codigo escribe ''draft'' (hook) y ''completed'' (trigger)', v_permitidos;
    END IF;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.adherent_incorporations'::regclass
    AND conname = 'adherent_incorporations_source_check';

  IF v_def IS NOT NULL AND v_def NOT LIKE '%''existing_sale''%' THEN
    v_permitidos := regexp_replace(v_def, '^.*ARRAY\[|\]\)\)$', '', 'g');
    RAISE EXCEPTION 'DRIFT en adherent_incorporations.source -- la base acepta: % -- el codigo escribe ''existing_sale''', v_permitidos;
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. Precondición: un contrato madre ya cerrado, sin incorporaciones
  -- ---------------------------------------------------------------------
  SELECT s.id, s.company_id, s.client_id, s.plan_id, s.salesperson_id,
         s.status::text, COALESCE(s.total_amount, 0)
    INTO v_parent_id, v_company_id, v_client_id, v_plan_id, v_salesperson_id,
         v_parent_status, v_total_antes
  FROM public.sales s
  JOIN public.clients c ON c.id = s.client_id
  WHERE s.status::text IN ('firmado', 'completado')
    AND COALESCE(s.sale_type, '') <> 'alta_adherente'
    AND s.client_id IS NOT NULL
    AND c.client_type = 'empresa'
    AND NOT EXISTS (
      SELECT 1 FROM public.adherent_incorporations ai WHERE ai.parent_sale_id = s.id
    )
  ORDER BY s.sale_date DESC NULLS LAST, s.id
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    -- US Test puede no tener todavía una venta cerrada de una empresa. En
    -- ese caso se crea un contrato madre mínimo dentro de esta transacción.
    -- ROLLBACK lo elimina junto con todos los datos de la prueba; no se
    -- depende de datos comerciales reales para validar el trigger.
    SELECT c.id INTO v_company_id
    FROM public.companies c
    ORDER BY c.created_at NULLS LAST, c.id
    LIMIT 1;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'US Test no tiene ninguna empresa para crear el fixture transaccional';
    END IF;

    SELECT p.id INTO v_plan_id
    FROM public.plans p
    WHERE p.company_id = v_company_id
    ORDER BY p.created_at NULLS LAST, p.id
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      INSERT INTO public.plans (company_id, name, price, is_active)
      VALUES (v_company_id, 'TEST-ROLLBACK Plan', c_monto, true)
      RETURNING id INTO v_plan_id;
    END IF;

    INSERT INTO public.clients (
      company_id, first_name, last_name, client_type, razon_social, ruc, is_active
    ) VALUES (
      v_company_id, 'TEST-ROLLBACK Empresa', '', 'empresa',
      'TEST-ROLLBACK Empresa', 'TEST-RUC-ROLLBACK', true
    )
    RETURNING id INTO v_client_id;

    INSERT INTO public.sales (
      company_id, client_id, plan_id, status, sale_type,
      total_amount, titular_amount, sale_date, contract_number, request_number
    ) VALUES (
      v_company_id, v_client_id, v_plan_id, 'firmado', 'venta_nueva',
      c_monto, c_monto, CURRENT_DATE,
      'TEST-ROLLBACK-CONTRACT', 'TEST-ROLLBACK-REQUEST'
    )
    RETURNING id INTO v_parent_id;

    v_parent_status := 'firmado';
    v_total_antes := c_monto;
    v_parent_source := 'fixture transaccional';
  ELSE
    v_parent_source := 'venta existente';
  END IF;
  RAISE NOTICE 'Contrato madre: % (%, estado %, total inicial %)',
    v_parent_id, v_parent_source, v_parent_status, v_total_antes;

  -- ---------------------------------------------------------------------
  -- 2. Alta con UN adherente
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (company_id, client_id, plan_id, salesperson_id,
                            sale_type, status, sale_date, total_amount,
                            contract_number, request_number)
  VALUES (v_company_id, v_client_id, v_plan_id, v_salesperson_id,
          'alta_adherente', 'borrador', CURRENT_DATE, c_monto,
          'TEST-ROLLBACK-OP1', 'TEST-ROLLBACK-REQ1')
  RETURNING id INTO v_op_id;

  -- El adherente vive primero en la venta-operación (es quien firma el anexo).
  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, dni,
                                    relationship, amount, is_primary, signature_required)
  VALUES (v_op_id, 'TEST-ROLLBACK', 'Adherente Uno', '9999001',
          'Hijo/a', c_monto, false, true)
  RETURNING id INTO v_op_ben_id;

  INSERT INTO public.adherent_incorporations (
    company_id, client_id, operation_sale_id, parent_sale_id, plan_id,
    titular_name, adherent_first_name, adherent_last_name,
    adherent_document_number, adherent_relationship, adherent_amount,
    coverage_end_date, operation_beneficiary_id, status
  ) VALUES (
    v_company_id, v_client_id, v_op_id, v_parent_id, v_plan_id,
    'TEST-ROLLBACK Titular', 'TEST-ROLLBACK', 'Adherente Uno',
    '9999001', 'Hijo/a', c_monto,
    (CURRENT_DATE + INTERVAL '1 year')::date, v_op_ben_id, 'draft'
  ) RETURNING id INTO v_inc_id;

  SELECT status, activated_beneficiary_id INTO v_inc_status, v_ben_id
  FROM public.adherent_incorporations WHERE id = v_inc_id;
  IF v_inc_status <> 'draft' OR v_ben_id IS NOT NULL THEN
    RAISE EXCEPTION 'Alta inicial incorrecta: status %, beneficiario %', v_inc_status, v_ben_id;
  END IF;

  -- ---------------------------------------------------------------------
  -- 3. Activación: la venta-operación pasa a 'completado'
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'completado' WHERE id = v_op_id;

  SELECT ai.status, ai.completed_at, ai.activated_beneficiary_id
    INTO v_inc_status, v_inc_completed, v_ben_id
  FROM public.adherent_incorporations ai WHERE ai.id = v_inc_id;

  IF v_inc_status <> 'completed' THEN
    RAISE EXCEPTION 'La incorporación no quedó completada: %', v_inc_status;
  END IF;
  IF v_inc_completed IS NULL THEN
    RAISE EXCEPTION 'completed_at quedó nulo';
  END IF;
  IF v_ben_id IS NULL THEN
    RAISE EXCEPTION 'No se creó el beneficiario en el contrato madre';
  END IF;

  SELECT b.sale_id, COALESCE(b.is_primary, false), COALESCE(b.signature_required, true)
    INTO v_ben_sale_id, v_ben_primary, v_ben_firma
  FROM public.beneficiaries b WHERE b.id = v_ben_id;

  IF v_ben_sale_id IS DISTINCT FROM v_parent_id THEN
    RAISE EXCEPTION 'El adherente se pegó a la venta equivocada: % (esperado %)',
      v_ben_sale_id, v_parent_id;
  END IF;
  IF v_ben_primary THEN
    RAISE EXCEPTION 'El adherente incorporado no puede quedar como titular (is_primary)';
  END IF;
  IF v_ben_firma THEN
    RAISE EXCEPTION 'El adherente ya firmó el anexo: signature_required debe ser false';
  END IF;

  -- La cuota del contrato madre tiene que haberse recalculado al valor exacto
  -- que determina la función: suma de beneficiarios si hay titular; si no,
  -- titular_amount más la suma de beneficiarios.
  SELECT COALESCE(bool_or(COALESCE(b.is_primary, false)), false),
         COALESCE(SUM(COALESCE(b.amount, 0)), 0)
    INTO v_tiene_titular, v_suma_benef
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id;
  SELECT CASE WHEN v_tiene_titular THEN v_suma_benef
              ELSE COALESCE(s.titular_amount, 0) + v_suma_benef END
    INTO v_total_esperado
  FROM public.sales s WHERE s.id = v_parent_id;
  SELECT COALESCE(total_amount, 0) INTO v_total_despues
  FROM public.sales WHERE id = v_parent_id;
  IF v_total_despues IS DISTINCT FROM v_total_esperado THEN
    RAISE EXCEPTION 'El total del contrato madre es incorrecto: % (esperado %)',
      v_total_despues, v_total_esperado;
  END IF;
  RAISE NOTICE 'Total del madre: % -> %', v_total_antes, v_total_despues;

  -- ---------------------------------------------------------------------
  -- 4. Idempotencia: volver a completar no debe duplicar
  -- ---------------------------------------------------------------------
  UPDATE public.sales SET status = 'firmado'    WHERE id = v_op_id;
  UPDATE public.sales SET status = 'completado' WHERE id = v_op_id;

  SELECT count(*) INTO v_count
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id AND b.first_name = 'TEST-ROLLBACK';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Reactivar duplicó el adherente: % filas', v_count;
  END IF;

  -- ---------------------------------------------------------------------
  -- 5. VARIOS funcionarios en un mismo anexo (migración 000002)
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (company_id, client_id, plan_id, salesperson_id,
                            sale_type, status, sale_date, total_amount,
                            contract_number, request_number)
  VALUES (v_company_id, v_client_id, v_plan_id, v_salesperson_id,
          'alta_adherente', 'borrador', CURRENT_DATE, c_monto * 3,
          'TEST-ROLLBACK-OP3', 'TEST-ROLLBACK-REQ3')
  RETURNING id INTO v_op3_id;

  FOR v_count IN 1..3 LOOP
    INSERT INTO public.beneficiaries (sale_id, first_name, last_name, dni,
                                      relationship, amount, is_primary, signature_required)
    VALUES (v_op3_id, 'TEST-MULTI', 'Funcionario ' || v_count, '99992' || v_count,
            'Funcionario', c_monto, false, true)
    RETURNING id INTO v_op_ben_id;

    INSERT INTO public.adherent_incorporations (
      company_id, client_id, operation_sale_id, parent_sale_id, plan_id,
      titular_name, adherent_first_name, adherent_last_name,
      adherent_document_number, adherent_relationship, adherent_amount,
      coverage_end_date, operation_beneficiary_id, status
    ) VALUES (
      v_company_id, v_client_id, v_op3_id, v_parent_id, v_plan_id,
      'TEST-ROLLBACK Empresa', 'TEST-MULTI', 'Funcionario ' || v_count,
      '99992' || v_count, 'Funcionario', c_monto,
      (CURRENT_DATE + INTERVAL '1 year')::date, v_op_ben_id, 'draft'
    );
  END LOOP;

  UPDATE public.sales SET status = 'completado' WHERE id = v_op3_id;

  SELECT count(*) INTO v_count
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id AND b.first_name = 'TEST-MULTI';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Se esperaban 3 funcionarios en el contrato madre, hay %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.adherent_incorporations
  WHERE operation_sale_id = v_op3_id AND status = 'completed'
    AND activated_beneficiary_id IS NOT NULL;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Las 3 incorporaciones debían quedar completadas, hay %', v_count;
  END IF;

  SELECT COALESCE(bool_or(COALESCE(b.is_primary, false)), false),
         COALESCE(SUM(COALESCE(b.amount, 0)), 0)
    INTO v_tiene_titular, v_suma_benef
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id;
  SELECT CASE WHEN v_tiene_titular THEN v_suma_benef
              ELSE COALESCE(s.titular_amount, 0) + v_suma_benef END
    INTO v_total_esperado
  FROM public.sales s WHERE s.id = v_parent_id;
  SELECT COALESCE(total_amount, 0) INTO v_total_despues
  FROM public.sales WHERE id = v_parent_id;
  IF v_total_despues IS DISTINCT FROM v_total_esperado THEN
    RAISE EXCEPTION 'El total después de 3 funcionarios es incorrecto: % (esperado %)',
      v_total_despues, v_total_esperado;
  END IF;

  -- ---------------------------------------------------------------------
  -- 6. Camino de respaldo: sin operation_beneficiary_id
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (company_id, client_id, plan_id, salesperson_id,
                            sale_type, status, sale_date, total_amount,
                            contract_number, request_number)
  VALUES (v_company_id, v_client_id, v_plan_id, v_salesperson_id,
          'alta_adherente', 'borrador', CURRENT_DATE, c_monto,
          'TEST-ROLLBACK-OPFB', 'TEST-ROLLBACK-REQFB')
  RETURNING id INTO v_op_fb_id;

  INSERT INTO public.adherent_incorporations (
    company_id, client_id, operation_sale_id, parent_sale_id, plan_id,
    titular_name, adherent_first_name, adherent_last_name,
    adherent_document_number, adherent_amount, coverage_start_date,
    coverage_end_date, operation_beneficiary_id, status
  ) VALUES (
    v_company_id, v_client_id, v_op_fb_id, v_parent_id, v_plan_id,
    'TEST-ROLLBACK Titular', 'TEST-FALLBACK', 'Sin Vinculo',
    '9999003', c_monto, CURRENT_DATE,
    (CURRENT_DATE + INTERVAL '1 year')::date, NULL, 'draft'
  );

  UPDATE public.sales SET status = 'completado' WHERE id = v_op_fb_id;

  SELECT count(*) INTO v_count
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id
    AND b.first_name = 'TEST-FALLBACK'
    AND b.last_name = 'Sin Vinculo'
    AND b.dni = '9999003'
    AND b.relationship IS NULL
    AND b.amount = c_monto
    AND COALESCE(b.is_primary, false) = false
    AND COALESCE(b.signature_required, true) = false;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'El camino de respaldo perdió o alteró a la persona: % filas válidas', v_count;
  END IF;

  SELECT COALESCE(bool_or(COALESCE(b.is_primary, false)), false),
         COALESCE(SUM(COALESCE(b.amount, 0)), 0)
    INTO v_tiene_titular, v_suma_benef
  FROM public.beneficiaries b
  WHERE b.sale_id = v_parent_id;
  SELECT CASE WHEN v_tiene_titular THEN v_suma_benef
              ELSE COALESCE(s.titular_amount, 0) + v_suma_benef END
    INTO v_total_esperado
  FROM public.sales s WHERE s.id = v_parent_id;
  SELECT COALESCE(total_amount, 0) INTO v_total_despues
  FROM public.sales WHERE id = v_parent_id;
  IF v_total_despues IS DISTINCT FROM v_total_esperado THEN
    RAISE EXCEPTION 'El total después del fallback es incorrecto: % (esperado %)',
      v_total_despues, v_total_esperado;
  END IF;

  -- ---------------------------------------------------------------------
  -- 7. Puerta de salida: una venta normal no dispara nada
  -- ---------------------------------------------------------------------
  INSERT INTO public.sales (company_id, client_id, plan_id, salesperson_id,
                            sale_type, status, sale_date, total_amount,
                            contract_number, request_number)
  VALUES (v_company_id, v_client_id, v_plan_id, v_salesperson_id,
          'venta_nueva', 'borrador', CURRENT_DATE, c_monto,
          'TEST-ROLLBACK-NORMAL', 'TEST-ROLLBACK-REQNORMAL')
  RETURNING id INTO v_normal_id;

  -- Asociar una incorporación deliberadamente inválida a una venta normal
  -- permite probar la puerta de salida real del trigger, no sólo la ausencia
  -- de filas espontáneas.
  INSERT INTO public.adherent_incorporations (
    company_id, client_id, operation_sale_id, parent_sale_id, plan_id,
    titular_name, adherent_first_name, adherent_last_name,
    adherent_document_number, adherent_amount, coverage_end_date, status
  ) VALUES (
    v_company_id, v_client_id, v_normal_id, v_parent_id, v_plan_id,
    'TEST-ROLLBACK Titular', 'TEST-NORMAL', 'No Activar',
    '9999004', c_monto, (CURRENT_DATE + INTERVAL '1 year')::date, 'draft'
  ) RETURNING id INTO v_normal_inc_id;

  UPDATE public.sales SET status = 'completado' WHERE id = v_normal_id;

  SELECT status, activated_beneficiary_id
    INTO v_inc_status, v_ben_id
  FROM public.adherent_incorporations WHERE id = v_normal_inc_id;
  IF v_inc_status <> 'draft' OR v_ben_id IS NOT NULL THEN
    RAISE EXCEPTION 'La puerta de salida falló: la venta normal activó la incorporación';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.beneficiaries
  WHERE sale_id = v_parent_id AND first_name = 'TEST-NORMAL';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Una venta normal generó % beneficiario(s)', v_count;
  END IF;

  RAISE NOTICE 'adherent incorporation lifecycle test: OK (7/7 escenarios)';
END $$;

ROLLBACK;
