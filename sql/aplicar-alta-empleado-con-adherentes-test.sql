-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) - Alta de EMPLEADO con sus ADHERENTES
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
--
-- NO CORRER ESTO CONTRA PRODUCCION (ejiycfqxgtrzaysgpzmx).
--   El modulo de nomina de empresa no existe alla; ver CLAUDE.md,
--   "Estado por entorno".
--
-- ----------------------------------------------------------------------------
-- POR QUE
-- ----------------------------------------------------------------------------
--   Un alta de nomina era de un solo rol: o empleados, o adherentes de un
--   empleado que YA vivia en el contrato madre. Sumar a alguien con su grupo
--   familiar exigia DOS movimientos y DOS ceremonias de firma, y el segundo no
--   se podia ni preparar hasta que el primero estuviera firmado y activado.
--
--   El front ahora arma el vinculo DENTRO de la venta-operacion: el adherente
--   nace con parent_beneficiary_id apuntando al empleado de esa MISMA venta,
--   que es lo unico que la FK compuesta fk_beneficiaries_parent
--   (parent_beneficiary_id, sale_id) permite. Este script actualiza la funcion
--   que lo traduce al contrato madre cuando el anexo queda firmado.
--
-- ----------------------------------------------------------------------------
-- QUE CAMBIA (los 3 cambios estan en la rama ALTA; la BAJA queda igual)
-- ----------------------------------------------------------------------------
--   1. ORDER BY: los empleados se activan PRIMERO, para que su
--      activated_beneficiary_id exista cuando le toque a sus adherentes.
--   2. Resolucion del padre: si parent_target_beneficiary_id no resuelve contra
--      la madre, se sigue el parent_beneficiary_id del beneficiario de la
--      operacion hasta la fila hermana de adherent_incorporations y de ahi al
--      beneficiario ya creado en la madre.
--   3. requires_adherents y maternity_bonus viajan a la madre.
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO
-- ----------------------------------------------------------------------------
--   . No hay DDL: no se crea ni se altera ninguna tabla ni columna. No hace
--     falta regenerar types.ts.
--   . El filtro AND COALESCE(movement_type,'alta')='alta' sigue en pie: sin el,
--     firmar una BAJA copiaria a la persona al contrato madre.
--   . Mismo nombre y misma firma: la funcion es una de las 4 que
--     trg_beneficiaries_block_when_sale_signed exime por PG_CONTEXT.
--   . El trigger trg_activate_adherent_incorporation NO se recrea.
--   . Un movimiento sin adherentes anidados se comporta exactamente como antes:
--     el lookup nuevo solo corre cuando el de siempre da NULL.
--   . Idempotente: se puede correr dos veces.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PREFLIGHT - aborta si la base no es la esperada
-- ----------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regclass('public.adherent_incorporations') IS NULL THEN
    RAISE EXCEPTION 'Esta base no tiene adherent_incorporations: NO es US test.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='beneficiaries'
                    AND column_name='requires_adherents') THEN
    RAISE EXCEPTION 'Falta beneficiaries.requires_adherents: correr antes 20260909000001.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='adherent_incorporations'
                    AND column_name='movement_type') THEN
    RAISE EXCEPTION 'Falta adherent_incorporations.movement_type: correr antes 20260908000005.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
                  WHERE p.proname = 'activate_adherent_incorporation'
                    AND l.lanname = 'plpgsql') THEN
    RAISE EXCEPTION
      'activate_adherent_incorporation no existe o no es PL/pgSQL: sin eso el guard de contrato firmado no la exime y el alta fallaria con 42501.';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
  v_parent_id uuid;
  v_plan_id uuid;
  v_member_role text;
  v_fin date;
  v_ids uuid[];
BEGIN
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- ---------------- ALTA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
      -- Sin este filtro una BAJA caeria aca y copiaria a la persona al contrato
      -- madre, en silencio y justo al reves de lo pedido.
      AND COALESCE(movement_type, 'alta') = 'alta'
    -- Los EMPLEADOS primero: un adherente que entra en el mismo movimiento
    -- cuelga de uno de ellos, y para vincularlo hace falta que su padre ya
    -- exista en el contrato madre (o sea, que su fila ya tenga
    -- activated_beneficiary_id).
    ORDER BY (COALESCE(member_role, 'adherente') = 'empleado') DESC, created_at
  LOOP
    v_new_id := NULL;

    v_parent_id := NULL;
    IF r.parent_target_beneficiary_id IS NOT NULL THEN
      SELECT b.id INTO v_parent_id
      FROM public.beneficiaries b
      WHERE b.id = r.parent_target_beneficiary_id
        AND b.sale_id = r.parent_sale_id
        AND b.member_role = 'empleado';
    END IF;

    -- Empleado NUEVO que entra en este mismo movimiento: su adherente no puede
    -- apuntar al contrato madre cuando se arma el alta (el padre todavia no
    -- existe alli), asi que el vinculo se guarda DENTRO de la venta-operacion,
    -- donde la FK compuesta (parent_beneficiary_id, sale_id) si se cumple. Aca
    -- se traduce: del padre en la operacion se salta a la fila hermana de
    -- adherent_incorporations y de ahi al beneficiario ya creado en la madre.
    IF v_parent_id IS NULL AND r.operation_beneficiary_id IS NOT NULL THEN
      SELECT ai.activated_beneficiary_id INTO v_parent_id
      FROM public.beneficiaries ob
      JOIN public.adherent_incorporations ai
        ON ai.operation_sale_id = r.operation_sale_id
       AND ai.operation_beneficiary_id = ob.parent_beneficiary_id
      WHERE ob.id = r.operation_beneficiary_id
        AND ob.parent_beneficiary_id IS NOT NULL;
    END IF;

    v_member_role := COALESCE(r.member_role, 'adherente');
    IF v_member_role = 'empleado' THEN
      v_parent_id := NULL;
    END IF;

    IF r.operation_beneficiary_id IS NOT NULL THEN
      SELECT COALESCE(r.adherent_plan_id, b.plan_id) INTO v_plan_id
      FROM public.beneficiaries b WHERE b.id = r.operation_beneficiary_id;

      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id,
        requires_adherents, maternity_bonus
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false, false,
             v_member_role, v_parent_id, v_plan_id,
             -- Un empleado que declaro grupo familiar tiene que seguir
             -- declarandolo en la madre: si no, pierde el boton "Agregar
             -- adherente" y pareceria que el sistema se rompio.
             COALESCE(b.requires_adherents, false),
             COALESCE(b.maternity_bonus, false)
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false,
        v_member_role, v_parent_id, r.adherent_plan_id
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- ---------------- BAJA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND movement_type = 'baja'
      AND parent_sale_id IS NOT NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    v_fin := COALESCE(r.termination_date, r.coverage_end_date, CURRENT_DATE);

    WITH bajas AS (
      UPDATE public.beneficiaries
         SET status = 'inactive',
             coverage_end_date = v_fin,
             signature_required = false
       WHERE sale_id = r.parent_sale_id
         AND COALESCE(status, 'active') = 'active'
         AND ( id = r.target_beneficiary_id
               OR ( COALESCE(r.cascade_dependents, true)
                    AND parent_beneficiary_id = r.target_beneficiary_id ) )
      RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM bajas;

    UPDATE public.adherent_incorporations
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        activated_beneficiary_id = r.target_beneficiary_id,
        deactivated_beneficiary_ids = v_ids
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre: el alta la sube, la baja la baja.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- VERIFICACION
-- ----------------------------------------------------------------------------
SELECT 'la funcion sigue siendo PL/pgSQL (exenta del guard de contrato firmado)' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
                          WHERE p.proname='activate_adherent_incorporation'
                            AND l.lanname='plpgsql')
       THEN 'OK' ELSE 'ROTO' END AS estado
UNION ALL
SELECT 'sigue sin argumentos (misma firma)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
                          WHERE proname='activate_adherent_incorporation'
                            AND pronargs = 0)
       THEN 'OK' ELSE 'CAMBIO LA FIRMA' END
UNION ALL
SELECT 'el trigger sobre sales sigue apuntando a la funcion',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t
                           JOIN pg_proc p ON p.oid=t.tgfoid
                           JOIN pg_class c ON c.oid=t.tgrelid
                          WHERE t.tgname='trg_activate_adherent_incorporation'
                            AND p.proname='activate_adherent_incorporation'
                            AND c.relname='sales')
       THEN 'OK' ELSE 'FALTA EL TRIGGER' END
UNION ALL
SELECT 'la BAJA sigue filtrada (no copia a la madre)',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='activate_adherent_incorporation')
                 LIKE '%COALESCE(movement_type, ''alta'') = ''alta''%'
       THEN 'OK' ELSE 'SE PERDIO EL FILTRO - PELIGRO' END
UNION ALL
SELECT 'los empleados se activan primero',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='activate_adherent_incorporation')
                 LIKE '%= ''empleado'') DESC%'
       THEN 'OK' ELSE 'FALTA EL ORDER BY' END
UNION ALL
SELECT 'resuelve el padre dentro del mismo movimiento',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='activate_adherent_incorporation')
                 LIKE '%ai.operation_beneficiary_id = ob.parent_beneficiary_id%'
       THEN 'OK' ELSE 'FALTA EL LOOKUP NUEVO' END
UNION ALL
SELECT 'requires_adherents viaja al contrato madre',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname='activate_adherent_incorporation')
                 LIKE '%COALESCE(b.requires_adherents, false)%'
       THEN 'OK' ELSE 'NO SE COPIA EL FLAG' END
UNION ALL
SELECT 'ningun adherente activado quedo huerfano en un contrato de empresa',
       CASE WHEN NOT EXISTS (
              SELECT 1
                FROM public.adherent_incorporations ai
                JOIN public.beneficiaries b ON b.id = ai.activated_beneficiary_id
               WHERE COALESCE(ai.movement_type,'alta') = 'alta'
                 AND COALESCE(ai.member_role,'adherente') = 'adherente'
                 AND b.parent_beneficiary_id IS NULL
                 AND EXISTS (SELECT 1 FROM public.beneficiaries e
                              WHERE e.sale_id = b.sale_id
                                AND e.member_role = 'empleado'))
       THEN 'OK' ELSE 'HAY ADHERENTES SIN EMPLEADO (revisar a mano)' END;
