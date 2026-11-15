-- ============================================================================
-- VERIFICACION — Vigencia del contrato + aviso de vencimiento
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- Correr DESPUES de sql/aplicar-vigencia-vencimiento.sql, en la misma base.
--
-- ⚠️ CORRER UN BLOQUE POR VEZ. El SQL Editor de Supabase muestra SOLO el
--    resultado del ULTIMO statement, asi que si pegas el archivo entero solo ves
--    el ultimo control y los importantes se pierden. Seleccionar el bloque y
--    Ctrl+Enter.
--
-- ⚠️ El bloque 2 ESCRIBE de verdad (es la unica forma de probar que la funcion
--    funciona, no solo que existe). El bloque 3 borra exactamente lo que creo el
--    bloque 2. Correr los dos, en orden. No correr el bloque 2 en produccion sin
--    correr despues el 3.
--
-- Se usa una ventana de 400 dias porque en US test los vencimientos reales caen
-- recien en abril de 2027; con los 30 dias del cron no habria nada que probar.
-- ============================================================================


-- ▶ BLOQUE 1 — Que instalo el script (todo debe decir OK) ────────────────────
SELECT 'sales.contract_end_date' AS control,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='sales'
                            AND column_name='contract_end_date')
            THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'funcion auth_user_of_profile',
       CASE WHEN to_regprocedure('public.auth_user_of_profile(uuid)') IS NOT NULL
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'funcion notify_expiring_sales',
       CASE WHEN to_regprocedure('public.notify_expiring_sales(integer)') IS NOT NULL
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'indice uq_notifications_contract_expiry',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                            AND indexname='uq_notifications_contract_expiry')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'indice idx_sales_contract_end_date',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                            AND indexname='idx_sales_contract_end_date')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'cron job notify-expiring-sales',
       COALESCE((SELECT CASE WHEN active THEN 'OK (' || schedule || ')' ELSE 'INACTIVO' END
                   FROM cron.job WHERE jobname='notify-expiring-sales'), 'FALTA')
UNION ALL
-- La funcion la llama el cron como postgres; ningun cliente tiene por que poder.
SELECT 'notify_expiring_sales cerrada a anon/authenticated',
       CASE WHEN has_function_privilege('authenticated',
                  'public.notify_expiring_sales(integer)', 'EXECUTE')
            THEN 'ABIERTA (falta el REVOKE)' ELSE 'OK' END
UNION ALL
SELECT 'auth_user_of_profile cerrada a anon/authenticated',
       CASE WHEN has_function_privilege('authenticated',
                  'public.auth_user_of_profile(uuid)', 'EXECUTE')
            THEN 'ABIERTA (falta el REVOKE)' ELSE 'OK' END
UNION ALL
SELECT 'cuantas notificaria hoy (ventana real de 30 dias)',
       (SELECT count(*)::text FROM public.sales s
         WHERE s.status IN ('firmado','completado')
           AND s.salesperson_id IS NOT NULL
           AND s.contract_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)
UNION ALL
SELECT 'cuantas deberia crear el bloque 2 (ventana de 400 dias)',
       (SELECT count(*)::text FROM public.sales s
         WHERE s.status IN ('firmado','completado')
           AND s.salesperson_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.salesperson_id)
           AND s.contract_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 400
           AND NOT EXISTS (
             SELECT 1 FROM public.notifications n
              WHERE n.type = 'contract_expiry'
                AND n.link = '/sales/' || s.id || '?vencimiento='
                             || to_char(s.contract_end_date,'YYYY-MM-DD')));


-- ▶ BLOQUE 2 — Que la funcion FUNCIONE (escribe; el bloque 3 lo deshace) ─────
-- Correr estos DOS statements de a uno, en este orden.
--
--   2.a debe devolver el mismo numero que dijo el ultimo control del bloque 1.
--   2.b DEBE devolver 0 → es la prueba de la idempotencia: sin eso, el vendedor
--       recibiria el mismo aviso todos los dias durante un mes.

-- 2.a
SELECT public.notify_expiring_sales(400) AS primera_corrida_debe_ser_mayor_a_cero;

-- 2.b
SELECT public.notify_expiring_sales(400) AS segunda_corrida_DEBE_ser_cero;


-- ▶ BLOQUE 3 — Controles sobre lo creado + limpieza ──────────────────────────
-- Los dos primeros controles deben dar 0. El tercero muestra que veria el
-- vendedor. El DELETE del final borra SOLO los avisos de prueba.

-- 3.a — integridad (las dos filas deben decir 0)
SELECT 'destinatarios sin usuario de auth (DEBE ser 0)' AS control,
       (SELECT count(*)::text FROM public.notifications n
         WHERE n.type='contract_expiry'
           AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = n.user_id)) AS valor
UNION ALL
SELECT 'avisos sobre ventas no cerradas / vencidas / sin fecha (DEBE ser 0)',
       (SELECT count(*)::text FROM public.notifications n
          JOIN public.sales s
            ON s.id = split_part(replace(n.link,'/sales/',''), '?', 1)::uuid
         WHERE n.type='contract_expiry'
           AND (s.status NOT IN ('firmado','completado')
                OR s.contract_end_date IS NULL
                OR s.contract_end_date < CURRENT_DATE));

-- 3.b — muestra de lo que le llega al vendedor
SELECT n.title, n.message, n.link
  FROM public.notifications n
 WHERE n.type = 'contract_expiry'
 ORDER BY n.created_at DESC
 LIMIT 5;

-- 3.c — LIMPIEZA: borra los avisos de prueba de los ultimos 30 minutos.
-- Correr SIEMPRE despues del bloque 2.
DELETE FROM public.notifications
 WHERE type = 'contract_expiry'
   AND created_at >= now() - interval '30 minutes';

-- 3.d — confirmar que no quedo ninguno (o solo los legitimos previos)
SELECT count(*) AS avisos_contract_expiry_restantes
  FROM public.notifications WHERE type = 'contract_expiry';
