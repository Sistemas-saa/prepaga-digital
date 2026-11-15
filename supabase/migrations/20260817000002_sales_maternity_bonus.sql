-- Plan Materno como ADICIONAL de la venta, no como plan propio.
--
-- Definición del negocio: el Plan Materno va siempre ligado a otro plan; no se
-- contrata solo. Hasta ahora la pestaña "Campos del Plan" se activaba buscando
-- un template con el MISMO NOMBRE que el plan elegido, lo que obligaba a que
-- "Plan Materno" existiera como fila en `plans` para poder cargar sus campos.
--
-- Con esta bandera el vendedor tilda "Incluye Plan Materno" al inicio de la
-- venta y los campos se habilitan sobre CUALQUIER plan contratado.
--
-- El nombre de la columna no es nuevo: src/components/AuditSaleDetails.tsx ya
-- leía `sale.maternity_bonus` ("Prima de Maternidad"), pero la columna no
-- existía, así que ese campo mostraba "No" para todas las ventas. Esta
-- migración también arregla eso.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS maternity_bonus boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales.maternity_bonus IS
  'La venta incluye el adicional Plan Materno. Habilita los campos del template "Plan Materno" sobre cualquier plan contratado.';

-- Índice parcial: las ventas con el adicional son la minoría y se filtran por
-- esta condición en reportes.
CREATE INDEX IF NOT EXISTS idx_sales_maternity_bonus
  ON public.sales (company_id) WHERE maternity_bonus;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 2 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'columna sales.maternity_bonus' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='sales'
              AND column_name='maternity_bonus')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'indice idx_sales_maternity_bonus',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
            WHERE schemaname='public' AND indexname='idx_sales_maternity_bonus')
       THEN 'OK' ELSE 'FALTA' END;
