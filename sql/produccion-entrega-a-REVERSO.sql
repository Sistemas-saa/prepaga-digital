-- ============================================================================
-- VUELTA ATRAS DEL PASE DE LA ENTREGA A — BR PRODUCCION
-- ============================================================================
-- Para usar SOLO si, despues de aplicar sql/produccion-entrega-a.sql, algo del
-- modulo nuevo se comporta mal y hay que devolverle a prod el comportamiento
-- que tenia antes, SIN restaurar un backup.
--
-- QUE NO HACE (a proposito):
--   * No borra NADA: ni filas, ni tablas, ni columnas, ni contratos, ni PDFs.
--     Las tablas y columnas nuevas quedan: son inertes (el front viejo las
--     ignora, probado en el clon) y lo que se haya cargado en ellas se conserva.
--   * No toca datos de clientes ni de ventas.
--   * No toca WhatsApp / WAHA / OTP / SMS / email ni company_settings.
--   * No vuelve a crear el CHECK sales_titular_amount_positive_when_active:
--     el trigger que lo reemplazo aplica la MISMA regla a las ventas comunes, y
--     re-crear el CHECK fallaria si ya hay anexos o ventas a empresa enviados.
--
-- QUE HACE: interruptores independientes. Cada uno se activa con su variable
-- de abajo (por defecto, todos). Ninguno escribe filas de clientes:
--   r_funciones   recalculate_sale_total_amount() y generate_contract_number()
--                 vuelven a su definicion de prod (capturada el 2026-11-15)
--   r_triggers    DISABLE de los 4 triggers nuevos con efecto sobre ventas y
--                 adherentes (quedan definidos; ENABLE los vuelve a prender)
--   r_cron        desagenda el job notify-expiring-sales
--   r_plantillas  desactiva (is_active=false) las 10 plantillas del pase
--
-- SEGURIDAD: por defecto corre en MODO SIMULACRO (v_simulacro = true): hace
-- todo, verifica, y termina con el error "REVERSO SIMULADO OK", que deshace
-- todo. Para aplicarlo de verdad hay que cambiar a false a mano.
--
-- Es UNA sola sentencia DO: atomica en cualquier cliente (SQL Editor o psql).
-- ============================================================================
DO $reverso$
DECLARE
  v_simulacro   boolean := true;   -- <<< false para aplicarlo de verdad
  r_funciones   boolean := true;
  r_triggers    boolean := true;
  r_cron        boolean := true;
  r_plantillas  boolean := true;

  v_hechos      text[] := '{}';
  v_n           bigint;
  v_t           record;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  -- El reverso solo tiene sentido sobre una base con el pase aplicado.
  IF to_regclass('public.adherent_incorporations') IS NULL THEN
    RAISE EXCEPTION 'Esta base no tiene el pase de la Entrega A aplicado. No se hizo nada.';
  END IF;

  -- --------------------------------------------------------------------------
  IF r_funciones THEN
    -- Definiciones de BR prod ANTES del pase (pg_get_functiondef, 2026-11-15).
    -- md5 de pg_get_functiondef: recalculate aa9f429b..., generate 2d81e357...
    EXECUTE $f1$
CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id UUID;
  v_total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sale_id := OLD.sale_id;
  ELSE
    v_sale_id := NEW.sale_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM beneficiaries
  WHERE sale_id = v_sale_id;

  UPDATE sales SET total_amount = v_total WHERE id = v_sale_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$
$f1$;

    EXECUTE $f2$
CREATE OR REPLACE FUNCTION public.generate_contract_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  year_part TEXT;
  sequence_part TEXT;
  next_number INTEGER;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 6 FOR 6) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE contract_number LIKE year_part || '-%';

  sequence_part := LPAD(next_number::TEXT, 6, '0');
  NEW.contract_number := year_part || '-' || sequence_part;

  RETURN NEW;
END;
$function$
$f2$;

    IF md5(pg_get_functiondef('public.recalculate_sale_total_amount()'::regprocedure)) <> 'aa9f429b75481a3dd6819e23db5d35b2'
       OR md5(pg_get_functiondef('public.generate_contract_number()'::regprocedure)) <> '2d81e357d4a61c4f3c1929f726a90648' THEN
      RAISE EXCEPTION 'Las funciones restauradas no quedaron byte a byte iguales a las de prod antes del pase. No se hizo nada.';
    END IF;
    v_hechos := v_hechos || 'funciones restauradas (md5 = prod antes del pase)'::text;
  END IF;

  -- --------------------------------------------------------------------------
  IF r_triggers THEN
    FOR v_t IN
      SELECT * FROM (VALUES
        ('beneficiaries', 'trg_beneficiaries_block_when_sale_signed'),
        ('beneficiaries', 'trg_beneficiaries_validate_nomina'),
        ('sales',         'trg_activate_adherent_incorporation'),
        ('sales',         'trg_activate_plan_change')) x(tabla, nombre)
    LOOP
      IF EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = format('public.%I', v_t.tabla)::regclass
                    AND tgname = v_t.nombre AND NOT tgisinternal) THEN
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_t.tabla, v_t.nombre);
        v_hechos := v_hechos || format('trigger %s.%s deshabilitado', v_t.tabla, v_t.nombre);
      END IF;
    END LOOP;
  END IF;

  -- --------------------------------------------------------------------------
  IF r_cron AND to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-expiring-sales';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_hechos := v_hechos || format('cron notify-expiring-sales desagendado (%s)', v_n);
  END IF;

  -- --------------------------------------------------------------------------
  IF r_plantillas THEN
    -- Solo las 5 plantillas por empresa que sembro el pase (filas que el propio
    -- pase creo). No se borran: quedan inactivas, con su contenido.
    UPDATE public.templates SET is_active = false
     WHERE is_active
       AND name IN ('Anexo de Incorporación de Adherente', 'Formulario de Solicitud de Cambio de Plan',
                    'Anexo Especial de Vigencia Inmediata', 'Contrato Colectivo de Empresa',
                    'Anexo de Movimiento de Nomina');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 10 THEN
      RAISE EXCEPTION 'Se iban a desactivar % plantillas y el pase sembro 10. No se hizo nada.', v_n;
    END IF;
    v_hechos := v_hechos || format('%s plantillas del pase desactivadas', v_n);
  END IF;

  -- --------------------------------------------------------------------------
  IF v_simulacro THEN
    RAISE EXCEPTION 'REVERSO SIMULADO OK — nada quedo aplicado. Habria hecho: %', array_to_string(v_hechos, '; ');
  END IF;
  RAISE NOTICE 'REVERSO APLICADO: %', array_to_string(v_hechos, '; ');
END
$reverso$;
