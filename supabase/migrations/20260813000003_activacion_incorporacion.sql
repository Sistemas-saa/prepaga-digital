-- =====================================================================
-- Fase 2 — Activación automática de la Incorporación de Adherente
-- Fecha: 2026-08-13
--
-- QUÉ HACE
-- Cuando la VENTA-OPERACIÓN de un anexo queda 'completado' (es decir, se
-- firmó: titular + adherentes + contratada), los adherentes del anexo se
-- suman al CONTRATO MADRE y se recalcula su cuota mensual.
--
-- POR QUÉ EN LA BASE Y NO EN EL FRONT
-- El paso a 'completado' lo hace el trigger `auto_advance_sale_status` desde
-- `signature_links`, disparado por la edge function de firma. El navegador
-- puede no estar abierto en ese momento. Poniéndolo en la base, la activación
-- ocurre siempre, sin importar qué camino completó la firma.
--
-- SEGURIDAD
--   · El trigger sale por la puerta inmediatamente si sale_type no es
--     'alta_adherente', así que NINGUNA venta actual cambia de comportamiento.
--   · Es idempotente: solo activa filas con activated_beneficiary_id IS NULL.
--   · No borra ni modifica datos existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Vínculo explícito con el adherente de la operación
-- ---------------------------------------------------------------------
-- Reemplaza el apaño de guardar el id dentro de `notes`.
ALTER TABLE public.adherent_incorporations
  ADD COLUMN IF NOT EXISTS operation_beneficiary_id uuid
  REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

-- Backfill de las filas creadas con el apaño anterior (si las hubiera).
UPDATE public.adherent_incorporations
SET operation_beneficiary_id = NULLIF(replace(notes, 'beneficiario_operacion:', ''), '')::uuid,
    notes = NULL
WHERE operation_beneficiary_id IS NULL
  AND notes LIKE 'beneficiario_operacion:%';


-- ---------------------------------------------------------------------
-- 2. Recálculo del total de una venta
-- ---------------------------------------------------------------------
-- Replica EXACTAMENTE la lógica de recalculateSaleTotalAmount()
-- (src/hooks/useBeneficiaries.ts), para que la cuota mensual dé lo mismo
-- se toque desde el front o desde acá.
CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_primary boolean;
  v_sum numeric;
  v_primary numeric;
  v_titular numeric;
BEGIN
  SELECT COALESCE(bool_or(COALESCE(is_primary, false)), false),
         COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_has_primary, v_sum
  FROM public.beneficiaries
  WHERE sale_id = p_sale_id;

  IF v_has_primary THEN
    SELECT COALESCE(amount, 0) INTO v_primary
    FROM public.beneficiaries
    WHERE sale_id = p_sale_id AND COALESCE(is_primary, false) LIMIT 1;

    -- Si el titular tiene monto 0 NO se pisa titular_amount: preserva el valor
    -- cargado a mano o traído del plan (mismo criterio que el front).
    IF v_primary > 0 THEN
      UPDATE public.sales SET total_amount = v_sum, titular_amount = v_primary WHERE id = p_sale_id;
    ELSE
      UPDATE public.sales SET total_amount = v_sum WHERE id = p_sale_id;
    END IF;
  ELSE
    SELECT COALESCE(titular_amount, 0) INTO v_titular FROM public.sales WHERE id = p_sale_id;
    UPDATE public.sales SET total_amount = v_titular + v_sum WHERE id = p_sale_id;
  END IF;
END;
$function$;


-- ---------------------------------------------------------------------
-- 3. Activación
-- ---------------------------------------------------------------------
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
        status = 'completado',
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

DROP TRIGGER IF EXISTS trg_activate_adherent_incorporation ON public.sales;
CREATE TRIGGER trg_activate_adherent_incorporation
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.activate_adherent_incorporation();


-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 3 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'columna operation_beneficiary_id' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_name='adherent_incorporations' AND column_name='operation_beneficiary_id')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'función recalculate_sale_total_amount',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='recalculate_sale_total_amount' AND n.nspname='public')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trigger de activación',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
            WHERE tgname='trg_activate_adherent_incorporation' AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END;
