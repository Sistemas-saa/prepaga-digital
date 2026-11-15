-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — verificar las guardas de la NOMINA de empresa
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
--
-- QUE HACE
--   Prueba que las guardas de la jerarquia empleado -> adherentes RECHAZAN los
--   datos invalidos. Los chequeos de "existe la columna / existe el trigger" ya
--   los hace el PASO 1; esto prueba que ademas FUNCIONAN.
--
-- NO ESCRIBE NADA
--   Todo corre dentro de BEGIN ... ROLLBACK. Inserta filas de prueba, comprueba
--   que las guardas saltan, y descarta todo. Correrlo dos veces da lo mismo.
--
-- COMO SE LEE EL RESULTADO
--   Mirar la pestana "Messages"/"Notices" del SQL Editor: las 5 lineas deben
--   empezar con "OK". Una que diga "FALLA" significa que la guarda no esta
--   protegiendo lo que dice proteger.
-- ============================================================================

BEGIN;

DO $verif$
DECLARE
  v_sale_a uuid;
  v_sale_b uuid;
  v_emp uuid;
  v_adh uuid;
BEGIN
  -- Dos ventas en borrador cualesquiera: en borrador no interfiere el guard de
  -- contratos firmados (trg_beneficiaries_block_when_sale_signed).
  SELECT id INTO v_sale_a FROM public.sales WHERE status = 'borrador' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_sale_b FROM public.sales WHERE id <> v_sale_a AND status = 'borrador'
   ORDER BY created_at LIMIT 1;

  IF v_sale_a IS NULL OR v_sale_b IS NULL THEN
    RAISE EXCEPTION 'Hacen falta 2 ventas en estado borrador para correr esta verificacion.';
  END IF;

  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, member_role, amount)
  VALUES (v_sale_a, 'VERIF', 'EMPLEADO', 'empleado', 1) RETURNING id INTO v_emp;

  INSERT INTO public.beneficiaries (sale_id, first_name, last_name, member_role, amount)
  VALUES (v_sale_a, 'VERIF', 'ADHERENTE', 'adherente', 1) RETURNING id INTO v_adh;

  -- 1. El padre tiene que estar en la MISMA venta (FK compuesta).
  BEGIN
    INSERT INTO public.beneficiaries
      (sale_id, first_name, last_name, member_role, parent_beneficiary_id, amount)
    VALUES (v_sale_b, 'VERIF', 'OTRA VENTA', 'adherente', v_emp, 1);
    RAISE WARNING 'FALLA 1: acepto un adherente cuyo empleado esta en otra venta';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK 1  adherente con empleado de OTRA venta -> rechazado (23503)';
  END;

  -- 2. El padre tiene que ser un EMPLEADO (trigger trg_beneficiaries_validate_nomina).
  BEGIN
    INSERT INTO public.beneficiaries
      (sale_id, first_name, last_name, member_role, parent_beneficiary_id, amount)
    VALUES (v_sale_a, 'VERIF', 'NIETO', 'adherente', v_adh, 1);
    RAISE WARNING 'FALLA 2: acepto colgar un adherente de otro adherente (3 niveles)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 2  adherente colgado de otro adherente -> rechazado (23514)';
  END;

  -- 3. Un empleado no cuelga de nadie (chk_beneficiaries_empleado_sin_padre).
  BEGIN
    INSERT INTO public.beneficiaries
      (sale_id, first_name, last_name, member_role, parent_beneficiary_id, amount)
    VALUES (v_sale_a, 'VERIF', 'EMP CON PADRE', 'empleado', v_emp, 1);
    RAISE WARNING 'FALLA 3: un empleado quedo colgado de otro empleado';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 3  empleado con padre -> rechazado (23514)';
  END;

  -- 4. Un empleado con gente a cargo no se puede degradar.
  UPDATE public.beneficiaries SET parent_beneficiary_id = v_emp WHERE id = v_adh;
  BEGIN
    UPDATE public.beneficiaries SET member_role = 'adherente' WHERE id = v_emp;
    RAISE WARNING 'FALLA 4: degrado un empleado que tiene adherentes a cargo';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 4  degradar un empleado con adherentes -> rechazado (23514)';
  END;

  -- 5. Borrar al empleado se lleva a sus adherentes (ON DELETE CASCADE).
  DELETE FROM public.beneficiaries WHERE id = v_emp;
  IF EXISTS (SELECT 1 FROM public.beneficiaries WHERE id = v_adh) THEN
    RAISE WARNING 'FALLA 5: el adherente sobrevivio al borrado de su empleado';
  ELSE
    RAISE NOTICE 'OK 5  borrar al empleado cascadea a sus adherentes';
  END IF;
END
$verif$;

ROLLBACK;

-- ============================================================================
-- INTEGRIDAD DE LOS DATOS — las 4 filas deben decir 0
-- ============================================================================
SELECT 'empleados colgados de alguien' AS chequeo,
       count(*) AS deben_ser_cero
  FROM public.beneficiaries
 WHERE member_role = 'empleado' AND parent_beneficiary_id IS NOT NULL
UNION ALL
SELECT 'adherentes colgados de un no-empleado', count(*)
  FROM public.beneficiaries b
  JOIN public.beneficiaries p ON p.id = b.parent_beneficiary_id
 WHERE p.member_role <> 'empleado'
UNION ALL
SELECT 'adherentes colgados de otra venta', count(*)
  FROM public.beneficiaries b
  JOIN public.beneficiaries p ON p.id = b.parent_beneficiary_id
 WHERE p.sale_id <> b.sale_id
UNION ALL
SELECT 'bajas que apuntan a un beneficiario inexistente', count(*)
  FROM public.adherent_incorporations ai
 WHERE ai.movement_type = 'baja'
   AND NOT EXISTS (SELECT 1 FROM public.beneficiaries b WHERE b.id = ai.target_beneficiary_id);
