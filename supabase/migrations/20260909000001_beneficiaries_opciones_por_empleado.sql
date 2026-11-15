-- ============================================================================
-- Opciones por EMPLEADO en la nomina de un contrato de empresa
-- ============================================================================
-- En una venta a EMPRESA el contrato es uno solo, pero cada empleado contrata
-- su propio plan por su propio monto. La pestaña Basico seguia pidiendo, a
-- nivel VENTA, tres cosas que en ese modelo son de cada funcionario:
--
--   · el plan                    -> ya vive en beneficiaries.plan_id (20260908000001)
--   · si tiene grupo familiar    -> no existia por persona
--   · el adicional Plan Materno  -> no existia por persona
--
-- Esta migracion agrega las dos columnas que faltaban.
--
-- `sales.plan_id` NO se toca: el front lo deriva del primer empleado activo de
-- la nomina (ver `planDeReferenciaDeNomina` en src/lib/nomina.ts), para no
-- dejar en NULL una columna que leen la condicion `has_plan` del workflow, la
-- herencia de plan de la venta-operacion de un anexo y la resolucion de reglas
-- de comisiones — que nunca asume 0%.
--
-- Los CAMPOS del Plan Materno siguen siendo del contrato: `template_responses`
-- es por venta, no por persona. Alcanza con que un empleado lo tenga para que
-- se habilite la pestaña "Campos del Plan", que se completa una sola vez.
--
-- Cero impacto: las dos columnas nacen en false, asi que una venta a persona
-- fisica y las nominas ya cargadas no cambian de comportamiento.
-- ============================================================================

ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS requires_adherents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maternity_bonus    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.beneficiaries.requires_adherents IS
  'Solo empleados de una nomina de empresa: declara que esta persona tiene grupo familiar. Habilita cargarle adherentes en la pestaña Nomina.';
COMMENT ON COLUMN public.beneficiaries.maternity_bonus IS
  'Solo empleados de una nomina de empresa: adicional Plan Materno de ESA persona. Los campos del Plan Materno siguen siendo del contrato (template_responses es por venta).';

-- Backfill: un empleado que YA tiene adherentes cargados obviamente requiere
-- grupo familiar. Sin esto, esas nominas perderian el boton "Agregar adherente"
-- y pareceria que el sistema se rompio.
--
-- Se excluyen las ventas cerradas porque el UPDATE escribe en `beneficiaries` y
-- ahi lo frenaria `trg_beneficiaries_block_when_sale_signed`. No importa: la UI
-- muestra el boton igual cuando el empleado ya tiene adherentes.
UPDATE public.beneficiaries e
   SET requires_adherents = true
 WHERE e.member_role = 'empleado'
   AND e.requires_adherents = false
   AND EXISTS (SELECT 1 FROM public.beneficiaries a
                WHERE a.parent_beneficiary_id = e.id)
   AND NOT EXISTS (SELECT 1 FROM public.sales s
                    WHERE s.id = e.sale_id
                      AND s.status IN ('firmado','completado'));
