-- Replica minima de BR prod (columnas, triggers y funciones copiadas de prod el 2026-10-25)
DO $$ BEGIN
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text);
CREATE FUNCTION cron.schedule(p_name text, p_sched text, p_cmd text) RETURNS bigint LANGUAGE sql AS
$$ INSERT INTO cron.job (jobname, schedule, command) VALUES (p_name, p_sched, p_cmd) RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(p_id bigint) RETURNS boolean LANGUAGE sql AS
$$ DELETE FROM cron.job WHERE jobid = p_id RETURNING true $$;
INSERT INTO cron.job (jobname, schedule, command) VALUES
  ('cleanup-expired-links', '0 * * * *', 'select 1'), ('cleanup-expired-otps', '*/30 * * * *', 'select 1');

CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY, statements text[], name text, created_by text,
  idempotency_key text UNIQUE, rollback text[]);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260828013425', 'fix_security_definer_view_v_phone_migration_issues');

CREATE TYPE public.sale_status AS ENUM ('borrador','enviado','firmado','completado','cancelado','pendiente','en_auditoria','rechazado','aprobado_para_templates','preparando_documentos','esperando_ddjj','en_revision','listo_para_enviar','firmado_parcial','expirado');
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','gestor','vendedor','supervisor','auditor','financiero');
CREATE TYPE public.document_status AS ENUM ('pendiente','firmado','vencido');

CREATE TABLE public.companies (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name varchar NOT NULL, logo_url text, primary_color varchar DEFAULT '#3B82F6'::character varying, secondary_color varchar DEFAULT '#1E40AF'::character varying, email varchar, phone varchar, address text, website varchar, tax_id varchar, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), accent_color text, login_logo_url text, login_background_url text, border_radius text, dark_mode boolean DEFAULT false, font_family text, shadows boolean DEFAULT true, custom_css text, favicon text);
CREATE TABLE public.profiles (id uuid NOT NULL PRIMARY KEY, company_id uuid REFERENCES public.companies(id), first_name varchar, last_name varchar, email varchar, phone varchar, avatar_url text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), user_id uuid, full_name text);
CREATE TABLE public.user_roles (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, role public.app_role NOT NULL DEFAULT 'vendedor'::app_role, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.plans (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id), name varchar NOT NULL, description text, price numeric NOT NULL DEFAULT 0, coverage_details jsonb DEFAULT '{}'::jsonb, is_active boolean DEFAULT true, sort_order integer DEFAULT 0, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.clients (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id), first_name varchar NOT NULL, last_name varchar NOT NULL, email varchar, phone varchar, dni varchar, birth_date date, address text, city varchar, province varchar, country_id uuid, postal_code varchar, notes text, is_active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), barrio varchar, gender varchar, marital_status varchar);
CREATE TABLE public.templates (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id), name varchar NOT NULL, description text, content text, is_active boolean DEFAULT true, version integer DEFAULT 1, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), template_type varchar DEFAULT 'contrato'::character varying, uses_dynamic_fields boolean DEFAULT true, pdf_layout jsonb DEFAULT '{}'::jsonb, requires_signature boolean DEFAULT true, designer_version text NOT NULL DEFAULT '1.0'::text, render_engine text NOT NULL DEFAULT 'legacy'::text, published_version_id uuid);
CREATE TABLE public.template_versions (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, template_id uuid NOT NULL REFERENCES public.templates(id), version_number integer NOT NULL, content text, created_by uuid, created_at timestamp with time zone DEFAULT now(), designer_version text NOT NULL DEFAULT '1.0'::text, layout_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, version_label text, is_published boolean NOT NULL DEFAULT false);
CREATE TABLE public.sales (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id), client_id uuid REFERENCES public.clients(id), plan_id uuid REFERENCES public.plans(id), salesperson_id uuid, template_id uuid, status public.sale_status DEFAULT 'borrador'::sale_status, total_amount numeric DEFAULT 0, notes text, signature_token uuid, signature_expires_at timestamp with time zone, signed_at timestamp with time zone, signed_ip varchar, contract_pdf_url text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), sale_date date DEFAULT CURRENT_DATE, contract_number varchar, request_number varchar, requires_adherents boolean DEFAULT false, adherents_count integer DEFAULT 0, all_signatures_completed boolean DEFAULT false, signature_completed_at timestamp with time zone, auditor_id uuid, audited_at timestamp with time zone, audit_status varchar DEFAULT 'pendiente'::character varying, audit_notes text, signer_type varchar DEFAULT 'titular'::character varying, signer_name varchar, signer_dni varchar, signer_relationship varchar, billing_razon_social text, billing_ruc text, billing_email text, billing_phone text, contract_start_date date, immediate_coverage boolean DEFAULT false, sale_type varchar DEFAULT 'venta_nueva'::character varying, titular_amount numeric, signer_email text, signer_phone text);
CREATE TABLE public.beneficiaries (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, first_name varchar NOT NULL, last_name varchar NOT NULL, dni varchar, birth_date date, relationship varchar, is_primary boolean DEFAULT false, created_at timestamp with time zone DEFAULT now(), amount numeric DEFAULT 0, email varchar, phone varchar, document_type varchar, document_number varchar, gender varchar, marital_status varchar, address text, city varchar, province varchar, postal_code varchar, occupation varchar, has_preexisting_conditions boolean DEFAULT false, preexisting_conditions_detail text, signature_required boolean DEFAULT true, signature_link_id uuid, barrio varchar);
CREATE TABLE public.documents (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, name varchar NOT NULL, document_type varchar, content text, file_url text, status public.document_status DEFAULT 'pendiente'::document_status, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), document_type_id uuid, generated_from_template boolean DEFAULT false, requires_signature boolean DEFAULT false, signed_by uuid, signed_at timestamp with time zone, signature_data text, beneficiary_id uuid, version integer DEFAULT 1, is_final boolean DEFAULT false, base_pdf_url text, signed_pdf_url text, base_pdf_hash text, signed_pdf_hash text, evidence_certificate_url text, evidence_certificate_hash text, template_version_id uuid, template_designer_version text, latest_print_pdf_url text, latest_print_pdf_at timestamp with time zone);
CREATE TABLE public.signature_links (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, package_id uuid, token varchar NOT NULL, recipient_type varchar NOT NULL, recipient_id uuid, recipient_email varchar, recipient_phone varchar, expires_at timestamp with time zone NOT NULL, accessed_at timestamp with time zone, access_count integer DEFAULT 0, ip_addresses jsonb DEFAULT '[]'::jsonb, status varchar DEFAULT 'pendiente'::character varying, completed_at timestamp with time zone, created_by uuid, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), signwell_document_id text, signwell_signing_url text, step_order integer DEFAULT 1, is_active boolean DEFAULT true, recipient_name text);
CREATE TABLE public.notifications (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, title varchar NOT NULL, message text, type varchar DEFAULT 'info'::character varying, is_read boolean DEFAULT false, link varchar, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.audit_logs (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, company_id uuid, action varchar NOT NULL, entity_type varchar, entity_id uuid, old_values jsonb, new_values jsonb, ip_address varchar, user_agent text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.templates_backup_20261013 AS SELECT * FROM public.templates WITH NO DATA;

-- Funciones/triggers de prod, copiados tal cual
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $function$;
CREATE FUNCTION public.get_user_company_id(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT company_id FROM public.profiles WHERE id = _user_id LIMIT 1 $function$;
CREATE FUNCTION public.get_user_role(_user_id uuid) RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $function$;

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_company_id uuid; v_user_id uuid; v_old_json jsonb; v_new_json jsonb; v_entity_id uuid;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(row_to_json(OLD)); v_new_json := NULL; v_entity_id := (v_old_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_old_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_json := NULL; v_new_json := to_jsonb(row_to_json(NEW)); v_entity_id := (v_new_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  ELSE
    v_old_json := to_jsonb(row_to_json(OLD)); v_new_json := to_jsonb(row_to_json(NEW)); v_entity_id := (v_new_json ->> 'id')::uuid;
    BEGIN v_company_id := (v_new_json ->> 'company_id')::uuid; EXCEPTION WHEN OTHERS THEN v_company_id := NULL; END;
  END IF;
  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, old_values, new_values, created_at)
  VALUES (v_user_id, v_company_id, TG_OP, TG_TABLE_NAME, v_entity_id, v_old_json, v_new_json, now());
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sale_id UUID; v_total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN v_sale_id := OLD.sale_id; ELSE v_sale_id := NEW.sale_id; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM beneficiaries WHERE sale_id = v_sale_id;
  UPDATE sales SET total_amount = v_total WHERE id = v_sale_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_titular_amount_on_save()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_adherent_sum NUMERIC; v_sale_total NUMERIC;
BEGIN
  IF (NEW.is_primary = true OR LOWER(NEW.relationship) = 'titular') AND (NEW.amount IS NULL OR NEW.amount = 0) THEN
    SELECT COALESCE(s.total_amount, COALESCE(p.price, 0)) INTO v_sale_total
    FROM sales s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.id = NEW.sale_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_adherent_sum FROM beneficiaries
    WHERE sale_id = NEW.sale_id AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (is_primary = false OR is_primary IS NULL) AND LOWER(COALESCE(relationship, '')) != 'titular';
    NEW.amount := GREATEST(v_sale_total - v_adherent_sum, 0);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_contract_number()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE year_part TEXT; sequence_part TEXT; next_number INTEGER;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(contract_number FROM 6 FOR 6) AS INTEGER)), 0) + 1 INTO next_number
  FROM public.sales WHERE contract_number LIKE year_part || '-%';
  sequence_part := LPAD(next_number::TEXT, 6, '0');
  NEW.contract_number := year_part || '-' || sequence_part;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.create_template_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        INSERT INTO public.template_versions (template_id, version_number, content, created_by) VALUES (NEW.id, NEW.version, OLD.content, NEW.created_by);
        NEW.version = NEW.version + 1;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_audit_beneficiaries AFTER INSERT OR DELETE OR UPDATE ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_clients AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_sales AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_recalculate_sale_total AFTER INSERT OR DELETE OR UPDATE ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION recalculate_sale_total_amount();
CREATE TRIGGER trg_set_titular_amount BEFORE INSERT OR UPDATE ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION set_titular_amount_on_save();
CREATE TRIGGER generate_contract_number_trigger BEFORE INSERT ON public.sales FOR EACH ROW WHEN ((new.contract_number IS NULL)) EXECUTE FUNCTION generate_contract_number();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER create_template_version_trigger BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION create_template_version();

-- ---------------------------------------------------------------------------
-- Datos: reproducen los casos de prod que importan
-- ---------------------------------------------------------------------------
INSERT INTO public.companies (id, name) VALUES
  ('0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'SAMAP'), ('11111111-1111-1111-1111-111111111111', 'Otra');
INSERT INTO public.profiles (id, company_id, first_name, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'Vendedor', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO public.plans (id, company_id, name, price) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'ORO', 300000);
INSERT INTO public.clients (id, company_id, first_name, last_name, dni) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'SHEILA MAGALI', 'TOLEDO BAEZ', '111'),
  ('cccccccc-0000-0000-0000-000000000002', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'Juan', 'Pérez', '222');
INSERT INTO public.templates (company_id, name, content) VALUES
  ('0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'Contrato', repeat('<p>contrato grande</p>', 2000)),
  ('0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'DDJJ', '<p>ddjj</p>');

-- Las 3 conocidas: titular sin fila primaria + un adherente con el mismo monto.
INSERT INTO public.sales (id, company_id, client_id, plan_id, salesperson_id, status, contract_number, titular_amount, total_amount) VALUES
  ('dddddddd-0000-0000-0000-000000000109', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completado', '2026-000109', 90000, 0),
  ('dddddddd-0000-0000-0000-000000000191', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completado', '2026-000191', 275000, 0),
  ('dddddddd-0000-0000-0000-000000000207', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completado', '2026-000207', 250000, 0),
  -- completada normal: titular como fila primaria
  ('dddddddd-0000-0000-0000-000000000214', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'completado', '2026-000214', 300000, 0),
  -- borrador abierto
  ('dddddddd-0000-0000-0000-000000000300', '0a1dc0e5-7378-4d14-b7bc-646b3e652bc6', 'cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'borrador', '2026-000300', 300000, 300000);
INSERT INTO public.beneficiaries (sale_id, first_name, last_name, relationship, is_primary, amount) VALUES
  ('dddddddd-0000-0000-0000-000000000109', 'Hijo', 'A', 'Hijo', false, 90000),
  ('dddddddd-0000-0000-0000-000000000191', 'Hijo', 'B', 'Hijo', false, 275000),
  ('dddddddd-0000-0000-0000-000000000207', 'Hijo', 'C', 'Hijo', false, 250000),
  ('dddddddd-0000-0000-0000-000000000214', 'Juan', 'Pérez', 'Titular', true, 300000),
  ('dddddddd-0000-0000-0000-000000000214', 'Esposa', 'Pérez', 'Cónyuge', false, 200000);
-- Tras los inserts, el trigger de prod dejo total = SUM(amount): 90000 / 275000 / 250000 / 500000.
UPDATE public.sales SET total_amount = 300000 WHERE id = 'dddddddd-0000-0000-0000-000000000300';

INSERT INTO public.documents (sale_id, name, document_type, content, is_final, signed_pdf_url) VALUES
  ('dddddddd-0000-0000-0000-000000000214', 'Contrato', 'contrato', repeat('<div data-signer="titular">firma</div>', 500), true, 'contracts/signed/x.pdf');
INSERT INTO public.signature_links (sale_id, token, recipient_type, expires_at, status) VALUES
  ('dddddddd-0000-0000-0000-000000000214', 'tok', 'titular', now() + interval '1 day', 'completado');
INSERT INTO public.notifications (user_id, title) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'hola');
