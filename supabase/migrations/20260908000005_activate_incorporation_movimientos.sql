-- Activación de los movimientos de nómina: la baja desvincula, el alta suma.
--
-- POR QUÉ SE REEMPLAZA `activate_adherent_incorporation()` Y NO SE CREA OTRA
-- Esta función es una de las CUATRO que `trg_beneficiaries_block_when_sale_signed`
-- exime por nombre, mirando la pila de llamadas con `GET DIAGNOSTICS ... PG_CONTEXT`
-- (ver 20260818000002). Conservar el MISMO nombre y la MISMA firma es lo que le
-- permite seguir escribiendo en un contrato ya firmado. Una función nueva
-- quedaría bloqueada con 42501, y sumarla al regex significaría tocar el guard.
-- Por el mismo motivo NO se agrega `set_config('app.allow_signed_beneficiary_mutation', ...)`:
-- la exención por PG_CONTEXT ya cubre estas escrituras, y activarla desarmaría el
-- guard para el resto de la transacción sin necesidad.
--
-- ⚠️ LA CORRECCIÓN MÁS IMPORTANTE DE ESTE ARCHIVO
-- El loop original filtra `activated_beneficiary_id IS NULL AND parent_sale_id IS
-- NOT NULL`. Ese filtro también matchea las filas de BAJA, que tienen poblado
-- `operation_beneficiary_id` (el snapshot de quien sale). Sin el
-- `AND COALESCE(movement_type,'alta') = 'alta'` de abajo, firmar una baja
-- COPIARÍA a la persona al contrato madre — en silencio y justo al revés de lo
-- pedido.
--
-- QUÉ HACE LA RAMA DE BAJA
-- Marca `status='inactive'` + `coverage_end_date` sobre el beneficiario del
-- CONTRATO MADRE (y, si `cascade_dependents`, sobre sus adherentes). No borra
-- nada: la fila queda como historia de la nómina y el anexo firmado conserva a
-- quién apuntaba. El total del contrato baja solo, porque
-- `recalculate_sale_total_amount` ya ignora a los inactivos (20260908000004).

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
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- movimiento de nómina sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- =================================================================
  -- ALTA — suma la persona al contrato madre (comportamiento histórico)
  -- =================================================================
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
      -- Sin este filtro, una BAJA caería en este loop y copiaría a la persona
      -- al contrato madre en vez de sacarla. Ver el encabezado.
      AND COALESCE(movement_type, 'alta') = 'alta'
  LOOP
    v_new_id := NULL;

    -- ¿De qué empleado del CONTRATO MADRE cuelga? Sólo se acepta si de verdad
    -- pertenece a esa venta y es un empleado: si no, se deja NULL y la persona
    -- entra como adherente suelto. Es preferible a que la FK compuesta aborte la
    -- activación entera y el anexo firmado quede sin efecto.
    v_parent_id := NULL;
    IF r.parent_target_beneficiary_id IS NOT NULL THEN
      SELECT b.id INTO v_parent_id
      FROM public.beneficiaries b
      WHERE b.id = r.parent_target_beneficiary_id
        AND b.sale_id = r.parent_sale_id
        AND b.member_role = 'empleado';
    END IF;

    v_member_role := COALESCE(r.member_role, 'adherente');
    -- Un empleado nunca cuelga de nadie (chk_beneficiaries_empleado_sin_padre).
    IF v_member_role = 'empleado' THEN
      v_parent_id := NULL;
    END IF;

    -- Camino normal: copiar el adherente de la operación al contrato madre,
    -- con todos sus datos (domicilio, barrio, V.I., etc.).
    IF r.operation_beneficiary_id IS NOT NULL THEN
      SELECT COALESCE(r.adherent_plan_id, b.plan_id) INTO v_plan_id
      FROM public.beneficiaries b WHERE b.id = r.operation_beneficiary_id;

      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false,
             -- Ya firmó en el anexo: no debe volver a pedírsele firma si el
             -- contrato madre se reenvía a firmar.
             false,
             v_member_role, v_parent_id, v_plan_id
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    -- Respaldo: si se perdió el vínculo, se arma con los datos que la propia
    -- incorporación guarda. Mejor un adherente con menos datos que ninguno.
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

  -- =================================================================
  -- BAJA — desvincula del contrato madre
  -- =================================================================
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND movement_type = 'baja'
      AND parent_sale_id IS NOT NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    v_fin := COALESCE(r.termination_date, r.coverage_end_date, CURRENT_DATE);

    -- Un solo UPDATE para el empleado y su cascada. `signature_required=false`
    -- evita que un reenvío a firmar del contrato madre les genere un enlace
    -- fantasma (ver bug conocido #12).
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

  -- Nueva cuota mensual del contrato madre. Vale para los dos movimientos: el
  -- alta lo sube, la baja lo baja (los inactivos ya no suman).
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

-- El trigger no se recrea: sigue siendo el mismo `trg_activate_adherent_incorporation`
-- (AFTER UPDATE ON sales) apuntando a esta función, que conserva nombre y firma.

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 4 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'el loop de alta excluye las bajas' AS chequeo,
       CASE WHEN pg_get_functiondef('public.activate_adherent_incorporation()'::regprocedure)
                 LIKE '%COALESCE(movement_type, ''alta'') = ''alta''%'
       THEN 'OK' ELSE 'FALTA EL FILTRO (una baja copiaria a la persona)' END AS estado
UNION ALL
SELECT 'existe la rama de baja',
       CASE WHEN pg_get_functiondef('public.activate_adherent_incorporation()'::regprocedure)
                 LIKE '%deactivated_beneficiary_ids%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'sigue siendo PL/pgSQL (requisito de la exencion por PG_CONTEXT)',
       CASE WHEN (SELECT l.lanname FROM pg_proc p
                    JOIN pg_language l ON l.oid = p.prolang
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname='public' AND p.proname='activate_adherent_incorporation') = 'plpgsql'
       THEN 'OK' ELSE 'QUEDARIA BLOQUEADA POR EL GUARD' END
UNION ALL
SELECT 'el trigger de activacion sigue conectado',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname='trg_activate_adherent_incorporation'
                            AND tgrelid='public.sales'::regclass
                            AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END;
