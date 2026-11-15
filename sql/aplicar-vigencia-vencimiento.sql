-- ============================================================================
-- Vigencia del contrato + aviso de vencimiento al vendedor
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig (US TEST)  ·  ejiycfqxgtrzaysgpzmx (BR PROD)
--
-- ✅ Este script SI es apto para las dos bases (a diferencia de los de nomina de
--    empresa). Aplicar primero en US TEST, verificar con
--    sql/verificar-vigencia-vencimiento.sql, y recien despues en produccion.
--
-- ----------------------------------------------------------------------------
-- POR QUE
-- ----------------------------------------------------------------------------
--   La lista de ventas mostraba "Vence: {signature_expires_at}", que es la
--   expiracion del LINK DE FIRMA y no la vigencia del contrato — por eso todas
--   las filas decian "No definido". El sistema no registraba en ningun lado
--   hasta cuando esta vigente un contrato ni avisaba antes del vencimiento, asi
--   que las renovaciones dependian de que alguien se acordara.
--
--   Este script deja:
--     · sales.contract_end_date          → la fuente de verdad de la vigencia
--     · auth_user_of_profile(uuid)       → traduce vendedor → usuario de auth
--     · notify_expiring_sales(int)       → el job que crea los avisos
--     · uq_notifications_contract_expiry → que no se avise dos veces lo mismo
--     · cron job diario 12:00 UTC (08:00 PY)
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO
-- ----------------------------------------------------------------------------
--   · `contract_end_date` nace NULL (en US TEST ya existe con 17 ventas
--     cargadas, ahi el ADD COLUMN es no-op). Una venta sin fecha de fin no
--     muestra vigencia y no genera ningun aviso.
--   · SIN BACKFILL. `contract_start_date + 1 year` es una suposicion comercial:
--     aplicada de golpe dispararia una tanda de avisos falsos en la primera
--     corrida del cron, y el indice unico los deja pegados (no hay
--     "des-notificar"). El autocompletado a 12 meses vive en el formulario.
--   · No se toca ninguna tabla existente mas alla del ADD COLUMN, ni un solo
--     trigger, ni ninguna politica RLS.
--   · El job solo INSERTA en `notifications`; nunca escribe en `sales`.
--   · Idempotente: se puede correr dos veces (el cron se re-agenda, no se
--     duplica).
-- ============================================================================

BEGIN;

-- ── 1. La columna de vigencia ───────────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS contract_end_date date;

COMMENT ON COLUMN public.sales.contract_end_date IS
  'Fin de vigencia del contrato. Alimenta la columna VIGENCIA de la lista de ventas y el aviso de vencimiento al vendedor (notify_expiring_sales). Se sugiere a 12 meses del inicio desde el formulario, pero es editable.';

CREATE INDEX IF NOT EXISTS idx_sales_contract_end_date
  ON public.sales (contract_end_date)
  WHERE contract_end_date IS NOT NULL;

-- ── 2. Traductor profiles.id -> auth.users.id ───────────────────────────────
-- `notifications.user_id` tiene FK dura a `auth.users(id)`: si UNA fila del lote
-- apunta a un id inexistente, se cae el INSERT entero y ese dia no se avisa
-- nada. Y `sales.salesperson_id` referencia `profiles.id`, que no siempre es el
-- auth uid: en BR prod `profiles` tiene ademas `user_id` (y hay un perfil donde
-- difieren), mientras que en US test esa columna ni existe. El EXECUTE dinamico
-- no es adorno: SQL estatico que mencione `p.user_id` no compila en la base que
-- no la tiene, aunque esa rama nunca se ejecute.
CREATE OR REPLACE FUNCTION public.auth_user_of_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_uid uuid;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  = 'user_id'
  ) THEN
    EXECUTE 'SELECT COALESCE(p.user_id, p.id) FROM public.profiles p WHERE p.id = $1'
      INTO v_uid USING p_profile_id;
  ELSE
    SELECT p.id INTO v_uid FROM public.profiles p WHERE p.id = p_profile_id;
  END IF;

  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    RETURN NULL;
  END IF;

  RETURN v_uid;
END;
$fn$;

COMMENT ON FUNCTION public.auth_user_of_profile(uuid) IS
  'Traduce un profiles.id (p.ej. sales.salesperson_id) al auth.users.id destinatario de una notificacion. Devuelve NULL si el perfil no tiene usuario de auth, para no violar la FK de notifications.user_id.';

-- Es SECURITY DEFINER y devuelve identificadores de auth: no tiene por que estar
-- al alcance de un cliente. La llama `notify_expiring_sales`, que corre como
-- postgres y por lo tanto la sigue pudiendo ejecutar.
REVOKE ALL ON FUNCTION public.auth_user_of_profile(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Candado de idempotencia del aviso ────────────────────────────────────
-- Se avisa UNA sola vez por (vendedor, venta, fecha de vencimiento). El `link`
-- ya identifica la venta Y la fecha, asi que una renovacion produce un link
-- nuevo y vuelve a avisar sola, que es lo deseado.
--
-- La alternativa —un `sales.expiry_notified_at`— quedo descartada: obligaria a
-- hacer UPDATE sobre contratos ya firmados, despertando `trg_audit_sales`,
-- `update_sales_updated_at` y `vendedor_edit_restriction`. Un `NOT EXISTS`
-- suelto tampoco alcanza: no da garantia bajo concurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_contract_expiry
  ON public.notifications (user_id, link)
  WHERE type = 'contract_expiry';

-- ── 4. El job ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_expiring_sales(p_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_insertadas integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, link)
  SELECT dest.uid,
         'Vence la vigencia de un contrato',
         format(
           'El contrato %s de %s vence el %s (faltan %s dias). Coordina la renovacion.',
           COALESCE(s.contract_number, 'sin numero'),
           COALESCE(
             NULLIF(c.razon_social, ''),
             NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
             'el cliente'
           ),
           to_char(s.contract_end_date, 'DD/MM/YYYY'),
           (s.contract_end_date - CURRENT_DATE)
         ),
         'contract_expiry',
         '/sales/' || s.id || '?vencimiento=' || to_char(s.contract_end_date, 'YYYY-MM-DD')
    FROM public.sales s
    LEFT JOIN public.clients c ON c.id = s.client_id
    CROSS JOIN LATERAL (SELECT public.auth_user_of_profile(s.salesperson_id) AS uid) dest
   WHERE s.status IN ('firmado', 'completado')
     AND s.salesperson_id IS NOT NULL
     AND dest.uid IS NOT NULL
     AND s.contract_end_date IS NOT NULL
     AND s.contract_end_date >= CURRENT_DATE
     AND s.contract_end_date <= CURRENT_DATE + p_dias
  ON CONFLICT (user_id, link) WHERE type = 'contract_expiry' DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$fn$;

COMMENT ON FUNCTION public.notify_expiring_sales(integer) IS
  'Job diario: avisa al vendedor de cada contrato firmado/completado cuyo contract_end_date cae dentro de p_dias. Idempotente por (user_id, link) via uq_notifications_contract_expiry. Devuelve cuantas notificaciones creo.';

REVOKE ALL ON FUNCTION public.notify_expiring_sales(integer) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================================
-- 5. Agendado diario — FUERA de la transaccion a proposito
-- ============================================================================
-- Si el proyecto no deja crear pg_cron desde el SQL Editor, esta seccion falla
-- sola y todo lo anterior queda igual aplicado (se habilita la extension desde
-- Database → Extensions y se corre solo esta parte).
--
-- La base corre en UTC y Paraguay es UTC-4: 12:00 UTC = 08:00 de la manana aca.
-- El unschedule previo hace el re-agendado idempotente aunque cambie el comando.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-expiring-sales';
END;
$$;

SELECT cron.schedule(
  'notify-expiring-sales',
  '0 12 * * *',
  $$SELECT public.notify_expiring_sales(30);$$
);

-- ── Verificacion rapida ─────────────────────────────────────────────────────
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
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname='public'
                            AND indexname='uq_notifications_contract_expiry')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'indice idx_sales_contract_end_date',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname='public'
                            AND indexname='idx_sales_contract_end_date')
            THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'cron job notify-expiring-sales',
       COALESCE((SELECT CASE WHEN active THEN 'OK (' || schedule || ')' ELSE 'INACTIVO' END
                   FROM cron.job WHERE jobname='notify-expiring-sales'), 'FALTA');
