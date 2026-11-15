-- =====================================================================
-- Nombre único de plantilla por empresa
-- Fecha: 2026-08-22
--
-- QUÉ HACE
-- Un índice UNIQUE sobre (company_id, name) en `templates`.
--
-- POR QUÉ
-- La migración siguiente (20260822000002) siembra las 3 plantillas de los
-- tipos de venta con `ON CONFLICT (company_id, name) DO NOTHING`, para que
-- correrla dos veces no duplique nada y para NO pisar una plantilla que un
-- admin haya editado a mano. Ese ON CONFLICT necesita un índice único que
-- hoy no existe: `templates` sólo tiene `templates_pkey` e
-- `idx_templates_company_id` (no único).
--
-- De paso cierra la puerta a dos plantillas con el mismo nombre en la misma
-- empresa, que hoy es posible y confunde al vendedor en el selector.
--
-- SEGURIDAD
--   · No borra ni modifica datos.
--   · El preflight aborta ANTES de crear nada si hay duplicados, con la
--     lista exacta, para que se resuelvan a mano. Verificado al escribir
--     esta migración: hoy no hay duplicados en test.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Preflight: si ya hay nombres repetidos, el CREATE UNIQUE INDEX fallaría
-- con un mensaje inútil ("could not create unique index"). Abortamos antes
-- diciendo exactamente cuáles son.
-- ---------------------------------------------------------------------
DO $preflight$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('company_id=%s name=%L (%s veces)', company_id, name, n), E'\n  ')
    INTO v_dups
    FROM (
      SELECT company_id, name, count(*) AS n
        FROM public.templates
       GROUP BY company_id, name
      HAVING count(*) > 1
    ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      'No se puede crear uq_templates_company_name: hay plantillas con nombre repetido en la misma empresa.%  Resolvelas (renombrar o desactivar) y volvé a correr esta migración.',
      E'\n  ' || v_dups;
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_company_name
  ON public.templates (company_id, name);

COMMENT ON INDEX public.uq_templates_company_name IS
  'Nombre de plantilla único por empresa. Habilita el ON CONFLICT del seed de plantillas de tipos de venta (20260822000002).';
