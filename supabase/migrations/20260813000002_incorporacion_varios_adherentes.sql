-- =====================================================================
-- Fase 2 — Ajuste: un Anexo puede incorporar VARIAS personas
-- Fecha: 2026-08-13
--
-- POR QUÉ
-- El documento "Anexo de Incorporación de Adherente" dice textualmente
-- "incorpora ... como adherente/s a la/s siguiente/s persona/s" y trae una
-- tabla de 6 filas: un mismo anexo puede incorporar varias personas.
--
-- La tabla `adherent_incorporations` describe UNA persona por fila
-- (adherent_first_name, adherent_last_name, activated_beneficiary_id son
-- todos singulares), pero traía `operation_sale_id` como UNIQUE, lo que
-- forzaba una sola persona por operación. Esa restricción es la pieza
-- inconsistente: se reemplaza por un índice normal.
--
-- Modelo resultante:
--   1 Anexo  =  1 venta-operación  =  N filas de adherent_incorporations
--
-- SEGURIDAD: no borra ni modifica datos. Solo afloja restricciones, así que
-- todo lo que era válido antes lo sigue siendo. Idempotente.
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
  -- 1. Quitar cualquier CONSTRAINT UNIQUE sobre (operation_sale_id).
  --    Se busca por columnas y no por nombre porque en TEST la tabla fue
  --    creada por fuera del repo y el nombre puede no coincidir.
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'adherent_incorporations'
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text)
        FROM unnest(con.conkey) AS k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['operation_sale_id']
  LOOP
    EXECUTE format('ALTER TABLE public.adherent_incorporations DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Constraint UNIQUE eliminada: %', r.conname;
  END LOOP;

  -- 2. Quitar índices UNIQUE sueltos sobre la misma columna.
  FOR r IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE ns.nspname = 'public'
      AND t.relname = 'adherent_incorporations'
      AND x.indisunique
      AND NOT x.indisprimary
      AND (
        SELECT array_agg(att.attname::text)
        FROM unnest(x.indkey::int[]) AS k
        JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = k
      ) = ARRAY['operation_sale_id']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.relname);
    RAISE NOTICE 'Índice UNIQUE eliminado: %', r.relname;
  END LOOP;
END $$;

-- Índice normal: sigue haciendo falta para buscar los adherentes de una operación.
CREATE INDEX IF NOT EXISTS idx_adherent_incorporations_operation_sale
  ON public.adherent_incorporations (operation_sale_id);

-- `coverage_end_date` venía NOT NULL desde el esquema de test, pero el negocio
-- no tiene de dónde sacar ese dato al incorporar un adherente (la cobertura
-- sigue la del contrato madre). Se afloja en vez de inventar una fecha falsa.
ALTER TABLE public.adherent_incorporations ALTER COLUMN coverage_end_date DROP NOT NULL;


-- ---------------------------------------------------------------------
-- Numeración: que los anexos NO consuman números de contrato
-- ---------------------------------------------------------------------
-- `generate_contract_number` sobrescribe contract_number en CADA insert de
-- `sales`. Como la incorporación crea una venta-operación, cada anexo se
-- llevaría un correlativo real (2026-000200, ...) y dejaría huecos en la
-- numeración de contratos, que es visible para el negocio.
--
-- Se le agrega una serie propia para los anexos: ANX-YYYY-NNNNNN.
-- Para cualquier otro sale_type la lógica queda EXACTAMENTE igual que antes,
-- y como hoy no existe ninguna fila con sale_type='alta_adherente', ninguna
-- venta actual cambia de comportamiento.

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

  -- Serie separada para las operaciones de incorporación de adherente,
  -- para no gastar correlativos de la serie de contratos.
  IF NEW.sale_type = 'alta_adherente' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 10 FOR 6) AS INTEGER)), 0) + 1
    INTO next_number
    FROM public.sales
    WHERE contract_number LIKE 'ANX-' || year_part || '-%';

    sequence_part := LPAD(next_number::TEXT, 6, '0');
    NEW.contract_number := 'ANX-' || year_part || '-' || sequence_part;
    RETURN NEW;
  END IF;

  -- Comportamiento original, intacto.
  SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 6 FOR 6) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE contract_number LIKE year_part || '-%';

  sequence_part := LPAD(next_number::TEXT, 6, '0');
  NEW.contract_number := year_part || '-' || sequence_part;

  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 4 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'sin UNIQUE en operation_sale_id' AS chequeo,
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_index x
         JOIN pg_class t ON t.oid = x.indrelid
         WHERE t.relname='adherent_incorporations' AND x.indisunique AND NOT x.indisprimary
           AND (SELECT array_agg(att.attname::text) FROM unnest(x.indkey::int[]) k
                JOIN pg_attribute att ON att.attrelid=t.oid AND att.attnum=k) = ARRAY['operation_sale_id']
       ) THEN 'OK' ELSE 'TODAVÍA EXISTE' END AS estado
UNION ALL
SELECT 'índice de búsqueda presente',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='idx_adherent_incorporations_operation_sale')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'coverage_end_date nullable',
       CASE WHEN (SELECT is_nullable FROM information_schema.columns
                  WHERE table_name='adherent_incorporations' AND column_name='coverage_end_date') = 'YES'
       THEN 'OK' ELSE 'SIGUE NOT NULL' END
UNION ALL
SELECT 'anexos con serie propia ANX-',
       CASE WHEN pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='generate_contract_number' AND n.nspname='public')) LIKE '%alta_adherente%'
       THEN 'OK' ELSE 'FALTA' END;
