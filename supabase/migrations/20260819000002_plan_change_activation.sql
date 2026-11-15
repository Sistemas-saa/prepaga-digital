-- =====================================================================
-- Fase 2 — Activación automática del "Cambio de Plan" + guarda de ciclo de vida
-- Fecha: 2026-08-19
--
-- QUÉ HACE
-- Cuando la VENTA-OPERACIÓN de un cambio de plan queda 'completado' (es decir,
-- se firmó: titular + integrantes + contratada), el cambio se aplica al
-- CONTRATO MADRE: nuevo plan, nueva fecha de inicio de contrato (si se cargó),
-- nuevos montos por integrante, y se recalcula la cuota mensual.
--
-- POR QUÉ EN LA BASE Y NO EN EL FRONT
-- El paso a 'completado' lo hace el trigger `auto_advance_sale_status` desde
-- `signature_links`, disparado por la edge function de firma. El navegador
-- puede no estar abierto en ese momento. Poniéndolo en la base, la aplicación
-- del cambio ocurre siempre, sin importar qué camino completó la firma.
--
-- SEGURIDAD
--   · El trigger sale por la puerta inmediatamente si sale_type no es
--     'cambio_plan', así que NINGUNA venta actual cambia de comportamiento.
--   · Es idempotente: solo procesa filas con status NOT IN ('completed','cancelled').
--   · No borra datos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Activación
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  m jsonb;
  v_new_amount numeric;
  v_beneficiary_id uuid;
  v_is_primary boolean;
  v_skip boolean;
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- cambio de plan sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'cambio_plan' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- EXENCIÓN DEL BLOQUEO DE CONTRATOS FIRMADOS.
  -- El contrato madre está firmado, así que el trigger
  -- `trg_beneficiaries_block_when_sale_signed` (20260818000002) rechazaría con
  -- 42501 cualquier UPDATE sobre sus beneficiarios. Esta GUC es justamente la
  -- puerta de escape que ese trigger consulta.
  -- Se usa set_config(..., true) —transaccional, se revierte al terminar la
  -- transacción— y NO "ALTER FUNCTION ... SET", porque Supabase rechaza eso
  -- con "42501: permission denied to set parameter".
  -- VA ACÁ, DESPUÉS DE LAS DOS PUERTAS DE SALIDA, y no al principio del bloque:
  -- este trigger es AFTER UPDATE ON sales FOR EACH ROW sin WHEN, así que corre
  -- para CUALQUIER venta. Como set_config(..., true) dura toda la transacción
  -- (no sólo esta llamada), ponerlo antes de las guardas dejaría la exención
  -- activa por un UPDATE a una venta cualquiera, anulando el guard de
  -- beneficiarios firmados para el resto de esa transacción. Acá sólo se activa
  -- cuando realmente se va a aplicar un cambio de plan, justo antes de escribir.
  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'on', true);

  FOR r IN
    SELECT * FROM public.plan_changes
    WHERE operation_sale_id = NEW.id
      AND parent_sale_id IS NOT NULL
      -- 'cancelled' también queda afuera: una operación cancelada no debe
      -- aplicarse aunque su venta-operación llegue igual a 'completado'.
      -- Además, marcarla 'completed' violaría la guarda de ciclo de vida (42501)
      -- y, siendo un trigger AFTER en la misma transacción, abortaría el UPDATE
      -- de sales que completa la firma.
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    -- a. Nuevo plan en el contrato madre.
    IF r.new_plan_id IS NOT NULL THEN
      UPDATE public.sales
      SET plan_id = r.new_plan_id
      WHERE id = r.parent_sale_id;
    END IF;

    -- a.bis. Fecha de inicio del nuevo contrato. El formulario la captura y
    -- queda en el documento firmado, así que también hay que aplicarla.
    -- UPDATE aparte para no pisar plan_id ni contract_start_date con NULL.
    IF r.new_contract_start_date IS NOT NULL THEN
      UPDATE public.sales
      SET contract_start_date = r.new_contract_start_date
      WHERE id = r.parent_sale_id;
    END IF;

    -- b. Nuevos montos por integrante, según el snapshot del formulario.
    --    Cada elemento tiene la forma:
    --      {"beneficiary_id": uuid|null, "is_primary": bool, "name": text,
    --       "previous_plan": text, "previous_amount": numeric, "new_amount": numeric}
    --    Las entradas sin `new_amount` se ignoran en silencio: significan que
    --    ese integrante no cambia de monto.
    FOR m IN SELECT jsonb_array_elements(r.members_snapshot)
    LOOP
      -- `members_snapshot` es jsonb libre, sin CHECK de forma: cualquier valor
      -- no canónico —"1.500,00" en new_amount, "si" en is_primary, un uuid mal
      -- formado, un numeric fuera de rango— abortaría el cast DENTRO de la
      -- transacción de firma y revertiría el paso de la venta a 'completado'.
      -- Criterio: una entrada malformada se IGNORA, nunca aborta la firma.
      --
      -- Los TRES casts se parsean juntos y ANTES de escribir nada, por dos
      -- motivos: así ninguno queda al descubierto, y los errores de los UPDATE
      -- de más abajo (que sí son bugs de verdad) siguen propagándose normalmente
      -- en vez de quedar tapados por este handler.
      --
      -- Se usa un flag en vez de CONTINUE dentro del handler para no depender
      -- de saltar fuera de un bloque con EXCEPTION.
      v_skip := false;
      BEGIN
        v_new_amount     := NULLIF(m->>'new_amount', '')::numeric;
        v_is_primary     := COALESCE(NULLIF(m->>'is_primary', '')::boolean, false);
        v_beneficiary_id := NULLIF(m->>'beneficiary_id', '')::uuid;
      EXCEPTION WHEN others THEN
        v_skip := true;
      END;

      -- Sin `new_amount` el integrante no cambia de monto: se ignora igual.
      IF v_skip OR v_new_amount IS NULL THEN
        CONTINUE;
      END IF;

      IF v_is_primary THEN
        -- El monto del titular vive en `sales.titular_amount`, pero algunos
        -- contratos TAMBIÉN tienen una fila de `beneficiaries` con
        -- is_primary = true. Hay que escribir en los dos lados: al final
        -- `recalculate_sale_total_amount` sincroniza titular_amount DESDE esa
        -- fila primary cuando su amount > 0, así que si sólo se actualizara la
        -- venta, el recálculo pisaría el valor nuevo y el aumento del titular se
        -- perdería en silencio.
        UPDATE public.sales
        SET titular_amount = v_new_amount
        WHERE id = r.parent_sale_id;

        -- Si el contrato NO tiene fila primary, este UPDATE afecta 0 filas y no
        -- falla: en ese caso el titular_amount recién escrito sobrevive al
        -- recálculo, que es el comportamiento correcto de esa misma función.
        UPDATE public.beneficiaries
        SET amount = v_new_amount
        WHERE sale_id = r.parent_sale_id
          AND is_primary = true;
      ELSE
        -- Un adherente sin beneficiary_id utilizable no se puede ubicar en el
        -- contrato madre: se ignora, igual que el resto de las entradas
        -- malformadas.
        IF v_beneficiary_id IS NULL THEN
          CONTINUE;
        END IF;

        -- El filtro por sale_id evita que un snapshot manipulado toque
        -- adherentes de OTRO contrato.
        UPDATE public.beneficiaries
        SET amount = v_new_amount
        WHERE id = v_beneficiary_id
          AND sale_id = r.parent_sale_id;
      END IF;
    END LOOP;

    -- c. Cierre de la operación.
    UPDATE public.plan_changes
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre.
  -- NUNCA se recalcula el total a mano: bug conocido #10 de CLAUDE.md — el
  -- total lo calcula SÓLO la base, con esta única función.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.plan_changes
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  -- Cierre de la ventana de exención. set_config(..., true) es transaccional:
  -- si no se apaga acá, el guard de beneficiarios firmados queda desarmado para
  -- CUALQUIER escritura posterior de la misma transacción de firma. Apagándolo
  -- justo después de la última escritura y del último recálculo, la exención
  -- dura sólo lo que dura la activación.
  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'off', true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_activate_plan_change ON public.sales;
CREATE TRIGGER trg_activate_plan_change
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.activate_plan_change();


-- ---------------------------------------------------------------------
-- 2. Guarda de ciclo de vida de plan_changes
-- ---------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
-- Las policies permisivas se combinan con OR: restringir una por estado no
-- bloquearía nada, porque cualquier otra policy permisiva seguiría dejando
-- pasar la fila. Un trigger se aplica una sola vez, sin importar qué policy
-- autorizó el acceso. Mismo criterio que 20260818000003.
--
-- QUÉ IMPIDE
--   1. Editar los datos del cambio después de `draft` —incluido su DESTINO
--      (parent_sale_id / operation_sale_id)—. El formulario ya se generó y
--      puede estar firmado: cambiar el snapshot dejaría el documento firmado
--      diciendo una cosa y la base otra, y repuntar el destino permitiría
--      aplicar un cambio firmado sobre un contrato distinto.
--   2. Reabrir un cambio `completed` o `cancelled`.
--
-- QUÉ SIGUE PERMITIENDO
-- Todas las transiciones hacia adelante (draft -> sent -> signed -> completed,
-- y la cancelación desde draft/sent), además de los campos de control
-- (document_id, signature_link_id, completed_at, updated_at, notes).

CREATE OR REPLACE FUNCTION public.plan_changes_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del cambio es inmutable después del borrador.
  IF OLD.status IS DISTINCT FROM 'draft' AND (
       NEW.reason                  IS DISTINCT FROM OLD.reason
    OR NEW.previous_plan_id        IS DISTINCT FROM OLD.previous_plan_id
    OR NEW.new_plan_id             IS DISTINCT FROM OLD.new_plan_id
    OR NEW.previous_total_amount   IS DISTINCT FROM OLD.previous_total_amount
    OR NEW.new_total_amount        IS DISTINCT FROM OLD.new_total_amount
    OR NEW.members_snapshot        IS DISTINCT FROM OLD.members_snapshot
    OR NEW.new_contract_start_date IS DISTINCT FROM OLD.new_contract_start_date
    OR NEW.titular_name            IS DISTINCT FROM OLD.titular_name
    OR NEW.titular_document        IS DISTINCT FROM OLD.titular_document
    -- `observations` va impreso en el formulario firmado, y `client_id` /
    -- `source` describen de quién es la operación: si cambiaran después del
    -- borrador, la base diría una cosa y el PDF con firma PAdES otra, que es
    -- exactamente el bug conocido #11.
    OR NEW.observations            IS DISTINCT FROM OLD.observations
    OR NEW.client_id               IS DISTINCT FROM OLD.client_id
    OR NEW.source                  IS DISTINCT FROM OLD.source
    -- parent_sale_id / operation_sale_id son el DESTINO de la operación.
    -- La policy de UPDATE de plan_changes sólo valida company_id, así que sin
    -- congelarlos un usuario de la empresa podría repuntar un cambio ya en
    -- 'sent'/'signed' hacia OTRO contrato firmado: al completarse la firma, la
    -- activación aplicaría plan_id, titular_amount y la fila primary sobre un
    -- contrato distinto del que se firmó, con la exención del GUC activa
    -- (es el bypass que el bug conocido #11 busca cerrar).
    OR NEW.parent_sale_id          IS DISTINCT FROM OLD.parent_sale_id
    OR NEW.operation_sale_id       IS DISTINCT FROM OLD.operation_sale_id
  ) THEN
    RAISE EXCEPTION
      'El cambio de plan esta en estado "%": sus datos ya no se pueden editar. Cancelelo y cree uno nuevo.',
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'El cambio de plan ya esta en estado final "%" y no se puede reabrir.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_plan_changes_guard_lifecycle ON public.plan_changes;
CREATE TRIGGER trg_plan_changes_guard_lifecycle
  BEFORE UPDATE ON public.plan_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_changes_guard_lifecycle();


-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 4 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'función activate_plan_change' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='activate_plan_change' AND n.nspname='public')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'función plan_changes_guard_lifecycle',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='plan_changes_guard_lifecycle' AND n.nspname='public')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trigger trg_activate_plan_change',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
            WHERE tgname='trg_activate_plan_change'
              AND tgrelid='public.sales'::regclass
              AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trigger trg_plan_changes_guard_lifecycle',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
            WHERE tgname='trg_plan_changes_guard_lifecycle'
              AND tgrelid='public.plan_changes'::regclass
              AND NOT tgisinternal)
       THEN 'OK' ELSE 'FALTA' END;
