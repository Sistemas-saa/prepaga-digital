-- =====================================================================
-- Verificación en TEST de las 5 migraciones de codex/incorporacion-entrega-a
-- (las posteriores a las 20260813xxxxxx, que ya verificamos aparte)
--
-- Solo LEE: no modifica nada. Pegar en Supabase → SQL Editor de TEST.
-- Deben salir las 7 filas en OK.
-- =====================================================================

-- 20260817000001 — arregla el trigger de activación del anexo.
-- Es LA MÁS IMPORTANTE: sin ella el anexo se firma pero el adherente NUNCA
-- se suma al contrato madre, porque el trigger escribía el estado en español
-- ('completado') y la tabla solo acepta el vocabulario en inglés.
SELECT '20260817000001' AS migracion,
       'activación del anexo escribe el estado correcto' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'activate_adherent_incorporation'
           AND pg_get_functiondef(p.oid) LIKE '%''completed''%'
       ) THEN 'OK' ELSE 'FALTA — el adherente no se suma al contrato' END AS estado

-- 20260817000002 — Plan Materno como adicional de la venta.
UNION ALL
SELECT '20260817000002', 'sales.maternity_bonus',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'sales' AND column_name = 'maternity_bonus'
       ) THEN 'OK' ELSE 'FALTA' END

-- 20260818000001 — una sola fórmula para sales.total_amount.
-- Convivían dos funciones con el mismo nombre y cuentas distintas: la que no
-- contemplaba titular_amount dejaba el total corto.
UNION ALL
SELECT '20260818000001', 'recalculate_sale_total_amount() contempla titular_amount',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'recalculate_sale_total_amount'
           AND p.pronargs = 0
           AND pg_get_functiondef(p.oid) ILIKE '%titular_amount%'
       ) THEN 'OK' ELSE 'FALTA — el total puede quedar corto' END

-- 20260818000002 — bloqueo en la base de cambios de adherentes en contratos firmados.
UNION ALL
SELECT '20260818000002', 'función beneficiaries_block_when_sale_signed',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'beneficiaries_block_when_sale_signed'
       ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '20260818000002', 'trigger trg_beneficiaries_block_when_sale_signed',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_beneficiaries_block_when_sale_signed' AND NOT tgisinternal
       ) THEN 'OK' ELSE 'FALTA' END

-- 20260818000003 — ciclo de vida (editar / cancelar una incorporación).
UNION ALL
SELECT '20260818000003', 'función adherent_incorporations_guard_lifecycle',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'adherent_incorporations_guard_lifecycle'
       ) THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT '20260818000003', 'trigger trg_adherent_incorporations_guard_lifecycle',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_adherent_incorporations_guard_lifecycle' AND NOT tgisinternal
       ) THEN 'OK' ELSE 'FALTA' END

ORDER BY 1, 2;
