-- Fuente unica de verdad para sales.total_amount.
--
-- PROBLEMA
-- Conviven dos funciones con el mismo nombre y formulas distintas:
--
--   recalculate_sale_total_amount()          -> returns trigger  (la del trigger
--     trg_recalculate_sale_total sobre beneficiaries, AFTER INSERT/UPDATE/DELETE)
--     Cuerpo actual:  total_amount = COALESCE(SUM(amount),0)
--     IGNORA titular_amount y no distingue si hay fila is_primary.
--
--   recalculate_sale_total_amount(p_sale_id uuid) -> returns void
--     Con fila is_primary  -> total = suma de TODOS los beneficiarios
--     Sin fila is_primary  -> total = titular_amount + suma de adherentes
--     Ademas sincroniza titular_amount con el primary, pero solo si es > 0
--     (si el primary quedo en 0 no se pisa el valor cargado a mano).
--
-- El trigger dispara en cada alta/edicion/baja de adherente y pisa el total con
-- la formula incompleta. Cuando el titular NO existe como fila beneficiaria, su
-- monto DESAPARECE del total. Verificado en test antes de aplicar: de 22 ventas,
-- 2 tenian el total mal, y en 2026-000006 (borrador, 3 adherentes, sin primary)
-- faltaban exactamente 275.000 = el titular_amount.
--
-- SOLUCION
-- La version con argumento queda como unica implementacion. La del trigger pasa
-- a delegar en ella. Se reemplaza el CUERPO en vez de borrar funcion y trigger:
-- es idempotente y no rompe dependencias.
--
-- El frontend (src/hooks/useBeneficiaries.ts) deja de calcular por su cuenta en
-- el mismo commit; el calculo pasa a ser responsabilidad exclusiva de la base.

CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Delega en la version con argumento, que es la unica que contempla
  -- is_primary y titular_amount.
  PERFORM public.recalculate_sale_total_amount(COALESCE(NEW.sale_id, OLD.sale_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------
-- Backfill: reparar las ventas que quedaron con el total mal calculado.
-- Deja traza de cuantas y cuales cambian, para poder auditarlo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.contract_number,
           COALESCE(s.total_amount, 0) AS total_viejo,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      RAISE NOTICE 'backfill % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      PERFORM public.recalculate_sale_total_amount(r.id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'total_amount corregido en % venta(s)', v_n;
END $$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'el trigger delega en la version con argumento' AS chequeo,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
            AND pg_get_function_result(p.oid) = 'trigger'
            AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'no quedan totales mal calculados',
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM public.sales s
          WHERE COALESCE(s.total_amount,0) IS DISTINCT FROM (
            CASE WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                               WHERE b.sale_id = s.id AND COALESCE(b.is_primary,false))
                 THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b WHERE b.sale_id = s.id),0)
                 ELSE COALESCE(s.titular_amount,0)
                      + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b WHERE b.sale_id = s.id),0)
            END))
       THEN 'OK' ELSE 'QUEDAN DIFERENCIAS' END;
