-- =====================================================================
-- Versionado de complete_adherent_incorporation (LEGADO)
-- Fecha: 2026-08-22
--
-- QUÉ HACE
-- Trae al repo la definición EXACTA de una función que hasta ahora sólo
-- existía en la base de test (capturada con pg_get_functiondef).
--
-- POR QUÉ, si nadie la llama
-- Porque 20260818000002_beneficiaries_signed_contract_guard.sql la exime
-- POR NOMBRE en el regex de PG_CONTEXT del trigger que bloquea mutar
-- adherentes de contratos firmados, y su preflight ABORTA si la función no
-- existe o no es PL/pgSQL. Sin esta migración, un entorno limpio (o
-- producción el día que se despliegue) no puede aplicar aquella.
--
-- ⚠️ ESTO ES CÓDIGO LEGADO — NO USARLO
-- Es la versión de UN SOLO ADHERENTE, anterior a 20260813000002 (que quitó
-- el UNIQUE de operation_sale_id justamente para permitir 1 anexo = N
-- adherentes). Hace `SELECT ... INTO v_operation ... FOR UPDATE` sin loop:
-- si la operación tiene varios adherentes, activa UNO SOLO —el que la
-- consulta devuelva primero, sin ORDER BY— y marca sólo esa fila como
-- 'completed'. Los demás quedan colgados y la cuota del grupo queda mal.
-- Tampoco llama a recalculate_sale_total_amount().
--
-- La activación REAL la hace el trigger trg_activate_adherent_incorporation
-- (20260813000003), que sí loopea todos los adherentes y recalcula el total.
-- Se dispara solo, vía auto_advance_sale_status, cuando la venta-operación
-- pasa a 'completado'.
--
-- Verificado al escribir esta migración: no la invoca NADIE — ni `src/`, ni
-- `supabase/functions/`, ni ningún trigger.
--
-- SEGURIDAD
--   · CREATE OR REPLACE con la definición idéntica a la que ya corre en
--     test: aplicarla no cambia absolutamente nada de comportamiento.
--   · No toca datos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complete_adherent_incorporation(p_signature_link_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operation public.adherent_incorporations%ROWTYPE;
  v_link public.signature_links%ROWTYPE;
  v_target_sale_id uuid;
  v_beneficiary_id uuid;
BEGIN
  SELECT * INTO v_link
  FROM public.signature_links
  WHERE id = p_signature_link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature_link_not_found';
  END IF;

  IF coalesce(v_link.status, '') <> 'completado' THEN
    RAISE EXCEPTION 'signature_link_not_completed';
  END IF;

  SELECT * INTO v_operation
  FROM public.adherent_incorporations
  WHERE signature_link_id = p_signature_link_id
     OR operation_sale_id = v_link.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_operation.status = 'completed' AND v_operation.activated_beneficiary_id IS NOT NULL THEN
    RETURN v_operation.activated_beneficiary_id;
  END IF;

  v_target_sale_id := coalesce(v_operation.parent_sale_id, v_operation.operation_sale_id);

  INSERT INTO public.beneficiaries (
    sale_id,
    first_name,
    last_name,
    dni,
    document_type,
    document_number,
    birth_date,
    relationship,
    email,
    phone,
    amount,
    is_primary,
    signature_required,
    status,
    coverage_start_date,
    coverage_end_date,
    source_incorporation_id,
    activated_at
  )
  VALUES (
    v_target_sale_id,
    v_operation.adherent_first_name,
    v_operation.adherent_last_name,
    v_operation.adherent_document_number,
    v_operation.adherent_document_type,
    v_operation.adherent_document_number,
    v_operation.adherent_birth_date,
    v_operation.adherent_relationship,
    v_operation.adherent_email,
    v_operation.adherent_phone,
    coalesce(v_operation.adherent_amount, 0),
    false,
    false,
    'active',
    coalesce(v_operation.coverage_start_date, current_date),
    v_operation.coverage_end_date,
    v_operation.id,
    now()
  )
  RETURNING id INTO v_beneficiary_id;

  UPDATE public.adherent_incorporations
  SET status = 'completed',
      activated_beneficiary_id = v_beneficiary_id,
      completed_at = now()
  WHERE id = v_operation.id;

  UPDATE public.sales
  SET status = 'completado',
      signature_completed_at = now(),
      all_signatures_completed = true
  WHERE id = v_operation.operation_sale_id;

  RETURN v_beneficiary_id;
END;
$function$;

COMMENT ON FUNCTION public.complete_adherent_incorporation(uuid) IS
  'LEGADO — no usar. Versión de un solo adherente: con varios activa uno solo y no recalcula el total. La activación real la hace el trigger trg_activate_adherent_incorporation. Se mantiene porque 20260818000002 la exime por nombre en el guard de contratos firmados.';
