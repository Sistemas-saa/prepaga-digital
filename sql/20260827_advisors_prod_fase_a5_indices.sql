-- =====================================================================
-- Advisors de PRODUCCIÓN — Fase A5 (OPCIONAL): índices de FK del flujo caliente
--
--   Proyecto: ejiycfqxgtrzaysgpzmx  (Supabase BR PRODUCCIÓN)
--   Fecha:    2026-08-27
--
-- CÓMO SE USA
--   Pegar en el SQL Editor y ejecutar. OJO: cada sentencia va SUELTA,
--   NO dentro de BEGIN/COMMIT ni de apply_migration: CREATE INDEX
--   CONCURRENTLY no puede correr dentro de una transacción.
--   Es idempotente (IF NOT EXISTS).
--
-- QUÉ HACE
--   Cubre 14 de los 86 unindexed_foreign_keys: solo las del camino real
--   de firma / documentos / ventas. El resto se deja (tablas frías o de
--   la otra app) — ver el reporte.
--
-- IMPACTO OPERATIVO: nulo. CONCURRENTLY construye el índice en segundo
--   plano SIN bloquear lecturas ni escrituras de la tabla. Solo agrega
--   índices (acelera el DELETE de ventas y las queries del flujo).
--
-- REVERSIÓN: DROP INDEX CONCURRENTLY IF EXISTS <nombre>;
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_signature_events_sale_id           ON public.signature_events(sale_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_signature_events_signature_link_id ON public.signature_events(signature_link_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_signature_events_document_id       ON public.signature_events(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sig_evidence_sale_id              ON public.signature_evidence_bundles(sale_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sig_evidence_signature_link_id    ON public.signature_evidence_bundles(signature_link_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_signatures_document_id            ON public.signatures(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sig_workflow_steps_link_id        ON public.signature_workflow_steps(signature_link_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sig_consent_sale_id              ON public.signature_consent_records(sale_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_document_type_id        ON public.documents(document_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_beneficiary_id          ON public.documents(beneficiary_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_plan_id                     ON public.sales(plan_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_template_id                 ON public.sales(template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_evidence_sale_id            ON public.legal_evidence_certificates(sale_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_messages_sale_id         ON public.whatsapp_messages(sale_id);

-- Verificación: los 14 índices deben aparecer como válidos (indisvalid = true)
SELECT c.relname AS index_name, i.indisvalid AS valido
FROM pg_class c
JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname IN (
  'idx_signature_events_sale_id','idx_signature_events_signature_link_id','idx_signature_events_document_id',
  'idx_sig_evidence_sale_id','idx_sig_evidence_signature_link_id','idx_signatures_document_id',
  'idx_sig_workflow_steps_link_id','idx_sig_consent_sale_id','idx_documents_document_type_id',
  'idx_documents_beneficiary_id','idx_sales_plan_id','idx_sales_template_id',
  'idx_legal_evidence_sale_id','idx_whatsapp_messages_sale_id')
ORDER BY 1;
