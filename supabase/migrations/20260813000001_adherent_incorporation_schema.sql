-- =====================================================================
-- Fase 0 — Esquema para "Incorporación de Adherente" y "Empresas titular"
-- Fecha: 2026-08-13
--
-- CONTEXTO
-- La tabla `adherent_incorporations` YA EXISTE en la base de TEST pero
-- nunca fue versionada en el repo (llegó a types.ts en el commit 27d1c71,
-- que regeneró los tipos desde test). En PRODUCCIÓN no existe.
-- Esta migración la formaliza, respetando la forma que ya tiene en test
-- para que aplicarla ahí sea inocua.
--
-- SEGURIDAD
--   · Todo es ADITIVO: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--   · Ninguna columna existente se modifica, ni se borra ni actualiza dato alguno.
--   · Las columnas nuevas son nullable o tienen DEFAULT, así que las filas
--     actuales quedan válidas sin tocarlas.
--   · Es idempotente: se puede correr más de una vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. adherent_incorporations
-- ---------------------------------------------------------------------
-- Modelo clave: la incorporación NO modifica la venta madre. Crea una
-- VENTA-OPERACIÓN propia (`operation_sale_id`, sale_type='alta_adherente')
-- que es la que se firma y la que liquida comisión, y queda vinculada al
-- contrato madre por `parent_sale_id`.
--
-- Por qué importa: al colgar de un sale_id distinto, el flujo de firma
-- existente (que filtra todo por sale_id) no puede tocar el contrato madre.
-- En particular, el DELETE de documentos finales de useSignatureLinkPublic
-- borraría el contrato original si el anexo colgara de la venta madre.
--
-- Y en comisiones: existe un índice único que permite liquidar cada venta
-- UNA sola vez en la historia, así que subir el total de la venta madre
-- dejaría al vendedor sin comisión, en silencio.

CREATE TABLE IF NOT EXISTS public.adherent_incorporations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.companies(id),
  client_id  uuid NOT NULL REFERENCES public.clients(id),

  -- Venta-operación (1:1) y contrato madre
  operation_sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  parent_sale_id    uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  plan_id           uuid REFERENCES public.plans(id),

  -- Snapshot del titular al momento de la incorporación
  titular_name     text NOT NULL,
  titular_document text,
  titular_email    text,
  titular_phone    text,

  -- Datos del adherente que se incorpora
  adherent_first_name      text NOT NULL,
  adherent_last_name       text NOT NULL,
  adherent_document_type   text,
  adherent_document_number text,
  adherent_birth_date      date,
  adherent_relationship    text,
  adherent_email           text,
  adherent_phone           text,
  adherent_amount          numeric,

  -- Vigencia
  coverage_start_date date,
  coverage_end_date   date NOT NULL,

  -- Trazabilidad del circuito
  -- Vocabulario en INGLES, igual al que ya tiene la base de test. No confundir
  -- con sales.status, que va en espanol. Los CHECK se declaran aca para que una
  -- base NUEVA (produccion) quede identica a test; ver tambien la migracion
  -- 20260817000001, que corrige el trigger.
  status  text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'completed', 'cancelled')),
  source  text NOT NULL DEFAULT 'existing_sale'
    CHECK (source IN ('existing_sale', 'external_sale')),
  document_id       uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  signature_link_id uuid REFERENCES public.signature_links(id) ON DELETE SET NULL,
  -- Se completa recién cuando la firma termina: es el adherente REAL
  -- creado en la venta madre.
  activated_beneficiary_id uuid REFERENCES public.beneficiaries(id) ON DELETE SET NULL,

  notes        text,
  completed_at timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Una venta-operación pertenece a una sola incorporación
CREATE UNIQUE INDEX IF NOT EXISTS adherent_incorporations_operation_sale_id_key
  ON public.adherent_incorporations (operation_sale_id);

CREATE INDEX IF NOT EXISTS idx_adherent_incorporations_parent_sale
  ON public.adherent_incorporations (parent_sale_id);
CREATE INDEX IF NOT EXISTS idx_adherent_incorporations_client
  ON public.adherent_incorporations (client_id);
CREATE INDEX IF NOT EXISTS idx_adherent_incorporations_company_status
  ON public.adherent_incorporations (company_id, status);

ALTER TABLE public.adherent_incorporations ENABLE ROW LEVEL SECURITY;

-- RLS espejando el patrón de `documents`: super_admin ve todo, el resto
-- ve lo de su empresa. `auth.uid()` va envuelto en sub-select para que
-- Postgres lo evalúe una vez por query (evita el advisor auth_rls_initplan).
DROP POLICY IF EXISTS "adherent_incorporations_select" ON public.adherent_incorporations;
CREATE POLICY "adherent_incorporations_select"
ON public.adherent_incorporations FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "adherent_incorporations_insert" ON public.adherent_incorporations;
CREATE POLICY "adherent_incorporations_insert"
ON public.adherent_incorporations FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "adherent_incorporations_update" ON public.adherent_incorporations;
CREATE POLICY "adherent_incorporations_update"
ON public.adherent_incorporations FOR UPDATE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR company_id = get_user_company_id((SELECT auth.uid()))
);

-- Borrado más restrictivo que el resto: solo admin/super_admin.
DROP POLICY IF EXISTS "adherent_incorporations_delete" ON public.adherent_incorporations;
CREATE POLICY "adherent_incorporations_delete"
ON public.adherent_incorporations FOR DELETE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR (has_role((SELECT auth.uid()), 'admin'::app_role)
      AND company_id = get_user_company_id((SELECT auth.uid())))
);

-- NOTA: a propósito NO se agrega una policy de acceso anónimo por token de
-- firma. El firmante público lee `sales`/`documents`, no esta tabla. Si más
-- adelante la UI de firma la necesita, agregar:
--   USING (operation_sale_id = get_sale_id_from_signature_token())


-- ---------------------------------------------------------------------
-- 2. Campos que exige el documento "Anexo de Incorporación de Adherente"
-- ---------------------------------------------------------------------
-- La tabla del anexo tiene columnas "Fecha de Ingreso" y "V.I." POR
-- ADHERENTE. Hoy la vigencia inmediata existe solo a nivel venta
-- (sales.immediate_coverage); NULL acá significa "heredar la de la venta",
-- así que los adherentes actuales no cambian de comportamiento.

ALTER TABLE public.beneficiaries ADD COLUMN IF NOT EXISTS entry_date date;
ALTER TABLE public.beneficiaries ADD COLUMN IF NOT EXISTS immediate_coverage boolean;

-- "ID CLIENTE Nº" del encabezado del anexo. Es un atributo del cliente
-- (hoy se carga a mano como pregunta suelta en el Plan Materno).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS external_id varchar;


-- ---------------------------------------------------------------------
-- 3. Empresas como titular
-- ---------------------------------------------------------------------
-- No se toca el NOT NULL de clients.first_name / last_name a propósito:
-- hay 77 lugares en 42 archivos (más 6 edge functions) que componen el
-- nombre como first_name + last_name. El formulario guarda la razón social
-- también en first_name, así que todos esos lugares siguen funcionando sin
-- cambios y sin riesgo de null.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'persona';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS razon_social varchar;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ruc varchar;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_client_type_check') THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_client_type_check CHECK (client_type IN ('persona','empresa'));
  END IF;
END $$;

-- Switch por contrato: si cada empleado firma su DDJJ o si firma solo el
-- representante legal. 'individual' = comportamiento actual.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS employee_signature_mode text NOT NULL DEFAULT 'individual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_employee_signature_mode_check') THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_employee_signature_mode_check
      CHECK (employee_signature_mode IN ('individual','representante'));
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN — debe devolver todo en OK
-- ---------------------------------------------------------------------
SELECT 'tabla adherent_incorporations' AS chequeo,
       CASE WHEN to_regclass('public.adherent_incorporations') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'RLS activo', CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.adherent_incorporations'::regclass)
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'políticas (4 esperadas)', (SELECT count(*)::text FROM pg_policies WHERE tablename='adherent_incorporations')
UNION ALL
SELECT 'beneficiaries.entry_date', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='beneficiaries' AND column_name='entry_date') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'beneficiaries.immediate_coverage', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='beneficiaries' AND column_name='immediate_coverage') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'clients.client_type/razon_social/ruc/external_id', (SELECT count(*)::text FROM information_schema.columns
       WHERE table_name='clients' AND column_name IN ('client_type','razon_social','ruc','external_id'))
UNION ALL
SELECT 'sales.employee_signature_mode', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='sales' AND column_name='employee_signature_mode') THEN 'OK' ELSE 'FALTA' END;
