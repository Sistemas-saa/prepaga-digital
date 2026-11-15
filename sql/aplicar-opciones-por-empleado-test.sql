-- ============================================================================
-- US TEST (ykducvvcjzdpoojxlsig) — Opciones por EMPLEADO en la nomina
-- ============================================================================
-- PROYECTO   SAMAP Prepaga Digital
-- PROJECT_ID ykducvvcjzdpoojxlsig  (US TEST)
--
-- ⚠️ NO CORRER ESTO CONTRA PRODUCCION (ejiycfqxgtrzaysgpzmx).
--    El modulo de nomina de empresa no existe alla; ver CLAUDE.md, "Estado por
--    entorno".
--
-- ----------------------------------------------------------------------------
-- POR QUE
-- ----------------------------------------------------------------------------
--   En una venta a EMPRESA el contrato es uno solo, pero cada empleado contrata
--   su propio plan por su propio monto. La pestaña Basico seguia pidiendo, a
--   nivel VENTA, tres cosas que en ese modelo son de cada funcionario:
--
--     · el plan            → ya vive en beneficiaries.plan_id (desde 20260908)
--     · si tiene adherentes → no existia por persona
--     · el adicional Plan Materno → no existia por persona
--
--   Este script agrega las dos columnas que faltaban. `sales.plan_id` NO se
--   toca: el front lo deriva del primer empleado activo de la nomina, para no
--   dejar en NULL una columna que leen el workflow (`has_plan`), la herencia de
--   la venta-operacion de anexo y la resolucion de reglas de comisiones.
--
-- ----------------------------------------------------------------------------
-- GARANTIA DE CERO IMPACTO
-- ----------------------------------------------------------------------------
--   · Las dos columnas nacen con DEFAULT false: una venta a persona fisica y
--     las nominas ya cargadas no cambian de comportamiento.
--   · El unico UPDATE es el backfill de `requires_adherents` sobre empleados
--     que YA tienen adherentes colgando. Sin el, esas nominas perderian el
--     boton "Agregar adherente" y pareceria que el sistema se rompio.
--   · No se toca `beneficiaries_status_check` ni ningun trigger.
--   · Idempotente: se puede correr dos veces.
--
--   El backfill escribe en `beneficiaries`, asi que en una venta ya FIRMADA lo
--   frenaria `trg_beneficiaries_block_when_sale_signed`. Por eso el UPDATE
--   excluye las ventas cerradas: en ellas el flag se deja en false y la nomina
--   igual muestra el boton porque ya tiene adherentes (la UI hace el OR).
-- ============================================================================

BEGIN;

-- ── 1. Las dos columnas ─────────────────────────────────────────────────────
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS requires_adherents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maternity_bonus    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.beneficiaries.requires_adherents IS
  'Solo empleados de una nomina de empresa: declara que esta persona tiene grupo familiar. Habilita cargarle adherentes en la pestaña Nomina.';
COMMENT ON COLUMN public.beneficiaries.maternity_bonus IS
  'Solo empleados de una nomina de empresa: adicional Plan Materno de ESA persona. Los campos del Plan Materno siguen siendo del contrato (template_responses es por venta).';

-- ── 2. Backfill de requires_adherents ───────────────────────────────────────
UPDATE public.beneficiaries e
   SET requires_adherents = true
 WHERE e.member_role = 'empleado'
   AND e.requires_adherents = false
   AND EXISTS (SELECT 1 FROM public.beneficiaries a
                WHERE a.parent_beneficiary_id = e.id)
   AND NOT EXISTS (SELECT 1 FROM public.sales s
                    WHERE s.id = e.sale_id
                      AND s.status IN ('firmado','completado'));

COMMIT;

-- ── Verificacion ────────────────────────────────────────────────────────────
SELECT 'beneficiaries: las 2 columnas nuevas' AS control,
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='beneficiaries'
                     AND column_name IN ('requires_adherents','maternity_bonus')) = 2
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'ningun empleado con adherentes quedo sin el flag (venta abierta)',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.beneficiaries e
               WHERE e.member_role = 'empleado'
                 AND e.requires_adherents = false
                 AND EXISTS (SELECT 1 FROM public.beneficiaries a
                              WHERE a.parent_beneficiary_id = e.id)
                 AND NOT EXISTS (SELECT 1 FROM public.sales s
                                  WHERE s.id = e.sale_id
                                    AND s.status IN ('firmado','completado')))
       THEN 'OK' ELSE 'QUEDARON EMPLEADOS SIN BACKFILL' END
UNION ALL
SELECT 'nadie quedo con Plan Materno por error',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.beneficiaries WHERE maternity_bonus)
       THEN 'OK' ELSE 'HAY FILAS MARCADAS (esperado solo si ya se uso la pantalla)' END
UNION ALL
SELECT 'el CHECK de status sigue admitiendo pending_addendum_signature',
       CASE WHEN pg_get_constraintdef((SELECT oid FROM pg_constraint
                                        WHERE conname='beneficiaries_status_check'
                                          AND conrelid='public.beneficiaries'::regclass))
                 LIKE '%pending_addendum_signature%'
       THEN 'OK' ELSE 'SE ROMPIO EL FLUJO LEGADO sale_addendums' END;
