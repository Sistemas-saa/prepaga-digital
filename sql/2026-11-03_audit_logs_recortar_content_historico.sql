-- =============================================================================
-- audit_logs: recortar el HTML histórico de `documents` (≈430 MB)
-- =============================================================================
-- Fecha: 2026-11-03. Pensado para BR prod (ejiycfqxgtrzaysgpzmx); sirve igual en
-- US test. Va DESPUÉS de sql/2026-11-03_audit_log_sin_content_documents.sql
-- (si esa no está aplicada, este script aborta).
--
-- POR QUÉ
--   Hasta el 2026-11-03 fn_audit_log copiaba la fila completa de `documents`
--   (incluido `content`, HTML con imágenes base64 de hasta 11 MB) en old_values
--   y new_values. audit_logs llegó a 475 MB, 433 de ellos ese HTML, y la base
--   (1085 MB) dejó de entrar en la RAM del t4g.micro (1 GB) → lecturas a disco →
--   Disk IO Budget agotado → base colgada ~45 min.
--
-- QUÉ HACE
--   En las filas de audit_logs con entity_type = 'documents', reemplaza en
--   old_values / new_values las claves `content` y `signature_data` por
--     content_bytes, content_md5, signature_data_present
--   — exactamente el mismo formato que ya escribe fn_audit_log desde hoy, así
--   las filas viejas y nuevas quedan homogéneas. Todo lo demás de cada fila
--   (id, usuario, acción, fechas, el resto de las claves del JSON) queda igual.
--   Las filas de las otras 7 tablas no se tocan (se verifica por huella).
--
-- QUÉ SE PIERDE (leer antes de correr)
--   El HTML de las versiones ANTERIORES de cada documento que sólo vivía en la
--   auditoría. NO se pierde:
--     - el contenido actual de cada documento (sigue en documents.content);
--     - los PDF firmados PAdES ni las print-versions (están en Storage);
--     - la traza de quién cambió qué y cuándo (sigue en audit_logs), y con el
--       md5 se puede saber si el contenido cambió entre una versión y otra.
--   Si hiciera falta recuperar ese HTML: backup diario de Supabase previo a la
--   corrida (Dashboard → Database → Backups). Confirmar que exista uno ANTES.
--
-- CÓMO (y por qué así y no con UPDATE)
--   Un UPDATE de 7.275 filas ensuciaría las ~430 MB de páginas TOAST viejas
--   (escrituras + WAL con full-page images) y después haría falta un
--   VACUUM FULL para devolver el espacio: justo el tipo de IO que agotó el
--   budget. En cambio, dentro de UNA transacción:
--     1. bloquea audit_logs (lecturas y escrituras esperan hasta el final);
--     2. copia la tabla ya recortada a una tabla temporal (~40 MB);
--     3. verifica la copia contra el original;
--     4. TRUNCATE audit_logs (libera los 475 MB al instante, sin VACUUM) y
--        reinserta las filas recortadas con sus mismos ids;
--     5. vuelve a verificar.
--   Es posible porque audit_logs no tiene nada colgado: ninguna FK la
--   referencia, no tiene triggers ni vistas dependientes ni está en una
--   publicación de Realtime (relevado en prod el 2026-11-03; el preflight lo
--   vuelve a comprobar). TRUNCATE conserva la tabla, sus índices, políticas
--   RLS y grants.
--
-- ATOMICIDAD
--   Todo es UNA sentencia (DO block): si cualquier verificación falla, se
--   deshace todo, TRUNCATE incluido. Idempotente: si no queda ninguna fila con
--   `content`, no hace nada.
--
-- CUÁNDO CORRERLO
--   De noche / sin uso. Mientras corre (estimado 1–3 min), cualquier alta o
--   modificación en las tablas auditadas (ventas, documentos, links de firma,
--   clientes, adherentes…) ESPERA al lock de audit_logs. lock_timeout de 5 s:
--   si hay otra transacción tomando audit_logs, el script aborta en vez de
--   quedarse encolado bloqueando a todos.
-- =============================================================================

DO $do$
DECLARE
  v_total_antes      bigint;
  v_total_stage      bigint;
  v_total_despues    bigint;
  v_docs_antes       bigint;
  v_docs_stage       bigint;
  v_por_tipo_antes   jsonb;
  v_por_tipo_stage   jsonb;
  v_por_tipo_despues jsonb;
  v_huella_antes     text;
  v_huella_stage     text;
  v_huella_despues   text;
  v_ids_stage        bigint;
  v_restos           bigint;
  v_sin_id           bigint;
  v_tam_antes        text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ---------------------------------------------------------------- preflight
  IF pg_get_functiondef('public.fn_audit_log'::regproc) NOT LIKE '%content_md5%' THEN
    RAISE EXCEPTION 'PREFLIGHT: fn_audit_log todavía copia el HTML. Aplicar antes sql/2026-11-03_audit_log_sin_content_documents.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.audit_logs'::regclass) THEN
    RAISE EXCEPTION 'PREFLIGHT: hay FKs que referencian audit_logs; TRUNCATE no es seguro.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'PREFLIGHT: audit_logs tiene triggers; revisar antes de TRUNCATE.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend WHERE refobjid = 'public.audit_logs'::regclass AND classid = 'pg_rewrite'::regclass) THEN
    RAISE EXCEPTION 'PREFLIGHT: hay vistas que dependen de audit_logs.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    RAISE EXCEPTION 'PREFLIGHT: audit_logs está en una publicación (Realtime); el TRUNCATE se replicaría.';
  END IF;
  IF (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_logs')
     <> 'id,user_id,company_id,action,entity_type,entity_id,old_values,new_values,ip_address,user_agent,created_at' THEN
    RAISE EXCEPTION 'PREFLIGHT: las columnas de audit_logs no son las esperadas.';
  END IF;

  -- ACCESS EXCLUSIVE desde el arranque (es el que TRUNCATE va a pedir igual).
  -- Pedirlo recién en el TRUNCATE arriesga fallar por lock_timeout DESPUÉS de
  -- haber hecho la copia, que es lo caro. Así, si algo lo tiene tomado, aborta
  -- al toque y sin haber leído nada. Hasta el COMMIT, todo acceso a audit_logs
  -- (incluidos los INSERT de los triggers de auditoría) espera.
  LOCK TABLE public.audit_logs IN ACCESS EXCLUSIVE MODE;

  v_tam_antes := pg_size_pretty(pg_total_relation_size('public.audit_logs'));

  -- ------------------------------------------------------------ foto "antes"
  SELECT count(*), count(*) FILTER (WHERE entity_type = 'documents')
    INTO v_total_antes, v_docs_antes
  FROM public.audit_logs;

  SELECT jsonb_object_agg(coalesce(entity_type, '<null>'), n) INTO v_por_tipo_antes
  FROM (SELECT entity_type, count(*) n FROM public.audit_logs GROUP BY 1) t;

  -- Huella de TODAS las filas que no son de documents (no deben cambiar ni un byte).
  SELECT md5(coalesce(string_agg(a::text, '|' ORDER BY a.id), '')) INTO v_huella_antes
  FROM public.audit_logs a
  WHERE a.entity_type IS DISTINCT FROM 'documents';

  RAISE NOTICE 'Antes: % filas (% de documents), audit_logs ocupa %', v_total_antes, v_docs_antes, v_tam_antes;

  -- ------------------------------------------------- copia recortada (staging)
  CREATE TEMP TABLE _audit_stage ON COMMIT DROP AS
  SELECT
    a.id, a.user_id, a.company_id, a.action, a.entity_type, a.entity_id,
    CASE
      WHEN a.entity_type = 'documents' AND (a.old_values ? 'content' OR a.old_values ? 'signature_data') THEN
        (a.old_values - 'content' - 'signature_data')
        || jsonb_build_object(
             'content_bytes', octet_length(a.old_values ->> 'content'),
             'content_md5', md5(a.old_values ->> 'content'),
             'signature_data_present', (a.old_values ->> 'signature_data') IS NOT NULL)
      ELSE a.old_values
    END AS old_values,
    CASE
      WHEN a.entity_type = 'documents' AND (a.new_values ? 'content' OR a.new_values ? 'signature_data') THEN
        (a.new_values - 'content' - 'signature_data')
        || jsonb_build_object(
             'content_bytes', octet_length(a.new_values ->> 'content'),
             'content_md5', md5(a.new_values ->> 'content'),
             'signature_data_present', (a.new_values ->> 'signature_data') IS NOT NULL)
      ELSE a.new_values
    END AS new_values,
    a.ip_address, a.user_agent, a.created_at
  FROM public.audit_logs a;

  -- -------------------------------------------------- verificar la copia
  SELECT count(*), count(*) FILTER (WHERE entity_type = 'documents'), count(DISTINCT id)
    INTO v_total_stage, v_docs_stage, v_ids_stage
  FROM _audit_stage;

  SELECT jsonb_object_agg(coalesce(entity_type, '<null>'), n) INTO v_por_tipo_stage
  FROM (SELECT entity_type, count(*) n FROM _audit_stage GROUP BY 1) t;

  SELECT md5(coalesce(string_agg(s::text, '|' ORDER BY s.id), '')) INTO v_huella_stage
  FROM _audit_stage s
  WHERE s.entity_type IS DISTINCT FROM 'documents';

  SELECT count(*) INTO v_restos
  FROM _audit_stage
  WHERE entity_type = 'documents'
    AND (old_values ? 'content' OR new_values ? 'content'
         OR old_values ? 'signature_data' OR new_values ? 'signature_data');

  -- Las filas recortadas tienen que seguir identificando al documento.
  SELECT count(*) INTO v_sin_id
  FROM _audit_stage
  WHERE entity_type = 'documents'
    AND ((old_values IS NOT NULL AND NOT old_values ? 'id')
      OR (new_values IS NOT NULL AND NOT new_values ? 'id'));

  IF v_total_stage <> v_total_antes OR v_ids_stage <> v_total_antes THEN
    RAISE EXCEPTION 'VERIFICACIÓN: la copia tiene % filas (% ids distintos) y el original %', v_total_stage, v_ids_stage, v_total_antes;
  END IF;
  IF v_por_tipo_stage <> v_por_tipo_antes THEN
    RAISE EXCEPTION 'VERIFICACIÓN: conteo por entity_type distinto. antes=% copia=%', v_por_tipo_antes, v_por_tipo_stage;
  END IF;
  IF v_huella_stage <> v_huella_antes THEN
    RAISE EXCEPTION 'VERIFICACIÓN: cambiaron filas que no son de documents';
  END IF;
  IF v_restos > 0 THEN
    RAISE EXCEPTION 'VERIFICACIÓN: quedaron % filas de documents con content/signature_data', v_restos;
  END IF;
  IF v_sin_id > 0 THEN
    RAISE EXCEPTION 'VERIFICACIÓN: % filas de documents perdieron la clave id del JSON', v_sin_id;
  END IF;

  -- -------------------------------------------- reemplazar (atómico con lo de arriba)
  TRUNCATE public.audit_logs;

  INSERT INTO public.audit_logs
    (id, user_id, company_id, action, entity_type, entity_id,
     old_values, new_values, ip_address, user_agent, created_at)
  SELECT id, user_id, company_id, action, entity_type, entity_id,
         old_values, new_values, ip_address, user_agent, created_at
  FROM _audit_stage;

  -- -------------------------------------------------- verificar el resultado
  SELECT count(*) INTO v_total_despues FROM public.audit_logs;

  SELECT jsonb_object_agg(coalesce(entity_type, '<null>'), n) INTO v_por_tipo_despues
  FROM (SELECT entity_type, count(*) n FROM public.audit_logs GROUP BY 1) t;

  SELECT md5(coalesce(string_agg(a::text, '|' ORDER BY a.id), '')) INTO v_huella_despues
  FROM public.audit_logs a
  WHERE a.entity_type IS DISTINCT FROM 'documents';

  IF v_total_despues <> v_total_antes OR v_por_tipo_despues <> v_por_tipo_antes THEN
    RAISE EXCEPTION 'VERIFICACIÓN FINAL: conteos distintos. antes=% después=%', v_por_tipo_antes, v_por_tipo_despues;
  END IF;
  IF v_huella_despues <> v_huella_antes THEN
    RAISE EXCEPTION 'VERIFICACIÓN FINAL: cambiaron filas que no son de documents';
  END IF;

  RAISE NOTICE 'OK: % filas conservadas, % de documents recortadas. audit_logs: % → %',
    v_total_despues, v_docs_antes, v_tam_antes, pg_size_pretty(pg_total_relation_size('public.audit_logs'));
END
$do$;

-- Después (opcional, sólo lectura / mantenimiento liviano):
-- ANALYZE public.audit_logs;
-- SELECT pg_size_pretty(pg_total_relation_size('public.audit_logs')) AS audit_logs,
--        pg_size_pretty(pg_database_size('postgres'))               AS base;
