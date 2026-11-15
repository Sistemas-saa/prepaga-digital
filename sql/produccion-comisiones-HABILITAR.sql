-- ============================================================================
-- COMISIONES — HABILITAR EN MODO PRUEBA (BR prod, empresa SAMAP Prepaga Digital)
-- ============================================================================
-- Correr DESPUES de sql/produccion-comisiones.sql. Pegar entero en el SQL Editor.
--
-- Que hace (solo inserta filas en tablas NUEVAS del modulo; no toca ventas,
-- clientes, planes ni ninguna tabla existente):
--   1. commission_settings de la empresa 0a1dc0e5-...: modulo HABILITADO,
--      devengamiento "venta completada" y prefijo de liquidacion 'PRUEBA-'
--      (las liquidaciones de prueba quedan identificadas y no consumen la
--      numeracion real LIQ-).
--   2. commission_plan_settings: los 6 planes activos como INDIVIDUAL. Es un
--      valor inicial para que el calculo no de "plan no configurado"; no tiene
--      pantalla y se corrige por SQL cuando se defina cuales son GRUPAL.
-- Idempotente: si ya existe la fila, no la pisa.
--
-- MODO PRUEBA: generar liquidaciones en BORRADOR para comparar esta permitido.
-- NO "Cerrar" ni "Pagar" ninguna hasta validar contra la planilla manual.
--
-- Pasar a modo real (cuando se valide): ver sql/produccion-comisiones-MODO-REAL.sql
-- Apagar todo al instante (no borra nada):
--   UPDATE public.commission_settings SET is_enabled = false
--    WHERE company_id = '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6';
-- ============================================================================

DO $habilitar$
DECLARE
  v_empresa constant uuid := '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6';
  v_planes int;
BEGIN
  IF to_regclass('public.commission_settings') IS NULL THEN
    RAISE EXCEPTION 'El modulo de comisiones no esta instalado: correr antes sql/produccion-comisiones.sql. No se hizo nada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_empresa) THEN
    RAISE EXCEPTION 'No existe la empresa %. No se hizo nada.', v_empresa;
  END IF;

  INSERT INTO public.commission_settings (company_id, is_enabled, accrual_event, liquidation_prefix, next_liquidation_number)
  VALUES (v_empresa, true, 'venta_completada', 'PRUEBA-', 1)
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.commission_plan_settings (company_id, plan_id, group_type, is_active)
  SELECT p.company_id, p.id, 'INDIVIDUAL', true
    FROM public.plans p
   WHERE p.company_id = v_empresa AND p.is_active
  ON CONFLICT (company_id, plan_id) DO NOTHING;
  GET DIAGNOSTICS v_planes = ROW_COUNT;

  RAISE NOTICE 'Comisiones habilitado en modo prueba. Planes clasificados ahora: %', v_planes;
END
$habilitar$;

SELECT 'modulo habilitado' AS control,
       CASE WHEN (SELECT is_enabled FROM public.commission_settings
                   WHERE company_id = '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6') THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'prefijo de prueba (PRUEBA-)',
       CASE WHEN (SELECT liquidation_prefix FROM public.commission_settings
                   WHERE company_id = '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6') = 'PRUEBA-' THEN 'OK' ELSE 'REVISAR' END
UNION ALL
SELECT 'planes activos sin clasificar',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.plans p
                              WHERE p.company_id = '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6' AND p.is_active
                                AND NOT EXISTS (SELECT 1 FROM public.commission_plan_settings ps WHERE ps.plan_id = p.id))
            THEN 'OK' ELSE 'FALTA' END;
