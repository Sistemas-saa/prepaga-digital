-- `sales.total_amount` deja de contar a los beneficiarios dados de baja.
--
-- POR QUÉ
-- La baja de un empleado no borra su fila: la marca `status = 'inactive'` con su
-- `coverage_end_date`, para que el contrato conserve la historia de la nómina y
-- el anexo firmado siga teniendo a quién apuntar. Pero mientras el cálculo del
-- total siga sumando TODOS los beneficiarios, dar de baja a alguien no bajaría
-- la cuota: el contrato seguiría facturando a una persona que ya no está
-- cubierta.
--
-- QUÉ CAMBIA
-- Exactamente dos líneas de `recalculate_sale_total_amount(p_sale_id uuid)`: se
-- le agrega `AND COALESCE(status,'active') = 'active'` a sus dos lecturas de
-- `beneficiaries`. La función sigue siendo la ÚNICA fuente de verdad del total
-- (ver 20260818000001_fix_total_amount_single_source.sql) y la versión trigger
-- sigue delegando en ella sin tocarse.
--
-- IMPACTO SOBRE LOS DATOS ACTUALES: NINGUNO.
-- Verificado antes de escribir esto: las 39 filas de `beneficiaries` están en
-- `status='active'`, así que el filtro no cambia ni un total CALCULADO. El
-- control de abajo lo comprueba de nuevo al aplicar y ABORTA si alguno
-- cambiaría — así nadie descubre una diferencia después del COMMIT.
--
-- Ese control compara la fórmula vieja contra la nueva, NO contra
-- `sales.total_amount`. Ver el comentario largo del bloque: hay ventas cuyo
-- total guardado legítimamente no sale de esta fórmula.

-- ---------------------------------------------------------------------
-- 1. Normalización defensiva (esperado: 0 filas)
-- ---------------------------------------------------------------------
UPDATE public.beneficiaries
   SET status = 'active'
 WHERE status IS NULL OR btrim(status) = '';

-- ---------------------------------------------------------------------
-- 2. La función, con el filtro nuevo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_primary boolean;
  v_sum numeric;
  v_primary numeric;
  v_titular numeric;
BEGIN
  -- Sólo la nómina ACTIVA. Un beneficiario 'inactive' es alguien dado de baja
  -- por un anexo firmado: su fila se conserva como historia, pero no factura.
  SELECT COALESCE(bool_or(COALESCE(is_primary, false)), false),
         COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_has_primary, v_sum
  FROM public.beneficiaries
  WHERE sale_id = p_sale_id
    AND COALESCE(status, 'active') = 'active';

  IF v_has_primary THEN
    SELECT COALESCE(amount, 0) INTO v_primary
    FROM public.beneficiaries
    WHERE sale_id = p_sale_id
      AND COALESCE(is_primary, false)
      AND COALESCE(status, 'active') = 'active'
    LIMIT 1;

    -- Si el titular tiene monto 0 NO se pisa titular_amount: preserva el valor
    -- cargado a mano o traído del plan (mismo criterio que el front).
    IF v_primary > 0 THEN
      UPDATE public.sales SET total_amount = v_sum, titular_amount = v_primary WHERE id = p_sale_id;
    ELSE
      UPDATE public.sales SET total_amount = v_sum WHERE id = p_sale_id;
    END IF;
  ELSE
    SELECT COALESCE(titular_amount, 0) INTO v_titular FROM public.sales WHERE id = p_sale_id;
    UPDATE public.sales SET total_amount = v_titular + v_sum WHERE id = p_sale_id;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Control: el filtro no puede cambiar ningun total CALCULADO
-- ---------------------------------------------------------------------
-- OJO CON QUE SE COMPARA: las DOS FORMULAS entre si (la de antes, sin filtro,
-- contra la nueva, con filtro) y NO cada una contra `sales.total_amount`.
--
-- La diferencia importa. Hay ventas cuyo total guardado legitimamente NO sale
-- de esta formula: las venta-operacion de CAMBIO DE PLAN (`CMB-*`) no tienen
-- ninguna fila en `beneficiaries` y llevan su importe directo en
-- `total_amount`, puesto por `useCreatePlanChange`. Compararlas contra la
-- formula las marca como diferencia y aborta una migracion que en realidad no
-- las toca. (Paso en US test con CMB-2026-000001 y CMB-2026-000002.)
--
-- De paso, eso deja a la vista que `recalculate_sale_total_amount` pondria en
-- CERO el total de un cambio de plan si alguna vez se la llamara sobre esa
-- venta. Hoy no pasa: el trigger dispara sobre `beneficiaries` y esas ventas no
-- tienen ninguno, y `activate_plan_change` recalcula el contrato MADRE, no la
-- operacion. Es deuda preexistente, ajena a esta migracion.
DO $control$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.contract_number,
           -- Formula ANTERIOR: suma todos los beneficiarios.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_viejo,
           -- Formula NUEVA: solo los activos.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false)
                             AND COALESCE(b.status,'active') = 'active')
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      RAISE WARNING 'el filtro cambiaria % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_n > 0 THEN
    RAISE EXCEPTION
      'El filtro por status cambiaria el total calculado de % venta(s). Significa que ya hay beneficiarios inactivos: revisar los WARNING antes de aplicar.', v_n;
  END IF;

  RAISE NOTICE 'Control OK: el filtro por status no cambia ningun total calculado.';
END
$control$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'la funcion filtra por status' AS chequeo,
       CASE WHEN pg_get_functiondef('public.recalculate_sale_total_amount(uuid)'::regprocedure)
                 LIKE '%COALESCE(status, ''active'') = ''active''%'
       THEN 'OK' ELSE 'ES LA VERSION VIEJA' END AS estado
UNION ALL
SELECT 'el trigger sigue delegando en la version con argumento',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
            AND pg_get_function_result(p.oid) = 'trigger'
            AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%')
       THEN 'OK' ELSE 'FALTA' END;
