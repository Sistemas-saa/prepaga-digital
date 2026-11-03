-- =============================================================================
-- fn_audit_log: dejar de copiar el HTML de `documents` en audit_logs
-- =============================================================================
-- Fecha: 2026-11-03. Pensado para BR prod (ejiycfqxgtrzaysgpzmx); sirve igual en
-- US test.
--
-- POR QUÉ
--   El 2026-11-03 la base de BR se colgó ~45 min (09:46–10:31 PY) y Supabase
--   mandó "running out of Disk IO Budget". El trigger de auditoría guardaba la
--   fila COMPLETA de `documents` dos veces por UPDATE (`old_values` + `new_values`),
--   incluido `content`: HTML de hasta 11 MB por las imágenes base64. Medido ese
--   día: audit_logs = 475 MB, de los cuales 433 MB eran `content` de documents.
--   Cualquier UPDATE trivial (is_final, base_pdf_url, status…) sobre un contrato
--   de 2 MB escribía ~4 MB más en audit_logs + WAL.
--
-- QUÉ CAMBIA
--   Sólo cuando TG_TABLE_NAME = 'documents': en old_values/new_values se quitan
--   `content` y `signature_data`, y en su lugar se guarda
--     content_bytes  (largo en bytes)
--     content_md5    (huella: alcanza para saber SI cambió el contenido)
--     signature_data_present (bool)
--   Para el resto de las tablas el trigger queda EXACTAMENTE igual.
--   Misma firma, mismo SECURITY DEFINER, mismo search_path: los 8 triggers
--   (trg_audit_*) siguen apuntando a la misma función, no se tocan.
--
-- QUÉ NO HACE
--   - No borra ni modifica filas existentes de audit_logs (los 433 MB viejos
--     siguen ahí; achicarlos es otra decisión: cuánto historial conservar).
--   - No toca `documents` ni ninguna otra tabla.
--
-- CÓMO CORRERLO
--   Todo el script es UNA sola sentencia (un DO block), así que es atómico aun
--   en el SQL Editor del dashboard, que no conserva sesión entre sentencias:
--   o se aplica entero (función + autoprueba OK) o no se aplica nada.
--   Es idempotente: correrlo dos veces no cambia nada.
--
-- AUTOPRUEBA (dentro del mismo DO, con rollback garantizado)
--   Hace un UPDATE no-op (updated_at = updated_at) sobre un documento con
--   contenido, verifica que la fila de audit_logs generada NO tiene `content`
--   y SÍ tiene `content_md5`, y deshace todo con una excepción atrapada
--   (subtransacción). No queda ni el UPDATE ni la fila de auditoría de prueba.
--
-- ROLLBACK
--   Volver a la versión anterior = el CREATE OR REPLACE del bloque
--   "VERSIÓN ANTERIOR" al final de este archivo.
-- =============================================================================

DO $do$
DECLARE
  v_def        text;
  v_triggers   int;
  v_doc_id     uuid;
  v_new_values jsonb;
  v_old_values jsonb;
BEGIN
  -- ---------------------------------------------------------------- preflight
  SELECT pg_get_functiondef('public.fn_audit_log'::regproc) INTO v_def;

  IF v_def NOT LIKE '%to_jsonb(row_to_json(OLD))%' THEN
    RAISE EXCEPTION 'PREFLIGHT: fn_audit_log no tiene la forma esperada (to_jsonb(row_to_json(OLD))). Alguien la cambió: revisar a mano antes de pisarla.';
  END IF;

  SELECT count(*) INTO v_triggers
  FROM pg_trigger
  WHERE NOT tgisinternal AND tgfoid = 'public.fn_audit_log'::regproc;
  RAISE NOTICE 'Triggers que usan fn_audit_log: %', v_triggers;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 WHERE c.relname = 'documents' AND t.tgname = 'trg_audit_documents'
                   AND t.tgfoid = 'public.fn_audit_log'::regproc) THEN
    RAISE EXCEPTION 'PREFLIGHT: no existe trg_audit_documents -> fn_audit_log. Este script no aplica a esta base.';
  END IF;

  -- ------------------------------------------------------------ la función
  IF v_def LIKE '%content_md5%' THEN
    RAISE NOTICE 'fn_audit_log ya estaba actualizada: no se reemplaza.';
  ELSE
    EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $body$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_json jsonb;
  v_new_json jsonb;
  v_entity_id uuid;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;

  IF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(row_to_json(OLD));
    v_new_json := NULL;
    v_entity_id := (v_old_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_old_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_json := NULL;
    v_new_json := to_jsonb(row_to_json(NEW));
    v_entity_id := (v_new_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  ELSE -- UPDATE
    v_old_json := to_jsonb(row_to_json(OLD));
    v_new_json := to_jsonb(row_to_json(NEW));
    v_entity_id := (v_new_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  END IF;

  -- 2026-11-03: documents.content es HTML de hasta 11 MB (imágenes base64) y
  -- copiarlo dos veces por UPDATE agotó el Disk IO Budget de BR prod. Se guarda
  -- su huella (largo + md5) en vez del contenido. Ver
  -- sql/2026-11-03_audit_log_sin_content_documents.sql.
  IF TG_TABLE_NAME = 'documents' THEN
    IF v_old_json IS NOT NULL THEN
      v_old_json := (v_old_json - 'content' - 'signature_data')
        || jsonb_build_object(
             'content_bytes', octet_length(v_old_json ->> 'content'),
             'content_md5', md5(v_old_json ->> 'content'),
             'signature_data_present', (v_old_json ->> 'signature_data') IS NOT NULL);
    END IF;
    IF v_new_json IS NOT NULL THEN
      v_new_json := (v_new_json - 'content' - 'signature_data')
        || jsonb_build_object(
             'content_bytes', octet_length(v_new_json ->> 'content'),
             'content_md5', md5(v_new_json ->> 'content'),
             'signature_data_present', (v_new_json ->> 'signature_data') IS NOT NULL);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, company_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  ) VALUES (
    v_user_id, v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id,
    v_old_json, v_new_json, now()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$body$
$fn$;
    RAISE NOTICE 'fn_audit_log reemplazada.';
  END IF;

  -- -------------------------------------------------------------- autoprueba
  -- El documento con contenido MÁS CHICO: alcanza para probar y no le pide al
  -- disco leer y hashear 11 MB en una base que justo anda corta de IO.
  SELECT id INTO v_doc_id
  FROM public.documents
  WHERE content IS NOT NULL AND content <> ''
  ORDER BY pg_column_size(content) ASC
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RAISE NOTICE 'AUTOPRUEBA omitida: no hay documentos con contenido.';
  ELSE
    BEGIN
      UPDATE public.documents SET updated_at = updated_at WHERE id = v_doc_id;

      SELECT old_values, new_values INTO v_old_values, v_new_values
      FROM public.audit_logs
      WHERE entity_type = 'documents' AND entity_id = v_doc_id AND created_at = now()
      ORDER BY id DESC
      LIMIT 1;

      IF v_new_values IS NULL THEN
        RAISE EXCEPTION 'AUTOPRUEBA: el UPDATE no generó fila en audit_logs';
      END IF;
      IF v_new_values ? 'content' OR v_old_values ? 'content'
         OR v_new_values ? 'signature_data' OR v_old_values ? 'signature_data' THEN
        RAISE EXCEPTION 'AUTOPRUEBA: audit_logs sigue guardando content/signature_data';
      END IF;
      IF NOT (v_new_values ? 'content_md5') OR (v_new_values ->> 'content_bytes') IS NULL THEN
        RAISE EXCEPTION 'AUTOPRUEBA: falta content_md5/content_bytes en new_values';
      END IF;
      IF (v_old_values ->> 'content_md5') IS DISTINCT FROM (v_new_values ->> 'content_md5') THEN
        RAISE EXCEPTION 'AUTOPRUEBA: un UPDATE que no toca content cambió el md5';
      END IF;

      RAISE NOTICE 'AUTOPRUEBA OK sobre documento % (% bytes de contenido, ya no se copian a audit_logs)',
        v_doc_id, v_new_values ->> 'content_bytes';

      -- Deshacer el UPDATE y la fila de auditoría de prueba.
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback de autoprueba';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      NULL; -- sólo se deshace la subtransacción de la prueba; la función queda.
    END;
  END IF;
END
$do$;

-- Verificación posterior (opcional, sólo lectura):
-- SELECT pg_get_functiondef('public.fn_audit_log'::regproc) LIKE '%content_md5%' AS actualizada;
-- SELECT created_at, action, new_values->>'content_bytes' bytes, new_values ? 'content' AS tiene_content
--   FROM public.audit_logs WHERE entity_type='documents' ORDER BY created_at DESC LIMIT 10;


-- =============================================================================
-- VERSIÓN ANTERIOR (para rollback). Tomada de BR prod el 2026-11-03.
-- =============================================================================
-- CREATE OR REPLACE FUNCTION public.fn_audit_log()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_company_id uuid;
--   v_user_id uuid;
--   v_old_json jsonb;
--   v_new_json jsonb;
--   v_entity_id uuid;
-- BEGIN
--   BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
--
--   IF TG_OP = 'DELETE' THEN
--     v_old_json := to_jsonb(row_to_json(OLD));
--     v_new_json := NULL;
--     v_entity_id := (v_old_json ->> 'id')::uuid;
--     BEGIN v_company_id := (v_old_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
--   ELSIF TG_OP = 'INSERT' THEN
--     v_old_json := NULL;
--     v_new_json := to_jsonb(row_to_json(NEW));
--     v_entity_id := (v_new_json ->> 'id')::uuid;
--     BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
--   ELSE -- UPDATE
--     v_old_json := to_jsonb(row_to_json(OLD));
--     v_new_json := to_jsonb(row_to_json(NEW));
--     v_entity_id := (v_new_json ->> 'id')::uuid;
--     BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
--   END IF;
--
--   INSERT INTO public.audit_logs (
--     user_id, company_id, action, entity_type, entity_id,
--     old_values, new_values, created_at
--   ) VALUES (
--     v_user_id, v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id,
--     v_old_json, v_new_json, now()
--   );
--
--   IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
--   RETURN NEW;
-- END;
-- $function$;
