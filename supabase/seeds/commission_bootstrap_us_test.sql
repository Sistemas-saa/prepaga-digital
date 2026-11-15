-- Semilla mínima para poder USAR el módulo de comisiones en US test.
--
-- NO es una migración: son datos, no esquema. Por eso vive en seeds/ y no en
-- migrations/ — si estuviera en migrations/ se aplicaría sola en producción.
--
-- Motivo: commission_calculate_sale exige el mapeo de cada plan a
-- INDIVIDUAL/GRUPAL (commission_plan_settings) y esa tabla todavía no tiene
-- pantalla en la app: useCommissions.ts sólo hace SELECT sobre ella. Sin la
-- fila, el cálculo devuelve 'plan_not_configured'.
--
-- Habilitar vendedores SÍ tiene UI (pestaña Reglas > "Habilitar vendedor").
--
-- Es idempotente: se puede correr varias veces sin duplicar nada.
-- El company_id se deriva de los planes existentes, para no depender de un UUID
-- hardcodeado que podría no coincidir en test.

-- Mapeo plan -> INDIVIDUAL / GRUPAL, para todos los planes activos.
-- Se siembra todo como INDIVIDUAL: los planes actuales (Alfa, Beta, Kids,
-- Senior, Seven, Alfa Ambulatorio) son productos individuales. Si alguno es
-- grupal (empresarial/corporativo), cambialo con el UPDATE de más abajo.
INSERT INTO public.commission_plan_settings (company_id, plan_id, group_type, is_active)
SELECT p.company_id, p.id, 'INDIVIDUAL', true
FROM public.plans p
WHERE p.is_active
ON CONFLICT (company_id, plan_id) DO NOTHING;

-- Para marcar un plan como GRUPAL (ejemplo, ajustar el nombre):
-- UPDATE public.commission_plan_settings ps
--    SET group_type = 'GRUPAL', updated_at = now()
--   FROM public.plans p
--  WHERE p.id = ps.plan_id AND p.name ILIKE '%empresarial%';

-- Verificación: qué quedó configurado y qué falta.
SELECT 'planes mapeados' AS item, count(*)::text AS valor FROM public.commission_plan_settings
UNION ALL
SELECT 'planes activos sin mapear', count(*)::text
  FROM public.plans p
 WHERE p.is_active
   AND NOT EXISTS (SELECT 1 FROM public.commission_plan_settings ps WHERE ps.plan_id = p.id)
UNION ALL
SELECT 'vendedores habilitados', count(*)::text FROM public.commission_salespeople WHERE is_active
UNION ALL
SELECT 'reglas activas', count(*)::text FROM public.commission_rules WHERE is_active
UNION ALL
SELECT 'modulo habilitado (is_enabled)', coalesce(bool_or(is_enabled)::text, 'sin fila')
  FROM public.commission_settings;
