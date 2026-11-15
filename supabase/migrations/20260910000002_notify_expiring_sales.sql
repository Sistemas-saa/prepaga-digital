-- ============================================================================
-- Aviso al vendedor: falta 1 mes para que venza la vigencia del contrato
-- ============================================================================
-- Un job diario de pg_cron recorre los contratos firmados/completados cuyo
-- `contract_end_date` cae dentro de los proximos 30 dias y le deja al VENDEDOR
-- una notificacion en la campanita, con el link a la venta.
--
-- Vive en la base y no en el front a proposito, por el mismo motivo que la
-- cadena de activacion de los anexos: el navegador puede no estar abierto el dia
-- que corresponde avisar, y un vendedor que no entra al sistema es justamente el
-- que mas necesita el recordatorio.
--
-- ── Idempotencia: un indice unico parcial, no una columna en `sales` ────────
-- Se notifica una sola vez por (vendedor, venta, fecha de vencimiento), y eso lo
-- garantiza `uq_notifications_contract_expiry` + ON CONFLICT DO NOTHING. El
-- `link` ya identifica la venta Y la fecha, asi que una renovacion (fecha nueva)
-- produce un link nuevo y vuelve a avisar sola, que es lo deseado.
--
-- La alternativa —un `sales.expiry_notified_at`— quedo descartada porque
-- obligaria a hacer UPDATE sobre `sales` de contratos ya firmados, despertando
-- `trg_audit_sales`, `update_sales_updated_at` y `vendedor_edit_restriction`.
-- Un `NOT EXISTS` suelto tampoco alcanza: no da garantia bajo concurrencia.
--
-- ── Por que hace falta traducir el destinatario ─────────────────────────────
-- `notifications.user_id` tiene FK dura a `auth.users(id)`: si una sola fila del
-- lote apunta a un id que no existe ahi, se cae el INSERT ENTERO y ese dia no se
-- avisa nada. Y `sales.salesperson_id` referencia `profiles.id`, que NO siempre
-- es el auth uid: en BR produccion `profiles` tiene ademas `user_id` y hay un
-- perfil donde difieren; en US test la columna `user_id` ni siquiera existe.
-- `auth_user_of_profile()` resuelve las dos formas y descarta al huerfano.
-- ============================================================================

-- ── 1. Traductor profiles.id -> auth.users.id ───────────────────────────────
-- El EXECUTE dinamico no es adorno: SQL estatico que mencione `p.user_id` no
-- compila en la base que no tiene esa columna, aunque la rama nunca se ejecute.
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

  -- Sin esta guarda, un perfil sin usuario de auth voltea el lote completo.
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

-- ── 2. Candado de idempotencia ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_contract_expiry
  ON public.notifications (user_id, link)
  WHERE type = 'contract_expiry';

-- ── 3. El job ───────────────────────────────────────────────────────────────
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

-- La llama el cron con el rol postgres; ningun cliente tiene por que invocarla.
REVOKE ALL ON FUNCTION public.notify_expiring_sales(integer) FROM PUBLIC, anon, authenticated;

-- El agendado va en 20260910000003, en su propio archivo a proposito: ver el
-- encabezado de esa migracion.
