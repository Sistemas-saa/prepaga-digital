-- =====================================================================
-- Fase 0 — Esquema para "Cambio de Plan" (FORMULARIO DE SOLICITUD DE CAMBIO)
-- Fecha: 2026-08-19
--
-- CONTEXTO
-- El "Cambio de Plan" es una operación firmable sobre un contrato YA FIRMADO,
-- calcada del modelo de "Incorporación de Adherente" (20260813000001).
-- Se crea una VENTA-OPERACIÓN propia (sales.sale_type='cambio_plan') que es
-- la que se firma y la que liquida comisión, y queda vinculada al contrato
-- madre por `parent_sale_id`. El contrato madre NO se toca hasta que el anexo
-- queda firmado (eso lo hace 20260819000002).
--
-- Por qué importa colgar de una venta-operación y no de la venta madre:
--   · El flujo de firma existente filtra TODO por sale_id; el DELETE de
--     documentos finales de useSignatureLinkPublic borraría el contrato
--     original si el anexo colgara de la venta madre.
--   · En comisiones hay un índice único que permite liquidar cada venta UNA
--     sola vez en la historia: mover el total de la venta madre dejaría al
--     vendedor sin comisión, en silencio.
--
-- SEGURIDAD
--   · Todo es ADITIVO: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--     / DROP POLICY IF EXISTS antes de CREATE POLICY.
--   · Ninguna columna existente se modifica, ni se borra ni actualiza dato alguno.
--   · Es idempotente: se puede correr más de una vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. plan_changes
-- ---------------------------------------------------------------------
-- El formulario en papel ("FORMULARIO DE SOLICITUD DE CAMBIO") trae:
--   · motivo del cambio (separación / mayor cobertura / menor cobertura)
--   · una tabla de INTEGRANTES con PLAN ANTERIOR y MONTO ANTERIOR
--   · observaciones
--   · "Fecha de Inicio nvo. Cto"
-- La tabla de integrantes se guarda como snapshot JSON (`members_snapshot`)
-- porque es una foto del contrato madre al momento de la solicitud: no debe
-- cambiar si después se editan los adherentes.

CREATE TABLE IF NOT EXISTS public.plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.companies(id),
  client_id  uuid NOT NULL REFERENCES public.clients(id),

  -- Venta-operación (1:1) y contrato madre
  operation_sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  parent_sale_id    uuid REFERENCES public.sales(id) ON DELETE SET NULL,

  -- Plan y montos: antes / después
  previous_plan_id uuid REFERENCES public.plans(id),
  new_plan_id      uuid REFERENCES public.plans(id),
  previous_total_amount numeric,
  new_total_amount      numeric,

  -- Motivo del cambio, tal como figura en el formulario
  reason text NOT NULL
    CHECK (reason IN ('separacion', 'mayor_cobertura', 'menor_cobertura')),

  -- Snapshot del titular al momento de la solicitud
  titular_name     text NOT NULL,
  titular_document text,

  -- Tabla de INTEGRANTES + PLAN ANTERIOR + MONTO ANTERIOR, como array JSON.
  -- Forma esperada de cada elemento:
  --   {"beneficiary_id": uuid|null, "is_primary": bool, "name": text,
  --    "previous_plan": text, "previous_amount": numeric, "new_amount": numeric}
  members_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(members_snapshot) = 'array'),

  new_contract_start_date date,
  observations text,

  -- Trazabilidad del circuito.
  -- Vocabulario en INGLES, igual que adherent_incorporations. NO confundir
  -- con sales.status, que va en espanol ('borrador', 'completado', ...).
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'completed', 'cancelled')),
  source text NOT NULL DEFAULT 'existing_sale'
    CHECK (source IN ('existing_sale', 'external_sale')),

  document_id       uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  signature_link_id uuid REFERENCES public.signature_links(id) ON DELETE SET NULL,

  notes        text,
  completed_at timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 1 venta-operación = 1 cambio de plan. A diferencia del anexo de adherentes
-- (que puede incorporar varias personas en filas distintas), acá una sola fila
-- describe todo el cambio: los integrantes van dentro de `members_snapshot`.
CREATE UNIQUE INDEX IF NOT EXISTS plan_changes_operation_sale_id_key
  ON public.plan_changes (operation_sale_id);

CREATE INDEX IF NOT EXISTS idx_plan_changes_parent_sale
  ON public.plan_changes (parent_sale_id);
CREATE INDEX IF NOT EXISTS idx_plan_changes_client
  ON public.plan_changes (client_id);
CREATE INDEX IF NOT EXISTS idx_plan_changes_company_status
  ON public.plan_changes (company_id, status);

ALTER TABLE public.plan_changes ENABLE ROW LEVEL SECURITY;

-- RLS idéntica a la de `adherent_incorporations`: super_admin ve todo, el
-- resto ve lo de su empresa. `auth.uid()` va envuelto en sub-select para que
-- Postgres lo evalúe una vez por query (evita el advisor auth_rls_initplan).
DROP POLICY IF EXISTS "plan_changes_select" ON public.plan_changes;
CREATE POLICY "plan_changes_select"
ON public.plan_changes FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "plan_changes_insert" ON public.plan_changes;
CREATE POLICY "plan_changes_insert"
ON public.plan_changes FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "plan_changes_update" ON public.plan_changes;
CREATE POLICY "plan_changes_update"
ON public.plan_changes FOR UPDATE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

-- NOTA: a propósito NO se agrega una policy de acceso anónimo por token de
-- firma. El firmante público lee `sales`/`documents`, no esta tabla.


-- ---------------------------------------------------------------------
-- 2. Numeración: que los cambios de plan NO consuman números de contrato
-- ---------------------------------------------------------------------
-- `generate_contract_number` sobrescribe contract_number en CADA insert de
-- `sales`. Como el cambio de plan crea una venta-operación, se llevaría un
-- correlativo real (2026-000200, ...) y dejaría huecos en la numeración de
-- contratos, que es visible para el negocio.
--
-- Se le agrega una serie propia: CMB-YYYY-NNNNNN, con su propia secuencia
-- (cuenta sólo los contract_number LIKE 'CMB-'||year_part||'-%').
-- La rama de 'alta_adherente' (ANX-) y el comportamiento original quedan
-- EXACTAMENTE iguales que en 20260813000002.
--
-- Offset del SUBSTRING: 'CMB-' (4) + 'YYYY' (4) + '-' (1) = 9 caracteres,
-- así que el correlativo empieza en la posición 10, igual que en 'ANX-'.

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

  -- Serie separada para las operaciones de cambio de plan, por el mismo
  -- motivo. Secuencia independiente de la de anexos y de la de contratos.
  IF NEW.sale_type = 'cambio_plan' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 10 FOR 6) AS INTEGER)), 0) + 1
    INTO next_number
    FROM public.sales
    WHERE contract_number LIKE 'CMB-' || year_part || '-%';

    sequence_part := LPAD(next_number::TEXT, 6, '0');
    NEW.contract_number := 'CMB-' || year_part || '-' || sequence_part;
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
-- VERIFICACIÓN — todas las filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'tabla plan_changes' AS chequeo,
       CASE WHEN to_regclass('public.plan_changes') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'RLS activo',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.plan_changes'::regclass)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'índice único operation_sale_id',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='plan_changes_operation_sale_id_key')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'policy plan_changes_select',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
            WHERE tablename='plan_changes' AND policyname='plan_changes_select')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'policy plan_changes_insert',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
            WHERE tablename='plan_changes' AND policyname='plan_changes_insert')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'policy plan_changes_update',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
            WHERE tablename='plan_changes' AND policyname='plan_changes_update')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'cambios de plan con serie propia CMB-',
       CASE WHEN pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='generate_contract_number' AND n.nspname='public')) LIKE '%CMB-%'
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'serie ANX- de anexos intacta',
       CASE WHEN pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='generate_contract_number' AND n.nspname='public')) LIKE '%alta_adherente%'
       THEN 'OK' ELSE 'FALTA' END;
