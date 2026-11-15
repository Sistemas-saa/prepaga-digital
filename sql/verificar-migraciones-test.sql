-- =====================================================================
-- Verificación de las 3 migraciones en TEST (ykducvvcjzdpoojxlsig)
-- Solo LEE: no modifica nada. Pegar en Supabase → SQL Editor.
-- Deben salir las 12 filas en OK.
-- =====================================================================

-- ── 20260813000001 — esquema base ────────────────────────────────────
SELECT '000001' AS migracion, 'tabla adherent_incorporations' AS chequeo,
       CASE WHEN to_regclass('public.adherent_incorporations') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT '000001', 'RLS activa en adherent_incorporations',
       CASE WHEN COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.adherent_incorporations')), false)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000001', 'beneficiaries.entry_date + immediate_coverage',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                  WHERE table_name='beneficiaries' AND column_name IN ('entry_date','immediate_coverage')) = 2
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000001', 'clients.client_type/razon_social/ruc/external_id',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                  WHERE table_name='clients' AND column_name IN ('client_type','razon_social','ruc','external_id')) = 4
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000001', 'sales.employee_signature_mode',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='sales' AND column_name='employee_signature_mode')
       THEN 'OK' ELSE 'FALTA' END

-- ── 20260813000002 — varias personas por anexo ───────────────────────
UNION ALL
SELECT '000002', 'sin UNIQUE en operation_sale_id (permite varias personas)',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_index x
         JOIN pg_class t ON t.oid = x.indrelid
         WHERE t.relname = 'adherent_incorporations'
           AND x.indisunique AND NOT x.indisprimary
           AND (SELECT array_agg(a.attname::text) FROM unnest(x.indkey::int[]) k
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k) = ARRAY['operation_sale_id']
       ) THEN 'OK' ELSE 'FALTA (sigue limitado a 1 persona)' END
UNION ALL
SELECT '000002', 'índice de búsqueda por operación',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_adherent_incorporations_operation_sale')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000002', 'coverage_end_date nullable',
       CASE WHEN (SELECT is_nullable FROM information_schema.columns
                  WHERE table_name='adherent_incorporations' AND column_name='coverage_end_date') = 'YES'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000002', 'anexos con numeración propia ANX- (no gastan Nº de contrato)',
       CASE WHEN pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='generate_contract_number' AND n.nspname='public')) LIKE '%alta_adherente%'
       THEN 'OK' ELSE 'FALTA' END

-- ── 20260813000003 — activación automática ───────────────────────────
UNION ALL
SELECT '000003', 'adherent_incorporations.operation_beneficiary_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='adherent_incorporations' AND column_name='operation_beneficiary_id')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000003', 'función recalculate_sale_total_amount',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE p.proname='recalculate_sale_total_amount' AND n.nspname='public')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '000003', 'trigger de activación en sales',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname='trg_activate_adherent_incorporation' AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
ORDER BY 1, 2;
