-- Fix: el trigger escribia en adherent_incorporations un estado que la tabla rechaza.
--
-- adherent_incorporations usa vocabulario en INGLES:
--   status IN ('draft','sent','signed','completed','cancelled')
--   source IN ('existing_sale','external_sale')
--
-- pero activate_adherent_incorporation() marcaba la fila como 'completado'
-- (espanol), violando adherent_incorporations_status_check con SQLSTATE 23514.
-- En la practica la ACTIVACION del anexo fallaba entera y el adherente nunca se
-- copiaba al contrato madre.
--
-- NO confundir con sales.status, que si va en espanol. El IF que detecta cuando
-- la venta-operacion pasa a 'completado' queda intacto a proposito.
--
-- Origen del desajuste: 20260813000001 crea la tabla con CREATE TABLE IF NOT
-- EXISTS y en test la tabla YA EXISTIA con el vocabulario en ingles, asi que su
-- definicion —defaults y CHECKs incluidos— se ignoro en silencio. La
-- verificacion de esa migracion solo comprobaba que las columnas existieran, no
-- los valores permitidos.
--
-- Se redefine la funcion completa; el trigger que la invoca no cambia.

CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- incorporación sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
  LOOP
    v_new_id := NULL;

    -- Camino normal: copiar el adherente de la operación al contrato madre,
    -- con todos sus datos (domicilio, barrio, V.I., etc.).
    IF r.operation_beneficiary_id IS NOT NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false,
             -- Ya firmó en el anexo: no debe volver a pedírsele firma si el
             -- contrato madre se reenvía a firmar.
             false
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    -- Respaldo: si se perdió el vínculo, se arma con los datos que la propia
    -- incorporación guarda. Mejor un adherente con menos datos que ninguno.
    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false
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

  -- Nueva cuota mensual del contrato madre.
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
