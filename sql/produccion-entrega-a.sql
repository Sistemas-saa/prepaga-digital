-- ============================================================================
-- PASE A BR PRODUCCION — ENTREGA A — APLICACION REAL
-- ============================================================================
-- GENERADO por scripts/produccion/build-entrega-a.mjs. NO EDITAR A MANO:
-- cambiar la migracion o el generador y volver a generar.
--
-- Proyecto destino: ejiycfqxgtrzaysgpzmx (BR prod) o una COPIA de prod para el
-- ensayo. Aborta solo si ve que ya se aplico, o si el esquema de public no es
-- EXACTAMENTE el aprobado (scripts/produccion/esquema-prod-referencia.txt:
-- 88 tablas, 969 columnas con su tipo).
--
-- Como correrlo: pegar el archivo ENTERO en el SQL Editor, o psql -f.
--
-- POR QUE ES UNA SOLA SENTENCIA (un DO que ejecuta cada paso con EXECUTE):
-- el SQL Editor del dashboard NO mantiene una sesion entre sentencias, asi que
-- un BEGIN ... COMMIT escrito en el texto no garantiza nada (paso el
-- 2026-10-08: un script dio error y quedo aplicado entero). Una sentencia
-- unica es atomica en cualquier cliente: si falla cualquier paso —o el
-- simulacro llega al final— Postgres deshace TODO.
--
-- Garantias (ver docs/runbooks/produccion-entrega-a.md, seccion 11):
--   * Atomico: o se aplica todo, o nada.
--   * Cero UPDATE/DELETE sobre filas existentes. Ajustes A1-A7 aplicados.
--   * Guarda de datos: antes de tocar nada guarda, de CADA tabla de public, la
--     identidad fisica de cada fila (ctid + xmin) y las columnas con su tipo; al
--     final lo compara. Todo UPDATE —aunque deje los mismos valores—, DELETE,
--     INSERT o reescritura de tabla crea otra version de fila con otro ctid y
--     otro xmin, asi que si UNA sola fila preexistente fue escrita, ABORTA. No
--     depende del contenido: cubre igual un PDF de 2 MB que un booleano.
--   * Bloqueo: lock_timeout de 3 s limita cuanto se ESPERA para conseguir un
--     bloqueo, no cuanto se lo retiene. Desde el PASO 0 hasta el final, las
--     tablas alteradas (beneficiaries, sales, clients, ...) quedan bloqueadas
--     para lectura y escritura. El script informa esa duracion al terminar
--     (en el mensaje del SIMULACRO y como NOTICE en el real): medirla en el
--     ensayo y en el simulacro antes de elegir la ventana.
--
-- Si aborta por la guarda nombrando una tabla que el pase no toca (p. ej.
-- signature_links), es actividad concurrente de un usuario o de un cron entre
-- la foto de antes y la de despues: no se aplico nada, volver a correrlo. Los
-- crons de prod corren a los :00 y :30; evitar esos minutos.
-- ============================================================================

DO $pase_entrega_a$
DECLARE
  v_paso        text := 'inicio';
  v_tablas      bigint;
  v_plantillas  bigint;
  v_t_inicio    timestamptz := clock_timestamp();
  v_t_bloqueo   timestamptz;
  v_t           timestamptz;
  v_nombres     text[] := '{}';
  v_duraciones  numeric[] := '{}';
  v_bloqueo     numeric;
  v_total       numeric;
  v_lentos      text;
  v_sin_archivo bigint;
  v_medicion    text;
BEGIN
  -- Tope de ESPERA para conseguir cada bloqueo (no de retencion): si una tabla
  -- esta en uso, se cancela todo en vez de encolar a los usuarios detras.
  PERFORM set_config('lock_timeout', '3s', true);

  -- ##########################################################################
  -- 0.a precondiciones
  -- ##########################################################################
  v_paso := '0.a precondiciones';
  v_t := clock_timestamp();
  EXECUTE $pase_00$
-- 0.a Precondiciones: que sea prod y que el pase no se haya aplicado
DO $pre$
BEGIN
  IF to_regclass('public.adherent_incorporations') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'beneficiaries'
                   AND column_name = 'status') THEN
    RAISE EXCEPTION 'El pase ya esta aplicado en esta base, o no es BR prod (US test ya tiene estos objetos). No se hizo nada.';
  END IF;
  IF to_regclass('public.commission_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Esta base tiene el modulo de comisiones: no es BR prod. No se hizo nada.';
  END IF;
END
$pre$;

-- 0.a' El esquema de public tiene que ser EXACTAMENTE el aprobado: mismas
-- tablas, mismas columnas, mismos tipos. Identifica al destino (BR prod o una
-- copia restaurada) y garantiza que las migraciones corren sobre lo que se
-- ensayo. Si prod cambio desde la captura, revisar y recapturar la referencia.
DO $esquema$
DECLARE
  v_ref    text[] := string_to_array($esquema_ref$audit_comments.audit_action:text
audit_comments.comment:text
audit_comments.created_at:timestamp with time zone
audit_comments.id:uuid
audit_comments.sale_id:uuid
audit_comments.sale_status_at_comment:text
audit_comments.updated_at:timestamp with time zone
audit_comments.user_id:uuid
audit_logs.action:character varying(100)
audit_logs.company_id:uuid
audit_logs.created_at:timestamp with time zone
audit_logs.entity_id:uuid
audit_logs.entity_type:character varying(100)
audit_logs.id:uuid
audit_logs.ip_address:character varying(45)
audit_logs.new_values:jsonb
audit_logs.old_values:jsonb
audit_logs.user_agent:text
audit_logs.user_id:uuid
audit_processes.auditor_id:uuid
audit_processes.completed_at:timestamp with time zone
audit_processes.created_at:timestamp with time zone
audit_processes.id:uuid
audit_processes.notes:text
audit_processes.sale_id:uuid
audit_processes.started_at:timestamp with time zone
audit_processes.status:character varying(50)
auth_attempts.company_id:uuid
auth_attempts.created_at:timestamp with time zone
auth_attempts.email:character varying(255)
auth_attempts.failure_reason:character varying(255)
auth_attempts.id:uuid
auth_attempts.ip_address:character varying(45)
auth_attempts.success:boolean
auth_attempts.user_agent:text
available_permissions.category:text
available_permissions.created_at:timestamp with time zone
available_permissions.description:text
available_permissions.id:uuid
available_permissions.is_active:boolean
available_permissions.permission_key:text
available_permissions.permission_name:text
beneficiaries.address:text
beneficiaries.amount:numeric(12,2)
beneficiaries.barrio:character varying
beneficiaries.birth_date:date
beneficiaries.city:character varying
beneficiaries.created_at:timestamp with time zone
beneficiaries.dni:character varying(20)
beneficiaries.document_number:character varying
beneficiaries.document_type:character varying
beneficiaries.email:character varying(255)
beneficiaries.first_name:character varying(100)
beneficiaries.gender:character varying
beneficiaries.has_preexisting_conditions:boolean
beneficiaries.id:uuid
beneficiaries.is_primary:boolean
beneficiaries.last_name:character varying(100)
beneficiaries.marital_status:character varying
beneficiaries.occupation:character varying
beneficiaries.phone:character varying(50)
beneficiaries.postal_code:character varying
beneficiaries.preexisting_conditions_detail:text
beneficiaries.province:character varying
beneficiaries.relationship:character varying(50)
beneficiaries.sale_id:uuid
beneficiaries.signature_link_id:uuid
beneficiaries.signature_required:boolean
beneficiary_documents.beneficiary_id:uuid
beneficiary_documents.created_at:timestamp with time zone
beneficiary_documents.document_type_id:uuid
beneficiary_documents.file_name:character varying
beneficiary_documents.file_size:integer
beneficiary_documents.file_type:character varying
beneficiary_documents.file_url:text
beneficiary_documents.id:uuid
beneficiary_documents.is_verified:boolean
beneficiary_documents.upload_source:character varying
beneficiary_documents.uploaded_by:uuid
beneficiary_documents.verified_at:timestamp with time zone
beneficiary_documents.verified_by:uuid
clients.address:text
clients.barrio:character varying(100)
clients.birth_date:date
clients.city:character varying(100)
clients.company_id:uuid
clients.country_id:uuid
clients.created_at:timestamp with time zone
clients.dni:character varying(20)
clients.email:character varying(255)
clients.first_name:character varying(100)
clients.gender:character varying(20)
clients.id:uuid
clients.is_active:boolean
clients.last_name:character varying(100)
clients.marital_status:character varying(30)
clients.notes:text
clients.phone:character varying(50)
clients.postal_code:character varying(20)
clients.province:character varying(100)
clients.updated_at:timestamp with time zone
communication_logs.channel:character varying(50)
communication_logs.client_id:uuid
communication_logs.company_id:uuid
communication_logs.content:text
communication_logs.created_at:timestamp with time zone
communication_logs.direction:character varying(20)
communication_logs.id:uuid
communication_logs.sale_id:uuid
communication_logs.sent_at:timestamp with time zone
communication_logs.status:character varying(50)
communication_logs.subject:character varying(255)
companies.accent_color:text
companies.address:text
companies.border_radius:text
companies.created_at:timestamp with time zone
companies.custom_css:text
companies.dark_mode:boolean
companies.email:character varying(255)
companies.favicon:text
companies.font_family:text
companies.id:uuid
companies.is_active:boolean
companies.login_background_url:text
companies.login_logo_url:text
companies.logo_url:text
companies.name:character varying(255)
companies.phone:character varying(50)
companies.primary_color:character varying(7)
companies.secondary_color:character varying(7)
companies.shadows:boolean
companies.tax_id:character varying(50)
companies.updated_at:timestamp with time zone
companies.website:character varying(255)
company_currency_settings.company_id:uuid
company_currency_settings.created_at:timestamp with time zone
company_currency_settings.currency_code:character varying(3)
company_currency_settings.currency_symbol:character varying(5)
company_currency_settings.decimal_places:integer
company_currency_settings.decimal_separator:character varying(1)
company_currency_settings.id:uuid
company_currency_settings.thousand_separator:character varying(1)
company_otp_policy.allowed_channels:jsonb
company_otp_policy.company_id:uuid
company_otp_policy.created_at:timestamp with time zone
company_otp_policy.default_channel:text
company_otp_policy.id:uuid
company_otp_policy.max_attempts:integer
company_otp_policy.otp_expiration_seconds:integer
company_otp_policy.otp_length:integer
company_otp_policy.otp_use_signature_whatsapp:boolean
company_otp_policy.otp_whatsapp_gateway_url:text
company_otp_policy.otp_whatsapp_provider:text
company_otp_policy.require_otp_for_signature:boolean
company_otp_policy.smtp_from_address:text
company_otp_policy.smtp_from_name:text
company_otp_policy.smtp_host:text
company_otp_policy.smtp_password_encrypted:text
company_otp_policy.smtp_port:integer
company_otp_policy.smtp_relay_url:text
company_otp_policy.smtp_tls:boolean
company_otp_policy.smtp_user:text
company_otp_policy.updated_at:timestamp with time zone
company_otp_policy.whatsapp_otp_enabled:boolean
company_settings.company_id:uuid
company_settings.contratada_auto_whatsapp:boolean
company_settings.contratada_signature_mode:text
company_settings.contratada_signer_dni:text
company_settings.contratada_signer_email:text
company_settings.contratada_signer_name:text
company_settings.contratada_signer_phone:text
company_settings.created_at:timestamp with time zone
company_settings.email_api_key:text
company_settings.email_from_address:character varying(255)
company_settings.email_from_name:character varying(255)
company_settings.email_provider:text
company_settings.id:uuid
company_settings.menu_config:jsonb
company_settings.pdf_footer_base64:text
company_settings.pdf_footer_image_url:text
company_settings.pdf_header_image_url:text
company_settings.pdf_logo_base64:text
company_settings.pdf_tagline_base64:text
company_settings.signature_block_style:jsonb
company_settings.signwell_api_key:text
company_settings.signwell_enabled:boolean
company_settings.sms_api_key:text
company_settings.sms_sender_id:text
company_settings.twilio_account_sid:text
company_settings.twilio_auth_token:text
company_settings.twilio_whatsapp_number:text
company_settings.updated_at:timestamp with time zone
company_settings.whatsapp_api_key:text
company_settings.whatsapp_gateway_url:text
company_settings.whatsapp_linked_phone:text
company_settings.whatsapp_phone_id:text
company_settings.whatsapp_provider:text
company_ui_settings.analytics_config:jsonb
company_ui_settings.company_id:uuid
company_ui_settings.created_at:timestamp with time zone
company_ui_settings.dashboard_layout:jsonb
company_ui_settings.id:uuid
company_ui_settings.sale_progress_config:jsonb
company_ui_settings.sidebar_collapsed:boolean
company_ui_settings.theme:character varying(20)
company_ui_settings.updated_at:timestamp with time zone
company_workflow_config.company_id:uuid
company_workflow_config.created_at:timestamp with time zone
company_workflow_config.id:uuid
company_workflow_config.is_active:boolean
company_workflow_config.updated_at:timestamp with time zone
company_workflow_config.updated_by:uuid
company_workflow_config.workflow_config:jsonb
countries.code:character varying(3)
countries.created_at:timestamp with time zone
countries.id:uuid
countries.name:character varying(100)
countries.phone_code:character varying(10)
dashboard_widgets.config:jsonb
dashboard_widgets.created_at:timestamp with time zone
dashboard_widgets.id:uuid
dashboard_widgets.is_visible:boolean
dashboard_widgets.position:integer
dashboard_widgets.updated_at:timestamp with time zone
dashboard_widgets.user_id:uuid
dashboard_widgets.widget_type:character varying(100)
debt_plans.created_at:timestamp with time zone
debt_plans.estimated_interest:numeric(14,2)
debt_plans.estimated_months:integer
debt_plans.id:uuid
debt_plans.plan_data:jsonb
debt_plans.scenario_id:uuid
debt_plans.strategy:text
debt_plans.total_debt:numeric(14,2)
debt_plans.updated_at:timestamp with time zone
debt_plans.user_id:uuid
debt_scenarios.created_at:timestamp with time zone
debt_scenarios.extra_monthly_payment:numeric(14,2)
debt_scenarios.id:uuid
debt_scenarios.name:text
debt_scenarios.strategy:text
debt_scenarios.updated_at:timestamp with time zone
debt_scenarios.user_id:uuid
debts.created_at:timestamp with time zone
debts.creditor:text
debts.current_balance:numeric(14,2)
debts.debt_type:text
debts.due_date:date
debts.id:uuid
debts.interest_rate:numeric(7,4)
debts.minimum_payment:numeric(14,2)
debts.name:text
debts.original_amount:numeric(14,2)
debts.status:text
debts.updated_at:timestamp with time zone
debts.user_id:uuid
document_access_logs.access_type:character varying(50)
document_access_logs.created_at:timestamp with time zone
document_access_logs.document_id:uuid
document_access_logs.id:uuid
document_access_logs.ip_address:character varying(45)
document_access_logs.user_id:uuid
document_field_values.completed_at:timestamp with time zone
document_field_values.created_at:timestamp with time zone
document_field_values.field_id:uuid
document_field_values.id:uuid
document_field_values.signature_link_id:uuid
document_field_values.value_json:jsonb
document_field_values.value_text:text
document_fields.created_at:timestamp with time zone
document_fields.document_id:uuid
document_fields.field_type:text
document_fields.h:numeric
document_fields.id:uuid
document_fields.label:text
document_fields.meta:jsonb
document_fields.page:integer
document_fields.required:boolean
document_fields.signer_role:text
document_fields.w:numeric
document_fields.x:numeric
document_fields.y:numeric
document_package_items.created_at:timestamp with time zone
document_package_items.document_id:uuid
document_package_items.id:uuid
document_package_items.is_required:boolean
document_package_items.package_id:uuid
document_package_items.sort_order:integer
document_packages.created_at:timestamp with time zone
document_packages.created_by:uuid
document_packages.description:text
document_packages.id:uuid
document_packages.name:character varying
document_packages.package_type:character varying
document_packages.sale_id:uuid
document_packages.updated_at:timestamp with time zone
document_print_versions.created_at:timestamp with time zone
document_print_versions.document_id:uuid
document_print_versions.generated_by:uuid
document_print_versions.id:uuid
document_print_versions.is_current:boolean
document_print_versions.pdf_hash:text
document_print_versions.pdf_url:text
document_print_versions.reason:text
document_print_versions.sale_id:uuid
document_print_versions.version_number:integer
document_types.applies_to:character varying
document_types.code:character varying
document_types.created_at:timestamp with time zone
document_types.description:text
document_types.id:uuid
document_types.is_active:boolean
document_types.is_required:boolean
document_types.name:character varying
document_types.requires_signature:boolean
document_types.sort_order:integer
document_types.template_id:uuid
document_types.updated_at:timestamp with time zone
documents.base_pdf_hash:text
documents.base_pdf_url:text
documents.beneficiary_id:uuid
documents.content:text
documents.created_at:timestamp with time zone
documents.document_type:character varying(50)
documents.document_type_id:uuid
documents.evidence_certificate_hash:text
documents.evidence_certificate_url:text
documents.file_url:text
documents.generated_from_template:boolean
documents.id:uuid
documents.is_final:boolean
documents.latest_print_pdf_at:timestamp with time zone
documents.latest_print_pdf_url:text
documents.name:character varying(255)
documents.requires_signature:boolean
documents.sale_id:uuid
documents.signature_data:text
documents.signed_at:timestamp with time zone
documents.signed_by:uuid
documents.signed_pdf_hash:text
documents.signed_pdf_url:text
documents.status:document_status
documents.template_designer_version:text
documents.template_version_id:uuid
documents.updated_at:timestamp with time zone
documents.version:integer
documents_backup_20260820.backed_up_at:timestamp with time zone
documents_backup_20260820.base_pdf_hash:text
documents_backup_20260820.base_pdf_url:text
documents_backup_20260820.beneficiary_id:uuid
documents_backup_20260820.content:text
documents_backup_20260820.created_at:timestamp with time zone
documents_backup_20260820.document_type:character varying(50)
documents_backup_20260820.document_type_id:uuid
documents_backup_20260820.evidence_certificate_hash:text
documents_backup_20260820.evidence_certificate_url:text
documents_backup_20260820.file_url:text
documents_backup_20260820.generated_from_template:boolean
documents_backup_20260820.id:uuid
documents_backup_20260820.is_final:boolean
documents_backup_20260820.latest_print_pdf_at:timestamp with time zone
documents_backup_20260820.latest_print_pdf_url:text
documents_backup_20260820.name:character varying(255)
documents_backup_20260820.requires_signature:boolean
documents_backup_20260820.sale_id:uuid
documents_backup_20260820.signature_data:text
documents_backup_20260820.signed_at:timestamp with time zone
documents_backup_20260820.signed_by:uuid
documents_backup_20260820.signed_pdf_hash:text
documents_backup_20260820.signed_pdf_url:text
documents_backup_20260820.status:document_status
documents_backup_20260820.template_designer_version:text
documents_backup_20260820.template_version_id:uuid
documents_backup_20260820.updated_at:timestamp with time zone
documents_backup_20260820.version:integer
email_campaigns.clicked_count:integer
email_campaigns.company_id:uuid
email_campaigns.created_at:timestamp with time zone
email_campaigns.id:uuid
email_campaigns.name:character varying(255)
email_campaigns.opened_count:integer
email_campaigns.scheduled_at:timestamp with time zone
email_campaigns.sent_at:timestamp with time zone
email_campaigns.sent_count:integer
email_campaigns.status:character varying(50)
email_campaigns.subject:character varying(255)
email_campaigns.template_id:uuid
email_templates.body:text
email_templates.channel:text
email_templates.company_id:uuid
email_templates.created_at:timestamp with time zone
email_templates.id:uuid
email_templates.is_active:boolean
email_templates.name:character varying(255)
email_templates.subject:character varying(255)
email_templates.template_key:text
email_templates.updated_at:timestamp with time zone
file_uploads.company_id:uuid
file_uploads.created_at:timestamp with time zone
file_uploads.entity_id:uuid
file_uploads.entity_type:character varying(100)
file_uploads.file_name:character varying(255)
file_uploads.file_size:integer
file_uploads.file_type:character varying(100)
file_uploads.file_url:text
file_uploads.id:uuid
file_uploads.uploaded_by:uuid
hash_anchors.anchor_reference:text
hash_anchors.anchor_type:text
hash_anchors.anchored_at:timestamp with time zone
hash_anchors.created_at:timestamp with time zone
hash_anchors.evidence_bundle_id:uuid
hash_anchors.hash_value:text
hash_anchors.id:uuid
incident_attachments.created_at:timestamp with time zone
incident_attachments.file_name:text
incident_attachments.file_size:bigint
incident_attachments.file_type:text
incident_attachments.file_url:text
incident_attachments.id:uuid
incident_attachments.incident_id:uuid
incident_attachments.uploaded_by:uuid
incident_comments.author_id:uuid
incident_comments.content:text
incident_comments.created_at:timestamp with time zone
incident_comments.id:uuid
incident_comments.incident_id:uuid
incident_comments.is_internal:boolean
incidents.analysis_notes:text
incidents.assigned_to:uuid
incidents.company_id:uuid
incidents.created_at:timestamp with time zone
incidents.description:text
incidents.development_ended_at:timestamp with time zone
incidents.development_started_at:timestamp with time zone
incidents.estimated_hours:numeric(6,2)
incidents.id:uuid
incidents.module:text
incidents.priority:text
incidents.reported_by:uuid
incidents.resolution_notes:text
incidents.resolved_at:timestamp with time zone
incidents.status:text
incidents.title:text
incidents.updated_at:timestamp with time zone
information_requests.created_at:timestamp with time zone
information_requests.description:text
information_requests.id:uuid
information_requests.request_type:character varying(100)
information_requests.requested_by:uuid
information_requests.responded_at:timestamp with time zone
information_requests.response:text
information_requests.sale_id:uuid
information_requests.status:character varying(50)
legal_evidence_certificates.certificate_hash:text
legal_evidence_certificates.certificate_url:text
legal_evidence_certificates.created_at:timestamp with time zone
legal_evidence_certificates.document_id:uuid
legal_evidence_certificates.id:uuid
legal_evidence_certificates.payload:jsonb
legal_evidence_certificates.sale_id:uuid
legal_evidence_certificates.signature_link_id:uuid
notifications.created_at:timestamp with time zone
notifications.id:uuid
notifications.is_read:boolean
notifications.link:character varying(500)
notifications.message:text
notifications.title:character varying(255)
notifications.type:character varying(50)
notifications.user_id:uuid
password_reset_tokens.created_at:timestamp with time zone
password_reset_tokens.expires_at:timestamp with time zone
password_reset_tokens.id:uuid
password_reset_tokens.token:character varying(255)
password_reset_tokens.used_at:timestamp with time zone
password_reset_tokens.user_id:uuid
payment_events.created_at:timestamp with time zone
payment_events.event_type:text
payment_events.id:uuid
payment_events.payload:jsonb
payment_events.payment_id:uuid
payment_events.provider:text
payments.amount:numeric(10,2)
payments.checkout_url:text
payments.created_at:timestamp with time zone
payments.currency:text
payments.id:uuid
payments.metadata:jsonb
payments.paddle_customer_id:text
payments.paddle_subscription_id:text
payments.paddle_transaction_id:text
payments.product_id:uuid
payments.provider:text
payments.status:text
payments.updated_at:timestamp with time zone
payments.user_id:uuid
pdf_reports.created_at:timestamp with time zone
pdf_reports.file_url:text
pdf_reports.id:uuid
pdf_reports.payment_id:uuid
pdf_reports.plan_id:uuid
pdf_reports.report_type:text
pdf_reports.user_id:uuid
phone_migration_backup.column_name:text
phone_migration_backup.id:bigint
phone_migration_backup.migrated_at:timestamp with time zone
phone_migration_backup.new_value:text
phone_migration_backup.old_value:text
phone_migration_backup.row_id:uuid
phone_migration_backup.table_name:text
plans.company_id:uuid
plans.coverage_details:jsonb
plans.created_at:timestamp with time zone
plans.description:text
plans.id:uuid
plans.is_active:boolean
plans.name:character varying(255)
plans.price:numeric(12,2)
plans.sort_order:integer
plans.updated_at:timestamp with time zone
process_traces.action:character varying(100)
process_traces.created_at:timestamp with time zone
process_traces.details:jsonb
process_traces.id:uuid
process_traces.sale_id:uuid
process_traces.user_id:uuid
products.active:boolean
products.created_at:timestamp with time zone
products.description:text
products.duration_days:integer
products.id:uuid
products.name:text
products.paddle_price_id:text
products.paddle_product_id:text
products.price_usd:numeric(10,2)
products.type:text
products.updated_at:timestamp with time zone
profiles.avatar_url:text
profiles.company_id:uuid
profiles.created_at:timestamp with time zone
profiles.email:character varying(255)
profiles.first_name:character varying(100)
profiles.full_name:text
profiles.id:uuid
profiles.is_active:boolean
profiles.last_name:character varying(100)
profiles.phone:character varying(50)
profiles.updated_at:timestamp with time zone
profiles.user_id:uuid
rate_limit_log.count:integer
rate_limit_log.id:bigint
rate_limit_log.key:text
rate_limit_log.updated_at:timestamp with time zone
rate_limit_log.window_start:timestamp with time zone
sale_documents.created_at:timestamp with time zone
sale_documents.file_name:character varying(255)
sale_documents.file_size:integer
sale_documents.file_type:character varying(50)
sale_documents.file_url:text
sale_documents.id:uuid
sale_documents.sale_id:uuid
sale_documents.uploaded_by:uuid
sale_notes.created_at:timestamp with time zone
sale_notes.id:uuid
sale_notes.is_internal:boolean
sale_notes.note_text:text
sale_notes.sale_id:uuid
sale_notes.user_id:uuid
sale_requirements.completed_at:timestamp with time zone
sale_requirements.completed_by:uuid
sale_requirements.created_at:timestamp with time zone
sale_requirements.id:uuid
sale_requirements.is_completed:boolean
sale_requirements.requirement_text:text
sale_requirements.sale_id:uuid
sale_templates.created_at:timestamp with time zone
sale_templates.id:uuid
sale_templates.sale_id:uuid
sale_templates.template_id:uuid
sale_workflow_states.change_reason:text
sale_workflow_states.changed_by:uuid
sale_workflow_states.created_at:timestamp with time zone
sale_workflow_states.id:uuid
sale_workflow_states.metadata:jsonb
sale_workflow_states.new_status:character varying
sale_workflow_states.previous_status:character varying
sale_workflow_states.sale_id:uuid
sales.adherents_count:integer
sales.all_signatures_completed:boolean
sales.audit_notes:text
sales.audit_status:character varying
sales.audited_at:timestamp with time zone
sales.auditor_id:uuid
sales.billing_email:text
sales.billing_phone:text
sales.billing_razon_social:text
sales.billing_ruc:text
sales.client_id:uuid
sales.company_id:uuid
sales.contract_number:character varying
sales.contract_pdf_url:text
sales.contract_start_date:date
sales.created_at:timestamp with time zone
sales.id:uuid
sales.immediate_coverage:boolean
sales.notes:text
sales.plan_id:uuid
sales.request_number:character varying
sales.requires_adherents:boolean
sales.sale_date:date
sales.sale_type:character varying
sales.salesperson_id:uuid
sales.signature_completed_at:timestamp with time zone
sales.signature_expires_at:timestamp with time zone
sales.signature_token:uuid
sales.signed_at:timestamp with time zone
sales.signed_ip:character varying(45)
sales.signer_dni:character varying
sales.signer_email:text
sales.signer_name:character varying
sales.signer_phone:text
sales.signer_relationship:character varying
sales.signer_type:character varying
sales.status:sale_status
sales.template_id:uuid
sales.titular_amount:numeric(12,2)
sales.total_amount:numeric(12,2)
sales.updated_at:timestamp with time zone
signature_consent_records.checkbox_state:boolean
signature_consent_records.consent_text:text
signature_consent_records.consent_text_version:text
signature_consent_records.created_at:timestamp with time zone
signature_consent_records.document_id:uuid
signature_consent_records.id:uuid
signature_consent_records.ip_address:text
signature_consent_records.sale_id:uuid
signature_consent_records.signature_link_id:uuid
signature_consent_records.user_agent:text
signature_events.consent_record_id:uuid
signature_events.created_at:timestamp with time zone
signature_events.document_hash:text
signature_events.document_id:uuid
signature_events.document_version:text
signature_events.evidence_bundle_hash:text
signature_events.evidence_bundle_url:text
signature_events.id:uuid
signature_events.identity_verification_id:uuid
signature_events.identity_verified:boolean
signature_events.ip_address:text
signature_events.sale_id:uuid
signature_events.signature_link_id:uuid
signature_events.signature_method:text
signature_events.signed_pdf_hash:text
signature_events.timestamp:timestamp with time zone
signature_events.user_agent:text
signature_evidence_bundles.bundle_hash:text
signature_evidence_bundles.consent_record_id:uuid
signature_evidence_bundles.created_at:timestamp with time zone
signature_evidence_bundles.document_hash:text
signature_evidence_bundles.document_id:uuid
signature_evidence_bundles.evidence_json:jsonb
signature_evidence_bundles.id:uuid
signature_evidence_bundles.identity_verification_id:uuid
signature_evidence_bundles.identity_verified:boolean
signature_evidence_bundles.ip_address:text
signature_evidence_bundles.pdf_hash:text
signature_evidence_bundles.sale_id:uuid
signature_evidence_bundles.signature_event_id:uuid
signature_evidence_bundles.signature_link_id:uuid
signature_evidence_bundles.signature_method:text
signature_evidence_bundles.storage_url:text
signature_evidence_bundles.user_agent:text
signature_identity_verification.attempts:integer
signature_identity_verification.auth_method:text
signature_identity_verification.channel:text
signature_identity_verification.created_at:timestamp with time zone
signature_identity_verification.destination_masked:text
signature_identity_verification.expires_at:timestamp with time zone
signature_identity_verification.id:uuid
signature_identity_verification.ip_address:text
signature_identity_verification.max_attempts:integer
signature_identity_verification.otp_code_hash:text
signature_identity_verification.result:text
signature_identity_verification.sale_id:uuid
signature_identity_verification.signature_link_id:uuid
signature_identity_verification.user_agent:text
signature_identity_verification.verified_at:timestamp with time zone
signature_links.access_count:integer
signature_links.accessed_at:timestamp with time zone
signature_links.completed_at:timestamp with time zone
signature_links.created_at:timestamp with time zone
signature_links.created_by:uuid
signature_links.expires_at:timestamp with time zone
signature_links.id:uuid
signature_links.ip_addresses:jsonb
signature_links.is_active:boolean
signature_links.package_id:uuid
signature_links.recipient_email:character varying
signature_links.recipient_id:uuid
signature_links.recipient_name:text
signature_links.recipient_phone:character varying
signature_links.recipient_type:character varying
signature_links.sale_id:uuid
signature_links.signwell_document_id:text
signature_links.signwell_signing_url:text
signature_links.status:character varying
signature_links.step_order:integer
signature_links.token:character varying
signature_links.updated_at:timestamp with time zone
signature_policies.content:text
signature_policies.created_at:timestamp with time zone
signature_policies.id:uuid
signature_policies.is_active:boolean
signature_policies.title:text
signature_policies.version:text
signature_workflow_steps.completed_at:timestamp with time zone
signature_workflow_steps.created_at:timestamp with time zone
signature_workflow_steps.data:jsonb
signature_workflow_steps.document_id:uuid
signature_workflow_steps.id:uuid
signature_workflow_steps.signature_link_id:uuid
signature_workflow_steps.started_at:timestamp with time zone
signature_workflow_steps.status:character varying
signature_workflow_steps.step_order:integer
signature_workflow_steps.step_type:character varying
signatures.created_at:timestamp with time zone
signatures.document_id:uuid
signatures.id:uuid
signatures.sale_id:uuid
signatures.signature_data:text
signatures.signed_at:timestamp with time zone
signatures.signer_email:character varying(255)
signatures.signer_ip:character varying(45)
signatures.signer_name:character varying(255)
sms_campaigns.company_id:uuid
sms_campaigns.created_at:timestamp with time zone
sms_campaigns.id:uuid
sms_campaigns.message:text
sms_campaigns.name:character varying(255)
sms_campaigns.scheduled_at:timestamp with time zone
sms_campaigns.sent_at:timestamp with time zone
sms_campaigns.sent_count:integer
sms_campaigns.status:character varying(50)
subscriptions.cancel_at_period_end:boolean
subscriptions.created_at:timestamp with time zone
subscriptions.current_period_end:timestamp with time zone
subscriptions.current_period_start:timestamp with time zone
subscriptions.id:uuid
subscriptions.paddle_customer_id:text
subscriptions.paddle_subscription_id:text
subscriptions.product_id:uuid
subscriptions.provider:text
subscriptions.status:text
subscriptions.updated_at:timestamp with time zone
subscriptions.user_id:uuid
template_analytics.avg_completion_time:integer
template_analytics.completions_count:integer
template_analytics.created_at:timestamp with time zone
template_analytics.id:uuid
template_analytics.last_used_at:timestamp with time zone
template_analytics.template_id:uuid
template_analytics.updated_at:timestamp with time zone
template_analytics.views_count:integer
template_asset_pages.asset_id:uuid
template_asset_pages.created_at:timestamp with time zone
template_asset_pages.height:numeric
template_asset_pages.id:uuid
template_asset_pages.page_number:integer
template_asset_pages.preview_image_url:text
template_asset_pages.width:numeric
template_assets.asset_type:text
template_assets.converted_asset_id:uuid
template_assets.created_at:timestamp with time zone
template_assets.file_name:text
template_assets.file_size:bigint
template_assets.file_url:text
template_assets.id:uuid
template_assets.metadata:jsonb
template_assets.mime_type:text
template_assets.page_count:integer
template_assets.processing_error:text
template_assets.processing_progress:integer
template_assets.status:text
template_assets.template_id:uuid
template_attachments.created_at:timestamp with time zone
template_attachments.file_name:text
template_attachments.file_size:integer
template_attachments.file_type:text
template_attachments.file_url:text
template_attachments.id:uuid
template_attachments.sort_order:integer
template_attachments.template_id:uuid
template_blocks.block_type:text
template_blocks.content:jsonb
template_blocks.created_at:timestamp with time zone
template_blocks.h:numeric
template_blocks.id:uuid
template_blocks.is_locked:boolean
template_blocks.is_visible:boolean
template_blocks.page:integer
template_blocks.rotation:numeric
template_blocks.sort_order:integer
template_blocks.style:jsonb
template_blocks.template_id:uuid
template_blocks.updated_at:timestamp with time zone
template_blocks.visibility_rules:jsonb
template_blocks.w:numeric
template_blocks.x:numeric
template_blocks.y:numeric
template_blocks.z_index:integer
template_comments.comment_text:text
template_comments.created_at:timestamp with time zone
template_comments.id:uuid
template_comments.template_id:uuid
template_comments.user_id:uuid
template_fields.block_id:uuid
template_fields.created_at:timestamp with time zone
template_fields.field_type:text
template_fields.h:numeric
template_fields.id:uuid
template_fields.label:text
template_fields.meta:jsonb
template_fields.page:integer
template_fields.required:boolean
template_fields.signer_role:text
template_fields.template_id:uuid
template_fields.w:numeric
template_fields.x:numeric
template_fields.y:numeric
template_placeholders.created_at:timestamp with time zone
template_placeholders.default_value:text
template_placeholders.description:text
template_placeholders.id:uuid
template_placeholders.is_system:boolean
template_placeholders.placeholder_label:character varying(255)
template_placeholders.placeholder_name:character varying(100)
template_placeholders.placeholder_type:character varying(50)
template_question_options.created_at:timestamp with time zone
template_question_options.id:uuid
template_question_options.option_text:character varying(255)
template_question_options.option_value:character varying(255)
template_question_options.question_id:uuid
template_question_options.sort_order:integer
template_questions.created_at:timestamp with time zone
template_questions.id:uuid
template_questions.is_required:boolean
template_questions.placeholder_name:character varying(100)
template_questions.question_text:text
template_questions.question_type:character varying(50)
template_questions.sort_order:integer
template_questions.template_id:uuid
template_questions.validation_rules:jsonb
template_responses.created_at:timestamp with time zone
template_responses.id:uuid
template_responses.question_id:uuid
template_responses.response_value:text
template_responses.sale_id:uuid
template_responses.template_id:uuid
template_responses.updated_at:timestamp with time zone
template_versions.content:text
template_versions.created_at:timestamp with time zone
template_versions.created_by:uuid
template_versions.designer_version:text
template_versions.id:uuid
template_versions.is_published:boolean
template_versions.layout_snapshot:jsonb
template_versions.template_id:uuid
template_versions.version_label:text
template_versions.version_number:integer
template_workflow_states.created_at:timestamp with time zone
template_workflow_states.id:uuid
template_workflow_states.is_final:boolean
template_workflow_states.state_name:character varying(100)
template_workflow_states.state_order:integer
template_workflow_states.template_id:uuid
templates.company_id:uuid
templates.content:text
templates.created_at:timestamp with time zone
templates.created_by:uuid
templates.description:text
templates.designer_version:text
templates.id:uuid
templates.is_active:boolean
templates.name:character varying(255)
templates.pdf_layout:jsonb
templates.published_version_id:uuid
templates.render_engine:text
templates.requires_signature:boolean
templates.template_type:character varying
templates.updated_at:timestamp with time zone
templates.uses_dynamic_fields:boolean
templates.version:integer
templates_backup_20261013.company_id:uuid
templates_backup_20261013.content:text
templates_backup_20261013.created_at:timestamp with time zone
templates_backup_20261013.created_by:uuid
templates_backup_20261013.description:text
templates_backup_20261013.designer_version:text
templates_backup_20261013.id:uuid
templates_backup_20261013.is_active:boolean
templates_backup_20261013.name:character varying(255)
templates_backup_20261013.pdf_layout:jsonb
templates_backup_20261013.published_version_id:uuid
templates_backup_20261013.render_engine:text
templates_backup_20261013.requires_signature:boolean
templates_backup_20261013.template_type:character varying
templates_backup_20261013.updated_at:timestamp with time zone
templates_backup_20261013.uses_dynamic_fields:boolean
templates_backup_20261013.version:integer
tmp_senior_annex.html:text
tmp_senior_annex.page:integer
user_permissions.created_at:timestamp with time zone
user_permissions.granted:boolean
user_permissions.granted_by:uuid
user_permissions.id:uuid
user_permissions.permission_key:text
user_permissions.updated_at:timestamp with time zone
user_permissions.user_id:uuid
user_purchases.access_status:text
user_purchases.created_at:timestamp with time zone
user_purchases.id:uuid
user_purchases.payment_id:uuid
user_purchases.product_id:uuid
user_purchases.updated_at:timestamp with time zone
user_purchases.user_id:uuid
user_roles.created_at:timestamp with time zone
user_roles.id:uuid
user_roles.role:app_role
user_roles.user_id:uuid
waha_health_logs.checked_at:timestamp with time zone
waha_health_logs.company_id:uuid
waha_health_logs.created_at:timestamp with time zone
waha_health_logs.error_message:text
waha_health_logs.id:uuid
waha_health_logs.response_time_ms:integer
waha_health_logs.session_status:text
whatsapp_messages.company_id:uuid
whatsapp_messages.created_at:timestamp with time zone
whatsapp_messages.delivered_at:timestamp with time zone
whatsapp_messages.error_message:text
whatsapp_messages.id:uuid
whatsapp_messages.message_body:text
whatsapp_messages.message_type:character varying
whatsapp_messages.phone_number:character varying
whatsapp_messages.read_at:timestamp with time zone
whatsapp_messages.sale_id:uuid
whatsapp_messages.sent_at:timestamp with time zone
whatsapp_messages.sent_by:uuid
whatsapp_messages.signature_link_id:uuid
whatsapp_messages.status:character varying
whatsapp_messages.whatsapp_message_id:character varying
whatsapp_notifications.company_id:uuid
whatsapp_notifications.created_at:timestamp with time zone
whatsapp_notifications.error_message:text
whatsapp_notifications.id:uuid
whatsapp_notifications.message:text
whatsapp_notifications.phone_number:character varying(50)
whatsapp_notifications.sale_id:uuid
whatsapp_notifications.sent_at:timestamp with time zone
whatsapp_notifications.status:character varying(50)
whatsapp_templates.company_id:uuid
whatsapp_templates.created_at:timestamp with time zone
whatsapp_templates.description:text
whatsapp_templates.id:uuid
whatsapp_templates.is_active:boolean
whatsapp_templates.message_body:text
whatsapp_templates.template_key:text
whatsapp_templates.template_name:text
whatsapp_templates.updated_at:timestamp with time zone$esquema_ref$, E'\n');
  v_actual text[];
  v_faltan text[];
  v_sobran text[];
BEGIN
  SELECT coalesce(array_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)), '{}')
    INTO v_actual
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE c.relkind IN ('r', 'p');

  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_faltan FROM unnest(v_ref) x WHERE x <> ALL (v_actual);
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_sobran FROM unnest(v_actual) x WHERE x <> ALL (v_ref);

  IF cardinality(v_faltan) + cardinality(v_sobran) > 0 THEN
    RAISE EXCEPTION 'ESQUEMA DISTINTO DEL APROBADO (no es BR prod o prod cambio desde la captura). No se hizo nada. Faltan %: % | Sobran %: %',
      cardinality(v_faltan), array_to_string(v_faltan[1:10], ', '),
      cardinality(v_sobran), array_to_string(v_sobran[1:10], ', ');
  END IF;
END
$esquema$;
$pase_00$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 0.b foto antes
  -- ##########################################################################
  v_paso := '0.b foto antes';
  v_t := clock_timestamp();
  EXECUTE $pase_01$
-- 0.b Foto "antes", en un esquema propio que se borra al final
CREATE SCHEMA pe_scratch;

-- Columnas con su tipo: al final tienen que seguir todas, iguales. Atrapa un
-- DROP COLUMN, un RENAME o un cambio de tipo, que no siempre escriben filas.
CREATE TABLE pe_scratch.columnas (tabla text, columna text, tipo text, PRIMARY KEY (tabla, columna));
INSERT INTO pe_scratch.columnas
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r', 'p');

-- Huella de una tabla: conteo + md5 de la identidad fisica de cada fila
-- (ctid = donde esta la version de la fila, xmin = la transaccion que la
-- escribio). Cualquier escritura sobre una fila crea una version nueva, con
-- otro ctid y con el xmin de ESTA transaccion: un UPDATE con los mismos
-- valores, un cambio de contenido de un PDF que conserva el tamano, un DELETE
-- o una reescritura de la tabla cambian la huella. Un VACUUM concurrente no:
-- no mueve filas vivas y conserva su xmin original al congelarlas.
-- No lee el contenido de las columnas: en prod las 88 tablas tardan 0,08 s.
CREATE FUNCTION pe_scratch.huella(p_tabla text, p_where text DEFAULT '', OUT filas bigint, OUT huella text)
LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass(format('public.%I', p_tabla)) IS NULL THEN
    filas := -1;
    huella := 'LA TABLA YA NO EXISTE';
    RETURN;
  END IF;
  EXECUTE format(
    'SELECT count(*), md5(coalesce(string_agg(ctid::text || %L || xmin::text, %L ORDER BY ctid), %L)) FROM public.%I %s',
    ':', ',', '', p_tabla, p_where)
  INTO filas, huella;
END
$fn$;

CREATE TABLE pe_scratch.foto (tabla text PRIMARY KEY, filas bigint, huella text);
INSERT INTO pe_scratch.foto
SELECT c.relname, h.filas, h.huella
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pe_scratch.huella(c.relname) h
 WHERE c.relkind IN ('r', 'p');

-- Las plantillas son la unica tabla que gana filas: se guardan sus ids para
-- comparar la huella sobre las preexistentes.
CREATE TABLE pe_scratch.templates_antes (id uuid PRIMARY KEY);
INSERT INTO pe_scratch.templates_antes SELECT id FROM public.templates;

CREATE TABLE pe_scratch.esperado (clave text PRIMARY KEY, valor bigint);
INSERT INTO pe_scratch.esperado
SELECT 'plantillas_nuevas',
       (SELECT count(*) FROM public.companies) * 5
       - (SELECT count(*) FROM public.templates WHERE name = ANY (ARRAY['Anexo de Incorporación de Adherente', 'Formulario de Solicitud de Cambio de Plan', 'Anexo Especial de Vigencia Inmediata', 'Contrato Colectivo de Empresa', 'Anexo de Movimiento de Nomina']::text[]));
$pase_01$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- PASO 0 (A1)
  -- ##########################################################################
  v_paso := 'PASO 0 (A1)';
  v_t_bloqueo := clock_timestamp();
  v_t := clock_timestamp();
  EXECUTE $pase_02$
-- PASO 0 (A1) — columnas que ninguna migracion crea y prod no tiene.
-- Con DEFAULT constante: en PG 17 no reescribe la tabla ni dispara triggers, y
-- deja a las filas existentes en 'active' sin un UPDATE. Por eso el
-- "UPDATE ... WHERE status IS NULL" de 20260908000004 encuentra 0 filas.
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficiaries_status_check') THEN
    -- Mismos valores que en US test: 'pending_addendum_signature' es del flujo
    -- legado sale_addendums y se mantiene para no divergir.
    ALTER TABLE public.beneficiaries
      ADD CONSTRAINT beneficiaries_status_check
      CHECK (status IN ('active', 'inactive', 'pending_addendum_signature'));
  END IF;
END
$chk$;

-- Fecha de baja: la escriben useCreateNominaTermination y
-- activate_adherent_incorporation. Sin ella, la primera baja falla.
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS coverage_end_date date;
$pase_02$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260813000001_adherent_incorporation_schema.sql
  -- ##########################################################################
  v_paso := '20260813000001_adherent_incorporation_schema.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_03$
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
$pase_03$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260813000002_incorporacion_varios_adherentes.sql
  -- ##########################################################################
  v_paso := '20260813000002_incorporacion_varios_adherentes.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_04$
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
$pase_04$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260813000003_activacion_incorporacion.sql
  -- ##########################################################################
  v_paso := '20260813000003_activacion_incorporacion.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_05$
-- =====================================================================
-- Fase 2 — Activación automática de la Incorporación de Adherente
-- Fecha: 2026-08-13
--
-- QUÉ HACE
-- Cuando la VENTA-OPERACIÓN de un anexo queda 'completado' (es decir, se
-- firmó: titular + adherentes + contratada), los adherentes del anexo se
-- suman al CONTRATO MADRE y se recalcula su cuota mensual.
--
-- POR QUÉ EN LA BASE Y NO EN EL FRONT
-- El paso a 'completado' lo hace el trigger `auto_advance_sale_status` desde
-- `signature_links`, disparado por la edge function de firma. El navegador
-- puede no estar abierto en ese momento. Poniéndolo en la base, la activación
-- ocurre siempre, sin importar qué camino completó la firma.
--
-- SEGURIDAD
--   · El trigger sale por la puerta inmediatamente si sale_type no es
--     'alta_adherente', así que NINGUNA venta actual cambia de comportamiento.
--   · Es idempotente: solo activa filas con activated_beneficiary_id IS NULL.
--   · No borra ni modifica datos existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Vínculo explícito con el adherente de la operación
-- ---------------------------------------------------------------------
-- Reemplaza el apaño de guardar el id dentro de `notes`.
ALTER TABLE public.adherent_incorporations
  ADD COLUMN IF NOT EXISTS operation_beneficiary_id uuid
  REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

-- Backfill de las filas creadas con el apaño anterior (si las hubiera).
UPDATE public.adherent_incorporations
SET operation_beneficiary_id = NULLIF(replace(notes, 'beneficiario_operacion:', ''), '')::uuid,
    notes = NULL
WHERE operation_beneficiary_id IS NULL
  AND notes LIKE 'beneficiario_operacion:%';


-- ---------------------------------------------------------------------
-- 2. Recálculo del total de una venta
-- ---------------------------------------------------------------------
-- Replica EXACTAMENTE la lógica de recalculateSaleTotalAmount()
-- (src/hooks/useBeneficiaries.ts), para que la cuota mensual dé lo mismo
-- se toque desde el front o desde acá.
CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_primary boolean;
  v_sum numeric;
  v_primary numeric;
  v_titular numeric;
BEGIN
  SELECT COALESCE(bool_or(COALESCE(is_primary, false)), false),
         COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_has_primary, v_sum
  FROM public.beneficiaries
  WHERE sale_id = p_sale_id;

  IF v_has_primary THEN
    SELECT COALESCE(amount, 0) INTO v_primary
    FROM public.beneficiaries
    WHERE sale_id = p_sale_id AND COALESCE(is_primary, false) LIMIT 1;

    -- Si el titular tiene monto 0 NO se pisa titular_amount: preserva el valor
    -- cargado a mano o traído del plan (mismo criterio que el front).
    IF v_primary > 0 THEN
      UPDATE public.sales SET total_amount = v_sum, titular_amount = v_primary WHERE id = p_sale_id;
    ELSE
      UPDATE public.sales SET total_amount = v_sum WHERE id = p_sale_id;
    END IF;
  ELSE
    SELECT COALESCE(titular_amount, 0) INTO v_titular FROM public.sales WHERE id = p_sale_id;
    UPDATE public.sales SET total_amount = v_titular + v_sum WHERE id = p_sale_id;
  END IF;
END;
$function$;


-- ---------------------------------------------------------------------
-- 3. Activación
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- incorporación sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
  LOOP
    v_new_id := NULL;

    -- Camino normal: copiar el adherente de la operación al contrato madre,
    -- con todos sus datos (domicilio, barrio, V.I., etc.).
    IF r.operation_beneficiary_id IS NOT NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false,
             -- Ya firmó en el anexo: no debe volver a pedírsele firma si el
             -- contrato madre se reenvía a firmar.
             false
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    -- Respaldo: si se perdió el vínculo, se arma con los datos que la propia
    -- incorporación guarda. Mejor un adherente con menos datos que ninguno.
    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completado',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_activate_adherent_incorporation ON public.sales;
CREATE TRIGGER trg_activate_adherent_incorporation
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.activate_adherent_incorporation();
$pase_05$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260817000001_fix_incorporacion_status_vocabulario.sql
  -- ##########################################################################
  v_paso := '20260817000001_fix_incorporacion_status_vocabulario.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_06$
-- Fix: el trigger escribia en adherent_incorporations un estado que la tabla rechaza.
--
-- adherent_incorporations usa vocabulario en INGLES:
--   status IN ('draft','sent','signed','completed','cancelled')
--   source IN ('existing_sale','external_sale')
--
-- pero activate_adherent_incorporation() marcaba la fila como 'completado'
-- (espanol), violando adherent_incorporations_status_check con SQLSTATE 23514.
-- En la practica la ACTIVACION del anexo fallaba entera y el adherente nunca se
-- copiaba al contrato madre.
--
-- NO confundir con sales.status, que si va en espanol. El IF que detecta cuando
-- la venta-operacion pasa a 'completado' queda intacto a proposito.
--
-- Origen del desajuste: 20260813000001 crea la tabla con CREATE TABLE IF NOT
-- EXISTS y en test la tabla YA EXISTIA con el vocabulario en ingles, asi que su
-- definicion —defaults y CHECKs incluidos— se ignoro en silencio. La
-- verificacion de esa migracion solo comprobaba que las columnas existieran, no
-- los valores permitidos.
--
-- Se redefine la funcion completa; el trigger que la invoca no cambia.

CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- incorporación sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
  LOOP
    v_new_id := NULL;

    -- Camino normal: copiar el adherente de la operación al contrato madre,
    -- con todos sus datos (domicilio, barrio, V.I., etc.).
    IF r.operation_beneficiary_id IS NOT NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false,
             -- Ya firmó en el anexo: no debe volver a pedírsele firma si el
             -- contrato madre se reenvía a firmar.
             false
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    -- Respaldo: si se perdió el vínculo, se arma con los datos que la propia
    -- incorporación guarda. Mejor un adherente con menos datos que ninguno.
    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;
$pase_06$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260817000002_sales_maternity_bonus.sql
  -- ##########################################################################
  v_paso := '20260817000002_sales_maternity_bonus.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_07$
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
$pase_07$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260818000001_fix_total_amount_single_source.sql
  -- ##########################################################################
  v_paso := '20260818000001_fix_total_amount_single_source.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_08$
-- Fuente unica de verdad para sales.total_amount.
--
-- PROBLEMA
-- Conviven dos funciones con el mismo nombre y formulas distintas:
--
--   recalculate_sale_total_amount()          -> returns trigger  (la del trigger
--     trg_recalculate_sale_total sobre beneficiaries, AFTER INSERT/UPDATE/DELETE)
--     Cuerpo actual:  total_amount = COALESCE(SUM(amount),0)
--     IGNORA titular_amount y no distingue si hay fila is_primary.
--
--   recalculate_sale_total_amount(p_sale_id uuid) -> returns void
--     Con fila is_primary  -> total = suma de TODOS los beneficiarios
--     Sin fila is_primary  -> total = titular_amount + suma de adherentes
--     Ademas sincroniza titular_amount con el primary, pero solo si es > 0
--     (si el primary quedo en 0 no se pisa el valor cargado a mano).
--
-- El trigger dispara en cada alta/edicion/baja de adherente y pisa el total con
-- la formula incompleta. Cuando el titular NO existe como fila beneficiaria, su
-- monto DESAPARECE del total. Verificado en test antes de aplicar: de 22 ventas,
-- 2 tenian el total mal, y en 2026-000006 (borrador, 3 adherentes, sin primary)
-- faltaban exactamente 275.000 = el titular_amount.
--
-- SOLUCION
-- La version con argumento queda como unica implementacion. La del trigger pasa
-- a delegar en ella. Se reemplaza el CUERPO en vez de borrar funcion y trigger:
-- es idempotente y no rompe dependencias.
--
-- El frontend (src/hooks/useBeneficiaries.ts) deja de calcular por su cuenta en
-- el mismo commit; el calculo pasa a ser responsabilidad exclusiva de la base.

CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Delega en la version con argumento, que es la unica que contempla
  -- is_primary y titular_amount.
  PERFORM public.recalculate_sale_total_amount(COALESCE(NEW.sale_id, OLD.sale_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---------------------------------------------------------------------
-- Backfill: reparar las ventas que quedaron con el total mal calculado.
-- Deja traza de cuantas y cuales cambian, para poder auditarlo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.contract_number,
           COALESCE(s.total_amount, 0) AS total_viejo,
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      -- [PROD A2] Solo reporte: no se reescribe ningun total.
      RAISE NOTICE 'difiere (NO se corrige) % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'ventas cuyo total difiere de la formula (no se tocaron): %', v_n;
END $$;
$pase_08$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260818000002_beneficiaries_signed_contract_guard.sql
  -- ##########################################################################
  v_paso := '20260818000002_beneficiaries_signed_contract_guard.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_09$
-- Respaldo en la base del bloqueo de adherentes en contratos firmados.
--
-- Con el contrato firmado, la composición del grupo familiar ya quedó sellada en
-- un PDF con firma PAdES. Modificarla por atrás deja la base diciendo una cosa y
-- el documento firmado otra. La vía legítima para sumar gente es la
-- Incorporación de Adherente (anexo + firma propia).
--
-- El frontend ya rechaza estas mutaciones (canMutateBeneficiaries en
-- src/lib/saleUtils.ts + guarda en src/hooks/useBeneficiaries.ts). Esto es la
-- tercera capa: la UI antes sólo escondía botones, así que cualquier camino que
-- no pasara por ese componente escribía igual.
--
-- EXENCIONES
-- Cuatro funciones del sistema modifican adherentes de un contrato firmado por
-- diseño, y tienen que seguir funcionando:
--   activate_adherent_incorporation()          copia el adherente al contrato madre
--   complete_adherent_incorporation(uuid)      idem, por RPC desde el link de firma
--   approve_sale_addendum(uuid, text)          anexos
--   try_complete_sale_addendum_for_link(uuid)  anexos
--
-- POR QUÉ NO SE USA `ALTER FUNCTION ... SET` (era la versión anterior de este
-- archivo, y nunca se pudo aplicar en ningún entorno):
--   `app.allow_signed_beneficiary_mutation` es una GUC "placeholder": no la
--   declara ninguna extensión. PostgreSQL exige SUPERUSUARIO para fijar un
--   placeholder con ALTER FUNCTION/ROLE/DATABASE, y en Supabase el rol
--   `postgres` no lo es -> `42501: permission denied to set parameter`.
--   El módulo de comisiones no tiene ese problema porque NO usa ALTER FUNCTION:
--   hace `PERFORM set_config('app.commission_rpc_mutation','on',true)` DENTRO
--   del cuerpo de cada RPC (ver 202608040003_commission_03_rpcs.sql:223), y
--   set_config sí está permitido para cualquier rol.
--
-- Copiar ese patrón exigiría reescribir el cuerpo de las 4 funciones, y 3 de
-- ellas (complete_adherent_incorporation, approve_sale_addendum,
-- try_complete_sale_addendum_for_link) NO están en el repo: sólo existen en la
-- base. Un CREATE OR REPLACE a ciegas las rompería.
--
-- Por eso la exención se resuelve del lado del trigger, mirando la PILA DE
-- LLAMADAS (`GET DIAGNOSTICS ... PG_CONTEXT`): si la escritura viene de adentro
-- de alguna de las 4, pasa. Ninguna de las 4 se toca.
-- Se conserva además el atajo por GUC, para que siga andando si alguna de esas
-- funciones adopta el patrón de comisiones (o si un superusuario llega a
-- aplicar el ALTER FUNCTION).


-- ---------------------------------------------------------------------
-- 0. PREFLIGHT — sin exención garantizada, NO se instala el trigger
-- ---------------------------------------------------------------------
-- Instalar el bloqueo sin exenciones sería peor que no instalarlo: frenaría a
-- la propia activación del anexo y el adherente nunca se sumaría al contrato
-- madre. Si algo no cierra, esto aborta la migración entera.
DO $preflight$
DECLARE
  v_faltan text;
  v_opacas text;
BEGIN
  SELECT string_agg(f, ', ')
    INTO v_faltan
    FROM unnest(ARRAY[
      -- [PROD A3] En prod solo existe la del trigger de activacion: las otras
      -- 3 son del flujo legado sale_addendums, que prod nunca tuvo.
      'public.activate_adherent_incorporation()'
    ]) AS f
   WHERE to_regprocedure(f) IS NULL;

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'No existen estas funciones del sistema, que deben quedar exentas: %. Revisar antes de instalar el bloqueo.',
      v_faltan;
  END IF;

  -- La pila de PG_CONTEXT sólo muestra funciones PL/pgSQL. Una función exenta
  -- escrita en SQL plano sería invisible ahí, y el trigger la bloquearía.
  SELECT string_agg(p.proname || ' (lenguaje ' || l.lanname || ')', ', ')
    INTO v_opacas
    FROM pg_proc p
    JOIN pg_language  l ON l.oid = p.prolang
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('activate_adherent_incorporation','complete_adherent_incorporation',
                       'approve_sale_addendum','try_complete_sale_addendum_for_link')
     AND l.lanname <> 'plpgsql'
     AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%allow_signed_beneficiary_mutation=on%';

  IF v_opacas IS NOT NULL THEN
    RAISE EXCEPTION
      'Estas funciones no son PL/pgSQL, asi que no aparecen en PG_CONTEXT y quedarian bloqueadas: %. Darles la exencion por GUC (set_config en su cuerpo) antes de instalar el trigger.',
      v_opacas;
  END IF;
END
$preflight$;


-- ---------------------------------------------------------------------
-- 1. Exención por GUC — se intenta, y si no se puede, no pasa nada
-- ---------------------------------------------------------------------
-- Falla con 42501 salvo que la corra un superusuario. La exención real es la
-- de PG_CONTEXT (paso 2), así que esto es sólo un extra.
-- [PROD A3] Se omite el ALTER FUNCTION ... SET: sobre funciones que no existen
-- da undefined_function, que el EXCEPTION original no atrapaba. La exencion
-- real es la de PG_CONTEXT, que queda igual.


-- ---------------------------------------------------------------------
-- 2. El trigger de bloqueo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beneficiaries_block_when_sale_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid;
  v_status  text;
  v_ctx     text;
BEGIN
  -- Exención A: GUC local, el patrón del módulo de comisiones.
  IF current_setting('app.allow_signed_beneficiary_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Exención B: la escritura viene de adentro de una de las 4 funciones del
  -- sistema. PG_CONTEXT trae la pila de llamadas PL/pgSQL completa.
  GET DIAGNOSTICS v_ctx = PG_CONTEXT;
  IF v_ctx ~ 'function [a-z_.]*(activate_adherent_incorporation|complete_adherent_incorporation|approve_sale_addendum|try_complete_sale_addendum_for_link)' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);

  SELECT s.status::text INTO v_status
  FROM public.sales s
  WHERE s.id = v_sale_id;

  IF v_status IN ('firmado_parcial', 'firmado', 'completado') THEN
    RAISE EXCEPTION
      'El contrato ya esta firmado (%): los adherentes no se pueden modificar. Use una Incorporacion de Adherente.',
      v_status
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_beneficiaries_block_when_sale_signed ON public.beneficiaries;
CREATE TRIGGER trg_beneficiaries_block_when_sale_signed
  BEFORE INSERT OR UPDATE OR DELETE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.beneficiaries_block_when_sale_signed();
$pase_09$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260818000003_adherent_incorporation_lifecycle.sql
  -- ##########################################################################
  v_paso := '20260818000003_adherent_incorporation_lifecycle.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_10$
-- Ciclo de vida de una Incorporación de Adherente.
--
-- Hasta ahora el frontend no tenía ni edición ni cancelación: un error de tipeo
-- quedaba para siempre y sólo se arreglaba borrando la venta-operación a mano.
-- Se agregaron `useUpdateAdherentIncorporation` y
-- `useCancelAdherentIncorporation` en src/hooks/useAdherentIncorporations.ts.
--
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
-- `adherent_incorporations` tiene DOS policies permisivas de UPDATE, y las
-- permisivas se combinan con OR: restringir una por estado no bloquearía nada,
-- porque la otra seguiría dejando pasar la fila. Habría que tocar las dos, que
-- es justamente el cambio de semántica de RLS que el proyecto evita. Un trigger
-- se aplica una sola vez, sin importar qué policy autorizó el acceso.
--
-- QUÉ IMPIDE
--   1. Editar los datos del adherente después de `draft`. El anexo ya se generó
--      y puede estar firmado: cambiar el snapshot dejaría el documento firmado
--      diciendo una cosa y la base otra.
--   2. Reabrir una incorporación `completed` o `cancelled`.
--
-- QUÉ SIGUE PERMITIENDO
-- Todas las transiciones hacia adelante que hacen las funciones del sistema
-- (draft -> sent -> signed -> completed, y la cancelación desde draft/sent),
-- además de los campos de control (activated_beneficiary_id, completed_at,
-- updated_at), que se escriben justamente al completar.

CREATE OR REPLACE FUNCTION public.adherent_incorporations_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del adherente es inmutable después del borrador.
  IF OLD.status IS DISTINCT FROM 'draft' AND (
       NEW.adherent_first_name      IS DISTINCT FROM OLD.adherent_first_name
    OR NEW.adherent_last_name       IS DISTINCT FROM OLD.adherent_last_name
    OR NEW.adherent_document_number IS DISTINCT FROM OLD.adherent_document_number
    OR NEW.adherent_birth_date      IS DISTINCT FROM OLD.adherent_birth_date
    OR NEW.adherent_relationship    IS DISTINCT FROM OLD.adherent_relationship
    OR NEW.adherent_email           IS DISTINCT FROM OLD.adherent_email
    OR NEW.adherent_phone           IS DISTINCT FROM OLD.adherent_phone
    OR NEW.adherent_amount          IS DISTINCT FROM OLD.adherent_amount
    OR NEW.coverage_start_date      IS DISTINCT FROM OLD.coverage_start_date
  ) THEN
    RAISE EXCEPTION
      'La incorporacion esta en estado "%": los datos del adherente ya no se pueden editar. Cancelela y cree una nueva.',
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'La incorporacion ya esta en estado final "%" y no se puede reabrir.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_adherent_incorporations_guard_lifecycle ON public.adherent_incorporations;
CREATE TRIGGER trg_adherent_incorporations_guard_lifecycle
  BEFORE UPDATE ON public.adherent_incorporations
  FOR EACH ROW
  EXECUTE FUNCTION public.adherent_incorporations_guard_lifecycle();
$pase_10$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260819000001_plan_change_schema.sql
  -- ##########################################################################
  v_paso := '20260819000001_plan_change_schema.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_11$
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
$pase_11$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260819000002_plan_change_activation.sql
  -- ##########################################################################
  v_paso := '20260819000002_plan_change_activation.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_12$
-- =====================================================================
-- Fase 2 — Activación automática del "Cambio de Plan" + guarda de ciclo de vida
-- Fecha: 2026-08-19
--
-- QUÉ HACE
-- Cuando la VENTA-OPERACIÓN de un cambio de plan queda 'completado' (es decir,
-- se firmó: titular + integrantes + contratada), el cambio se aplica al
-- CONTRATO MADRE: nuevo plan, nueva fecha de inicio de contrato (si se cargó),
-- nuevos montos por integrante, y se recalcula la cuota mensual.
--
-- POR QUÉ EN LA BASE Y NO EN EL FRONT
-- El paso a 'completado' lo hace el trigger `auto_advance_sale_status` desde
-- `signature_links`, disparado por la edge function de firma. El navegador
-- puede no estar abierto en ese momento. Poniéndolo en la base, la aplicación
-- del cambio ocurre siempre, sin importar qué camino completó la firma.
--
-- SEGURIDAD
--   · El trigger sale por la puerta inmediatamente si sale_type no es
--     'cambio_plan', así que NINGUNA venta actual cambia de comportamiento.
--   · Es idempotente: solo procesa filas con status NOT IN ('completed','cancelled').
--   · No borra datos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Activación
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  m jsonb;
  v_new_amount numeric;
  v_beneficiary_id uuid;
  v_is_primary boolean;
  v_skip boolean;
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- cambio de plan sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'cambio_plan' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- EXENCIÓN DEL BLOQUEO DE CONTRATOS FIRMADOS.
  -- El contrato madre está firmado, así que el trigger
  -- `trg_beneficiaries_block_when_sale_signed` (20260818000002) rechazaría con
  -- 42501 cualquier UPDATE sobre sus beneficiarios. Esta GUC es justamente la
  -- puerta de escape que ese trigger consulta.
  -- Se usa set_config(..., true) —transaccional, se revierte al terminar la
  -- transacción— y NO "ALTER FUNCTION ... SET", porque Supabase rechaza eso
  -- con "42501: permission denied to set parameter".
  -- VA ACÁ, DESPUÉS DE LAS DOS PUERTAS DE SALIDA, y no al principio del bloque:
  -- este trigger es AFTER UPDATE ON sales FOR EACH ROW sin WHEN, así que corre
  -- para CUALQUIER venta. Como set_config(..., true) dura toda la transacción
  -- (no sólo esta llamada), ponerlo antes de las guardas dejaría la exención
  -- activa por un UPDATE a una venta cualquiera, anulando el guard de
  -- beneficiarios firmados para el resto de esa transacción. Acá sólo se activa
  -- cuando realmente se va a aplicar un cambio de plan, justo antes de escribir.
  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'on', true);

  FOR r IN
    SELECT * FROM public.plan_changes
    WHERE operation_sale_id = NEW.id
      AND parent_sale_id IS NOT NULL
      -- 'cancelled' también queda afuera: una operación cancelada no debe
      -- aplicarse aunque su venta-operación llegue igual a 'completado'.
      -- Además, marcarla 'completed' violaría la guarda de ciclo de vida (42501)
      -- y, siendo un trigger AFTER en la misma transacción, abortaría el UPDATE
      -- de sales que completa la firma.
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    -- a. Nuevo plan en el contrato madre.
    IF r.new_plan_id IS NOT NULL THEN
      UPDATE public.sales
      SET plan_id = r.new_plan_id
      WHERE id = r.parent_sale_id;
    END IF;

    -- a.bis. Fecha de inicio del nuevo contrato. El formulario la captura y
    -- queda en el documento firmado, así que también hay que aplicarla.
    -- UPDATE aparte para no pisar plan_id ni contract_start_date con NULL.
    IF r.new_contract_start_date IS NOT NULL THEN
      UPDATE public.sales
      SET contract_start_date = r.new_contract_start_date
      WHERE id = r.parent_sale_id;
    END IF;

    -- b. Nuevos montos por integrante, según el snapshot del formulario.
    --    Cada elemento tiene la forma:
    --      {"beneficiary_id": uuid|null, "is_primary": bool, "name": text,
    --       "previous_plan": text, "previous_amount": numeric, "new_amount": numeric}
    --    Las entradas sin `new_amount` se ignoran en silencio: significan que
    --    ese integrante no cambia de monto.
    FOR m IN SELECT jsonb_array_elements(r.members_snapshot)
    LOOP
      -- `members_snapshot` es jsonb libre, sin CHECK de forma: cualquier valor
      -- no canónico —"1.500,00" en new_amount, "si" en is_primary, un uuid mal
      -- formado, un numeric fuera de rango— abortaría el cast DENTRO de la
      -- transacción de firma y revertiría el paso de la venta a 'completado'.
      -- Criterio: una entrada malformada se IGNORA, nunca aborta la firma.
      --
      -- Los TRES casts se parsean juntos y ANTES de escribir nada, por dos
      -- motivos: así ninguno queda al descubierto, y los errores de los UPDATE
      -- de más abajo (que sí son bugs de verdad) siguen propagándose normalmente
      -- en vez de quedar tapados por este handler.
      --
      -- Se usa un flag en vez de CONTINUE dentro del handler para no depender
      -- de saltar fuera de un bloque con EXCEPTION.
      v_skip := false;
      BEGIN
        v_new_amount     := NULLIF(m->>'new_amount', '')::numeric;
        v_is_primary     := COALESCE(NULLIF(m->>'is_primary', '')::boolean, false);
        v_beneficiary_id := NULLIF(m->>'beneficiary_id', '')::uuid;
      EXCEPTION WHEN others THEN
        v_skip := true;
      END;

      -- Sin `new_amount` el integrante no cambia de monto: se ignora igual.
      IF v_skip OR v_new_amount IS NULL THEN
        CONTINUE;
      END IF;

      IF v_is_primary THEN
        -- El monto del titular vive en `sales.titular_amount`, pero algunos
        -- contratos TAMBIÉN tienen una fila de `beneficiaries` con
        -- is_primary = true. Hay que escribir en los dos lados: al final
        -- `recalculate_sale_total_amount` sincroniza titular_amount DESDE esa
        -- fila primary cuando su amount > 0, así que si sólo se actualizara la
        -- venta, el recálculo pisaría el valor nuevo y el aumento del titular se
        -- perdería en silencio.
        UPDATE public.sales
        SET titular_amount = v_new_amount
        WHERE id = r.parent_sale_id;

        -- Si el contrato NO tiene fila primary, este UPDATE afecta 0 filas y no
        -- falla: en ese caso el titular_amount recién escrito sobrevive al
        -- recálculo, que es el comportamiento correcto de esa misma función.
        UPDATE public.beneficiaries
        SET amount = v_new_amount
        WHERE sale_id = r.parent_sale_id
          AND is_primary = true;
      ELSE
        -- Un adherente sin beneficiary_id utilizable no se puede ubicar en el
        -- contrato madre: se ignora, igual que el resto de las entradas
        -- malformadas.
        IF v_beneficiary_id IS NULL THEN
          CONTINUE;
        END IF;

        -- El filtro por sale_id evita que un snapshot manipulado toque
        -- adherentes de OTRO contrato.
        UPDATE public.beneficiaries
        SET amount = v_new_amount
        WHERE id = v_beneficiary_id
          AND sale_id = r.parent_sale_id;
      END IF;
    END LOOP;

    -- c. Cierre de la operación.
    UPDATE public.plan_changes
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre.
  -- NUNCA se recalcula el total a mano: bug conocido #10 de CLAUDE.md — el
  -- total lo calcula SÓLO la base, con esta única función.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.plan_changes
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  -- Cierre de la ventana de exención. set_config(..., true) es transaccional:
  -- si no se apaga acá, el guard de beneficiarios firmados queda desarmado para
  -- CUALQUIER escritura posterior de la misma transacción de firma. Apagándolo
  -- justo después de la última escritura y del último recálculo, la exención
  -- dura sólo lo que dura la activación.
  PERFORM set_config('app.allow_signed_beneficiary_mutation', 'off', true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_activate_plan_change ON public.sales;
CREATE TRIGGER trg_activate_plan_change
AFTER UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.activate_plan_change();


-- ---------------------------------------------------------------------
-- 2. Guarda de ciclo de vida de plan_changes
-- ---------------------------------------------------------------------
-- POR QUÉ UN TRIGGER Y NO UNA POLICY
-- Las policies permisivas se combinan con OR: restringir una por estado no
-- bloquearía nada, porque cualquier otra policy permisiva seguiría dejando
-- pasar la fila. Un trigger se aplica una sola vez, sin importar qué policy
-- autorizó el acceso. Mismo criterio que 20260818000003.
--
-- QUÉ IMPIDE
--   1. Editar los datos del cambio después de `draft` —incluido su DESTINO
--      (parent_sale_id / operation_sale_id)—. El formulario ya se generó y
--      puede estar firmado: cambiar el snapshot dejaría el documento firmado
--      diciendo una cosa y la base otra, y repuntar el destino permitiría
--      aplicar un cambio firmado sobre un contrato distinto.
--   2. Reabrir un cambio `completed` o `cancelled`.
--
-- QUÉ SIGUE PERMITIENDO
-- Todas las transiciones hacia adelante (draft -> sent -> signed -> completed,
-- y la cancelación desde draft/sent), además de los campos de control
-- (document_id, signature_link_id, completed_at, updated_at, notes).

CREATE OR REPLACE FUNCTION public.plan_changes_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del cambio es inmutable después del borrador.
  IF OLD.status IS DISTINCT FROM 'draft' AND (
       NEW.reason                  IS DISTINCT FROM OLD.reason
    OR NEW.previous_plan_id        IS DISTINCT FROM OLD.previous_plan_id
    OR NEW.new_plan_id             IS DISTINCT FROM OLD.new_plan_id
    OR NEW.previous_total_amount   IS DISTINCT FROM OLD.previous_total_amount
    OR NEW.new_total_amount        IS DISTINCT FROM OLD.new_total_amount
    OR NEW.members_snapshot        IS DISTINCT FROM OLD.members_snapshot
    OR NEW.new_contract_start_date IS DISTINCT FROM OLD.new_contract_start_date
    OR NEW.titular_name            IS DISTINCT FROM OLD.titular_name
    OR NEW.titular_document        IS DISTINCT FROM OLD.titular_document
    -- `observations` va impreso en el formulario firmado, y `client_id` /
    -- `source` describen de quién es la operación: si cambiaran después del
    -- borrador, la base diría una cosa y el PDF con firma PAdES otra, que es
    -- exactamente el bug conocido #11.
    OR NEW.observations            IS DISTINCT FROM OLD.observations
    OR NEW.client_id               IS DISTINCT FROM OLD.client_id
    OR NEW.source                  IS DISTINCT FROM OLD.source
    -- parent_sale_id / operation_sale_id son el DESTINO de la operación.
    -- La policy de UPDATE de plan_changes sólo valida company_id, así que sin
    -- congelarlos un usuario de la empresa podría repuntar un cambio ya en
    -- 'sent'/'signed' hacia OTRO contrato firmado: al completarse la firma, la
    -- activación aplicaría plan_id, titular_amount y la fila primary sobre un
    -- contrato distinto del que se firmó, con la exención del GUC activa
    -- (es el bypass que el bug conocido #11 busca cerrar).
    OR NEW.parent_sale_id          IS DISTINCT FROM OLD.parent_sale_id
    OR NEW.operation_sale_id       IS DISTINCT FROM OLD.operation_sale_id
  ) THEN
    RAISE EXCEPTION
      'El cambio de plan esta en estado "%": sus datos ya no se pueden editar. Cancelelo y cree uno nuevo.',
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'El cambio de plan ya esta en estado final "%" y no se puede reabrir.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_plan_changes_guard_lifecycle ON public.plan_changes;
CREATE TRIGGER trg_plan_changes_guard_lifecycle
  BEFORE UPDATE ON public.plan_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_changes_guard_lifecycle();
$pase_12$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260822000001_templates_unique_name_por_empresa.sql
  -- ##########################################################################
  v_paso := '20260822000001_templates_unique_name_por_empresa.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_13$
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
$pase_13$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260822000002_seed_plantillas_tipos_venta.sql
  -- ##########################################################################
  v_paso := '20260822000002_seed_plantillas_tipos_venta.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_14$
-- =====================================================================
-- Seed de las plantillas de los 3 tipos de venta
-- Fecha: 2026-08-22
--
-- QUÉ HACE
-- Carga en `templates` los 3 formularios que SAMAP usa en papel:
--   · ANEXO DE INCORPORACIÓN DE ADHERENTE      (sale_type='alta_adherente')
--   · FORMULARIO DE SOLICITUD DE CAMBIO DE PLAN (sale_type='cambio_plan')
--   · ANEXO ESPECIAL DE VIGENCIA INMEDIATA      (sin tipo propio: se adjunta
--     a cualquier venta y lista los beneficiarios con V.I.)
--
-- POR QUÉ
-- El código de los 3 flujos ya está (tablas, triggers, hooks, tabs) y el
-- motor `src/lib/enhancedTemplateEngine.ts` ya interpola todas sus
-- variables. Pero las plantillas vivían sólo como HTML en `docs/`: nunca
-- se cargaron en la base, así que no había NADA que adjuntar a una venta y
-- los tres flujos eran inutilizables. Esto es el bloqueante.
--
-- El HTML es copia literal de:
--   docs/plantilla-anexo-incorporacion.html
--   docs/plantilla-solicitud-cambio-plan.html
--   docs/plantilla-anexo-vigencia-inmediata.html
-- Si se editan esos archivos, esta migración NO se re-aplica sola (ver más
-- abajo): hay que actualizar la plantilla desde el diseñador.
--
-- POR QUÉ `template_type` PROPIO
-- Las 9 plantillas preexistentes son todas 'contrato'. Con estos tipos, el
-- selector de plantillas puede recomendar la que corresponde al `sale_type`
-- de la venta (ver TEMPLATE_TYPE_BY_SALE_TYPE en src/lib/saleTypes.ts).
--
-- POR QUÉ `requires_signature = true`
-- Las 3 llevan {{firma_contratante}} / {{firma_contratada}}. El front las
-- clasifica como document_type='contrato' (NO 'anexo') justamente para que
-- entren al circuito de firma: `finalize-signature-link` saltea los
-- documentos 'anexo' y nunca les generaría el PDF firmado.
--
-- SEGURIDAD / IDEMPOTENCIA
--   · `ON CONFLICT (company_id, name) DO NOTHING` (índice de 20260822000001):
--     correrla dos veces no duplica, y NO pisa una plantilla que un admin
--     haya editado a mano.
--   · Se siembra para TODAS las empresas: RLS ya aísla por company_id.
--   · El RAISE NOTICE final informa insertadas vs. salteadas, para que un
--     DO NOTHING silencioso no pase inadvertido.
--   · No borra ni modifica ninguna fila existente.
-- =====================================================================

DO $seed$
DECLARE
  v_insertadas  int;
  v_empresas    int;
  v_esperadas   int;
  v_incorporacion text := $tpl$
<!--
  PLANTILLA: "Anexo de Incorporación de Adherente"

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el anexo se generaría como adjunto y nunca se enviaría a firmar.

  LA TABLA SE REPITE SOLA
  El bloque {{#beneficiarios}} ... {{/beneficiarios}} se repite una vez por cada
  persona que se incorpora. No hay que dejar 6 filas vacías como en el papel:
  salen exactamente las que se cargaron.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    ANEXO DE INCORPORACIÓN DE ADHERENTE
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>ID CLIENTE Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Titular:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Plan:</strong> {{plan.nombre}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    El CONTRATANTE incorpora a partir de la fecha como adherente/s a la/s siguiente/s
    persona/s con los mismos beneficios y obligaciones correspondientes:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Parentesco</th>
        <th style="border:1px solid #000;padding:4px;">Fecha de Ingreso</th>
        <th style="border:1px solid #000;padding:4px;">Precio</th>
        <th style="border:1px solid #000;padding:4px;">V.I</th>
        <th style="border:1px solid #000;padding:4px;">Teléfono</th>
        <th style="border:1px solid #000;padding:4px;">Domicilio - Barrio</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fechaNacimiento}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{edad}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{vigencia_inmediata_adherente}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{telefono}}</td>
        <td style="border:1px solid #000;padding:4px;">{{domicilio}} - {{barrio}}</td>
      </tr>
      {{/beneficiarios}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Este anexo está firmado en dos copias, una para el CONTRATANTE y otra para la
    CONTRATADA. La cuota mensual, desde el momento de la firma de este anexo, por
    todo el grupo de personas que conforman el contrato, es de Guaraníes:
    <strong>{{monto_total_grupo}}</strong>
  </p>

  <!--
    OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que acá
    los nombres van sin llaves a propósito.
    monto_total_grupo = cuota del CONTRATO COMPLETO ya con las personas que se
    incorporan. monto_total, en cambio, es solo el importe de esta incorporación
    (y es la base sobre la que se calcula la comisión).
  -->

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        <!-- El ejecutivo de ventas no firma digitalmente: la línea queda para
             firma de puño y letra sobre el impreso. -->
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">EJECUTIVO DE VENTAS</div>
        <div style="font-size:10px;">{{vendedor_nombre}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
  v_cambio_plan text := $tpl$
<!--
  PLANTILLA: "Formulario de Solicitud de Cambio" (Cambio de Plan)

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el formulario se generaría como adjunto y nunca se enviaría a firmar.

  DE DÓNDE SALEN LOS DATOS
  El formulario se genera en el contexto de la VENTA-OPERACIÓN del cambio, que
  sólo conoce el plan nuevo. El plan anterior, los montos anteriores, el motivo y
  la tabla de integrantes vienen de plan_changes: los adosa attachPlanChangeContext
  y el motor los expone en el bloque cambio y en el loop integrantes_anteriores.

  LA TABLA ES UNA FOTO
  El bloque de integrantes recorre el members_snapshot tomado al momento de la
  solicitud, NO los adherentes actuales del contrato. Si después se editan los
  adherentes, este formulario ya firmado sigue diciendo lo mismo.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    FORMULARIO DE SOLICITUD DE CAMBIO
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>Cliente Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Titular Actual:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Vendedor:</strong> {{venta.vendedor}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;">
    <strong>MOTIVO:</strong> {{cambio.motivo}}
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">INTEGRANTES</th>
        <th style="border:1px solid #000;padding:4px;">PLAN ANTERIOR</th>
        <th style="border:1px solid #000;padding:4px;">MONTO ANTERIOR</th>
        <th style="border:1px solid #000;padding:4px;">MONTO NUEVO</th>
      </tr>
    </thead>
    <tbody>
      {{#integrantes_anteriores}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombre}}</td>
        <td style="border:1px solid #000;padding:4px;">{{planAnterior}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoAnteriorFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoNuevoFormateado}}</td>
      </tr>
      {{/integrantes_anteriores}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    <strong>OBSERVACIONES:</strong> {{cambio.observaciones}}
  </p>

  <table style="width:100%;border-collapse:collapse;margin-top:14px;">
    <tr>
      <td style="padding:3px 0;">
        <strong>Fecha de Inicio nvo. Cto:</strong> {{cambio.fechaInicioNuevoContrato}}
      </td>
      <td style="padding:3px 0;text-align:right;">
        <strong>Nueva cuota mensual del grupo:</strong> {{cambio.montoNuevoFormateado}}
      </td>
    </tr>
  </table>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
      </td>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
  v_vigencia text := $tpl$
<!--
  PLANTILLA: "Anexo Especial de Vigencia Inmediata"

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  La plantilla incluye {{firma_contratante}} y {{firma_contratada}}. Esos campos
  son los que hacen que el documento se clasifique como firmable. Si se los saca,
  el anexo se generaría como adjunto y nunca se enviaría a firmar.

  QUIÉNES SALEN EN LA TABLA
  El bloque {{#beneficiarios_vi}} ... {{/beneficiarios_vi}} se repite una vez por
  cada persona con VIGENCIA INMEDIATA EFECTIVA. "Efectiva" quiere decir: manda el
  valor del adherente y, si no tiene uno propio, hereda el de la venta. El titular
  aparece cuando la venta tiene vigencia inmediata. No hay que dejar 8 filas
  vacías como en el papel: salen exactamente las personas que corresponden.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    ANEXO ESPECIAL DE VIGENCIA INMEDIATA
  </h2>

  <p style="margin:0 0 12px 0;text-align:justify;">
    Este anexo forma parte integrante del contrato nº {{venta.numeroContrato}} entre
    SAMAP Departamento de Medicina Pre paga del Sanatorio Adventista de Asunción, y
    {{titular_nombre}} (Titular), por el cual SAMAP otorga vigencia inmediata para
    estudios laboratoriales, estudios especializados, e Internaciones agudas
    (clínicas) según los anexos del plan elegido.
  </p>

  <p style="margin:0 0 8px 0;">
    Los beneficiarios del presente anexo, son las siguientes personas:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;width:40px;">Nº</th>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios_vi}}
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{indice}}</td>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
      </tr>
      {{/beneficiarios_vi}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Vigencia inmediata no contempla internación o procedimientos por enfermedad o
    embarazo preexistente a la firma del contrato, sean éstas conocidas o no por el
    beneficiario.
  </p>

  <p style="margin:12px 0 0 0;text-align:justify;">
    En prueba de conformidad, firman las partes en dos ejemplares de un mismo tenor
    y a un solo efecto.
  </p>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">C. I. Nº {{titular_ci}}</div>
      </td>
      <td style="width:50%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
BEGIN
  SELECT count(*) INTO v_empresas FROM public.companies;
  v_esperadas := v_empresas * 3;

  WITH nuevas AS (
    INSERT INTO public.templates
      (company_id, name, description, content, template_type, is_active, requires_signature)
    -- [PROD A5] Nacen INACTIVAS: el front viejo lista toda plantilla activa sin
    -- filtrar por empresa. Se activan despues del deploy del front nuevo.
    SELECT c.id, v.name, v.description, v.content, v.template_type, false, true
      FROM public.companies c
      CROSS JOIN (VALUES
        ('Anexo de Incorporación de Adherente',
         'Anexo por el cual el contratante incorpora adherentes a un contrato ya firmado. Se emite sobre la venta-operación (sale_type=alta_adherente).',
         v_incorporacion::text,
         'anexo_incorporacion'),
        ('Formulario de Solicitud de Cambio de Plan',
         'Solicitud de cambio de plan de un contrato existente: separación, mayor cobertura o menor cobertura. Se emite sobre la venta-operación (sale_type=cambio_plan).',
         v_cambio_plan::text,
         'solicitud_cambio_plan'),
        ('Anexo Especial de Vigencia Inmediata',
         'Anexo que lista los beneficiarios con vigencia inmediata. Se adjunta a la venta cuyo titular o adherentes tengan immediate_coverage.',
         v_vigencia::text,
         'anexo_vigencia_inmediata')
      ) AS v(name, description, content, template_type)
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_insertadas FROM nuevas;

  RAISE NOTICE 'Seed plantillas tipos de venta: % empresa(s) x 3 = % esperadas, % insertadas, % ya existían (no se pisaron).',
    v_empresas, v_esperadas, v_insertadas, v_esperadas - v_insertadas;

  IF v_insertadas < v_esperadas THEN
    RAISE NOTICE 'Revisá las salteadas: si alguien creó a mano una plantilla con el mismo nombre y otro contenido, el vendedor podría estar usando la equivocada. SELECT company_id, name, template_type FROM public.templates WHERE name IN (''Anexo de Incorporación de Adherente'', ''Formulario de Solicitud de Cambio de Plan'', ''Anexo Especial de Vigencia Inmediata'');';
  END IF;
END
$seed$;
$pase_14$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000001_beneficiaries_nomina_empresa.sql
  -- ##########################################################################
  v_paso := '20260908000001_beneficiaries_nomina_empresa.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_15$
-- Nómina de un contrato de EMPRESA: empleados con plan propio y adherentes a cargo.
--
-- POR QUÉ
-- Hasta ahora un contrato con titular empresa cargaba a los empleados como
-- adherentes PLANOS de la venta: sin plan propio (`beneficiaries` no tenía
-- `plan_id`), sin adherentes propios (no había jerarquía) y con un único plan a
-- nivel `sales.plan_id`. Eso no alcanza para una venta corporativa, donde cada
-- empleado contrata su plan y suma su propio grupo familiar, con costos
-- independientes.
--
-- QUÉ AGREGA
--   beneficiaries.member_role            'empleado' | 'adherente'
--   beneficiaries.parent_beneficiary_id  el empleado del que depende un adherente
--   beneficiaries.plan_id                el plan de ESA persona
--
-- Los tres defaults ('adherente', NULL, NULL) reproducen exactamente el
-- comportamiento actual, así que una venta a persona física no cambia en nada y
-- ninguna consulta existente se ve afectada.
--
-- POR QUÉ UNA FK COMPUESTA Y NO UN TRIGGER
-- La regla "el empleado del que cuelga un adherente pertenece a la MISMA venta"
-- se expresa de forma declarativa con
--   FOREIGN KEY (parent_beneficiary_id, sale_id) REFERENCES beneficiaries (id, sale_id)
-- Eso obliga a un UNIQUE (id, sale_id) redundante con la PK — costo despreciable —
-- pero evita un trigger, y de paso el ON DELETE CASCADE hace que borrar a un
-- empleado se lleve a sus adherentes sin código de aplicación.
--
-- La ÚNICA regla que no entra ni en CHECK ni en FK (es entre filas) es "el padre
-- tiene que ser un empleado", y para eso sí hace falta el trigger de abajo.
--
-- NO SE TOCA `beneficiaries_status_check`: además de 'active' e 'inactive' admite
-- 'pending_addendum_signature', que usa el flujo legado `sale_addendums`.

-- ---------------------------------------------------------------------
-- 0. PREFLIGHT
-- ---------------------------------------------------------------------
DO $preflight$
DECLARE
  v_dup integer;
BEGIN
  -- El UNIQUE (id, sale_id) no puede fallar (id es PK), pero si alguna vez se
  -- corriera sobre una tabla particionada o con la PK cambiada, mejor abortar
  -- acá que a mitad del ALTER.
  SELECT count(*) INTO v_dup
  FROM (SELECT id FROM public.beneficiaries GROUP BY id HAVING count(*) > 1) t;

  IF v_dup > 0 THEN
    RAISE EXCEPTION 'beneficiaries.id no es único (% duplicados). Revisar antes de seguir.', v_dup;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS member_role           text NOT NULL DEFAULT 'adherente',
  ADD COLUMN IF NOT EXISTS parent_beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id               uuid;

COMMENT ON COLUMN public.beneficiaries.member_role IS
  'empleado = titular de su propio plan dentro de un contrato de empresa; adherente = persona a cargo. Default adherente: es como se comportaron siempre las ventas a persona fisica.';
COMMENT ON COLUMN public.beneficiaries.parent_beneficiary_id IS
  'Empleado del que depende este adherente, en la MISMA venta. NULL en ventas a persona fisica.';
COMMENT ON COLUMN public.beneficiaries.plan_id IS
  'Plan contratado por ESTA persona. NULL en ventas a persona fisica, donde el plan es unico y vive en sales.plan_id.';

-- ---------------------------------------------------------------------
-- 2. Constraints declarativas
-- ---------------------------------------------------------------------
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_member_role;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_member_role
  CHECK (member_role IN ('empleado', 'adherente'));

-- Un empleado es raíz: nunca cuelga de nadie. Impide ciclos de dos pasos y deja
-- la jerarquía en exactamente dos niveles.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_empleado_sin_padre;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_empleado_sin_padre
  CHECK (member_role <> 'empleado' OR parent_beneficiary_id IS NULL);

ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS chk_beneficiaries_no_self_parent;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT chk_beneficiaries_no_self_parent
  CHECK (parent_beneficiary_id IS DISTINCT FROM id);

-- Requisito de Postgres para poder referenciar el par (id, sale_id).
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS uq_beneficiaries_id_sale;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT uq_beneficiaries_id_sale UNIQUE (id, sale_id);

-- "El padre está en la misma venta", declarativo. ON DELETE CASCADE: borrar al
-- empleado se lleva a sus adherentes.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS fk_beneficiaries_parent;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT fk_beneficiaries_parent
  FOREIGN KEY (parent_beneficiary_id, sale_id)
  REFERENCES public.beneficiaries (id, sale_id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ON DELETE SET NULL: si se retira un plan del catálogo, la persona no se borra;
-- queda sin plan y se ve en la pantalla.
ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS fk_beneficiaries_plan;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT fk_beneficiaries_plan
  FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_parent
  ON public.beneficiaries (parent_beneficiary_id)
  WHERE parent_beneficiary_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_sale_role_status
  ON public.beneficiaries (sale_id, member_role, status);

-- ---------------------------------------------------------------------
-- 3. La regla que no es declarativa: el padre tiene que ser un EMPLEADO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beneficiaries_validate_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rol_padre text;
BEGIN
  IF NEW.parent_beneficiary_id IS NOT NULL THEN
    SELECT member_role INTO v_rol_padre
    FROM public.beneficiaries
    WHERE id = NEW.parent_beneficiary_id;

    IF v_rol_padre IS DISTINCT FROM 'empleado' THEN
      RAISE EXCEPTION
        'Un adherente solo puede depender de un EMPLEADO, y ese beneficiario no lo es.'
        USING ERRCODE = '23514',
              HINT = 'La nomina tiene exactamente dos niveles: empleado -> adherentes. No se admite anidar un adherente debajo de otro.';
    END IF;
  END IF;

  -- Degradar a un empleado que tiene gente a cargo dejaría a sus adherentes
  -- colgando de alguien que ya no es empleado, violando la regla de arriba sin
  -- que ningún INSERT la dispare.
  IF TG_OP = 'UPDATE'
     AND OLD.member_role = 'empleado'
     AND NEW.member_role <> 'empleado'
     AND EXISTS (SELECT 1 FROM public.beneficiaries
                  WHERE parent_beneficiary_id = NEW.id) THEN
    RAISE EXCEPTION
      'El empleado tiene adherentes a cargo: no puede dejar de ser empleado.'
      USING ERRCODE = '23514',
            HINT = 'Reasigne o elimine primero a sus adherentes.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Por orden alfabético este trigger corre DESPUÉS de
-- trg_beneficiaries_block_when_sale_signed, que es lo correcto: primero se
-- rechaza tocar un contrato firmado, después se valida la forma de la nómina.
DROP TRIGGER IF EXISTS trg_beneficiaries_validate_nomina ON public.beneficiaries;
CREATE TRIGGER trg_beneficiaries_validate_nomina
  BEFORE INSERT OR UPDATE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.beneficiaries_validate_nomina();

-- PostgREST cachea el esquema: sin esto los embeds de plan_id y del padre
-- siguen fallando hasta el próximo reinicio del servicio.
NOTIFY pgrst, 'reload schema';
$pase_15$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000002_clients_contacto_rrhh.sql
  -- ##########################################################################
  v_paso := '20260908000002_clients_contacto_rrhh.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_16$
-- Contacto de RR.HH. del cliente EMPRESA.
--
-- POR QUÉ
-- En un contrato corporativo las altas y bajas de nómina no las gestiona el
-- titular (que es una razón social) sino una persona concreta del área de
-- Recursos Humanos. Hoy el único contacto que guarda `clients` es el genérico
-- (`email`, `phone`), que en una empresa suele ser el de administración o el de
-- facturación, y no sirve para avisar de un movimiento de personal.
--
-- Se guarda en `clients` y no en `sales` porque es un atributo de la EMPRESA:
-- si mañana tiene un segundo contrato, el contacto es el mismo.
--
-- QUÉ NO HACE
-- No pone NOT NULL ni CHECK condicional: ya hay clientes empresa cargados sin
-- estos datos, y una constraint los dejaría sin poder editarse. La
-- obligatoriedad se valida en el front, y sólo cuando client_type = 'empresa'.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS hr_contact_name  text,
  ADD COLUMN IF NOT EXISTS hr_contact_phone text,
  ADD COLUMN IF NOT EXISTS hr_contact_email text;

COMMENT ON COLUMN public.clients.hr_contact_name IS
  'Contacto de RR.HH. de un cliente empresa: con quien se gestionan altas y bajas de nomina. NULL para personas fisicas.';

NOTIFY pgrst, 'reload schema';
$pase_16$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000003_adherent_incorporations_movimientos.sql
  -- ##########################################################################
  v_paso := '20260908000003_adherent_incorporations_movimientos.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_17$
-- Movimientos de nómina: `adherent_incorporations` pasa a cubrir ALTA y BAJA.
--
-- POR QUÉ ACÁ Y NO EN UNA TABLA NUEVA
-- El pedido fue explícito: para sumar un empleado o para darlo de baja se usa el
-- MISMO documento de anexo. Reusar esta tabla mantiene una sola serie de
-- numeración (ANX-YYYY-NNNNNN, que `generate_contract_number` asigna por
-- `sale_type='alta_adherente'`), una sola pantalla, un solo circuito de firma y
-- un solo juego de guardas de ciclo de vida. Una tabla `adherent_terminations`
-- paralela habría duplicado las cinco cosas.
--
-- QUÉ AGREGA
--   movement_type                 'alta' (default, = todo lo existente) | 'baja'
--   member_role                   qué se incorpora: 'empleado' o 'adherente'
--   adherent_plan_id              el plan de la persona que entra
--   parent_target_beneficiary_id  ALTA: de qué empleado del CONTRATO MADRE cuelga
--   target_beneficiary_id         BAJA: a quién se da de baja
--   termination_date              BAJA: fecha de fin de cobertura
--   termination_reason            BAJA: motivo, texto libre
--   cascade_dependents            BAJA: si también salen sus adherentes
--   deactivated_beneficiary_ids   BAJA: traza de a quién desactivó realmente
--
-- El default `movement_type = 'alta'` deja las incorporaciones existentes tal
-- como están, sin backfill.
--
-- QUÉ NO TOCA
-- Los NOT NULL de `adherent_first_name` / `adherent_last_name`: en una baja se
-- llenan con el snapshot del nombre de quien sale, que es justo lo que el anexo
-- tiene que imprimir.

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
ALTER TABLE public.adherent_incorporations
  ADD COLUMN IF NOT EXISTS movement_type                text NOT NULL DEFAULT 'alta',
  ADD COLUMN IF NOT EXISTS member_role                  text NOT NULL DEFAULT 'adherente',
  ADD COLUMN IF NOT EXISTS adherent_plan_id             uuid,
  ADD COLUMN IF NOT EXISTS parent_target_beneficiary_id uuid,
  ADD COLUMN IF NOT EXISTS target_beneficiary_id        uuid,
  ADD COLUMN IF NOT EXISTS termination_date             date,
  ADD COLUMN IF NOT EXISTS termination_reason           text,
  ADD COLUMN IF NOT EXISTS cascade_dependents           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_beneficiary_ids  uuid[];

COMMENT ON COLUMN public.adherent_incorporations.movement_type IS
  'alta = suma una persona al contrato madre (comportamiento historico). baja = la desvincula. Mismo anexo, misma serie ANX.';
COMMENT ON COLUMN public.adherent_incorporations.target_beneficiary_id IS
  'BAJA: beneficiario del CONTRATO MADRE que se desvincula. Obligatorio cuando movement_type = baja.';
COMMENT ON COLUMN public.adherent_incorporations.parent_target_beneficiary_id IS
  'ALTA de un adherente en un contrato de empresa: empleado del CONTRATO MADRE del que va a colgar.';
COMMENT ON COLUMN public.adherent_incorporations.deactivated_beneficiary_ids IS
  'BAJA: ids que la activacion realmente paso a inactive (el empleado y, si cascade_dependents, sus adherentes). Traza de auditoria.';

-- ---------------------------------------------------------------------
-- 2. Constraints
-- ---------------------------------------------------------------------
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_movement_type;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_movement_type CHECK (movement_type IN ('alta', 'baja'));

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_member_role;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_member_role CHECK (member_role IN ('empleado', 'adherente'));

-- Una baja sin destinatario no es accionable: la activación no sabría a quién
-- desvincular y quedaría un anexo firmado sin efecto.
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS chk_ai_baja_target;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT chk_ai_baja_target
  CHECK (movement_type <> 'baja' OR target_beneficiary_id IS NOT NULL);

-- ON DELETE SET NULL, NO cascade: el anexo de baja es registro histórico y no se
-- borra porque alguien haya borrado al beneficiario.
ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_target_beneficiary;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_target_beneficiary
  FOREIGN KEY (target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_parent_target_beneficiary;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_parent_target_beneficiary
  FOREIGN KEY (parent_target_beneficiary_id) REFERENCES public.beneficiaries(id) ON DELETE SET NULL;

ALTER TABLE public.adherent_incorporations
  DROP CONSTRAINT IF EXISTS fk_ai_adherent_plan;
ALTER TABLE public.adherent_incorporations
  ADD CONSTRAINT fk_ai_adherent_plan
  FOREIGN KEY (adherent_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_target_beneficiary
  ON public.adherent_incorporations (target_beneficiary_id)
  WHERE target_beneficiary_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. El guard de ciclo de vida también congela los campos nuevos
-- ---------------------------------------------------------------------
-- Sin esto, un anexo de baja YA FIRMADO se podría re-apuntar a otra persona con
-- un simple UPDATE: el PDF sellado diría un nombre y la activación desvincularía
-- a otro. Es exactamente la clase de divergencia que el guard existe para evitar.
CREATE OR REPLACE FUNCTION public.adherent_incorporations_guard_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. El snapshot del movimiento es inmutable después del borrador.
  IF OLD.status IS DISTINCT FROM 'draft' AND (
       NEW.adherent_first_name      IS DISTINCT FROM OLD.adherent_first_name
    OR NEW.adherent_last_name       IS DISTINCT FROM OLD.adherent_last_name
    OR NEW.adherent_document_number IS DISTINCT FROM OLD.adherent_document_number
    OR NEW.adherent_birth_date      IS DISTINCT FROM OLD.adherent_birth_date
    OR NEW.adherent_relationship    IS DISTINCT FROM OLD.adherent_relationship
    OR NEW.adherent_email           IS DISTINCT FROM OLD.adherent_email
    OR NEW.adherent_phone           IS DISTINCT FROM OLD.adherent_phone
    OR NEW.adherent_amount          IS DISTINCT FROM OLD.adherent_amount
    OR NEW.coverage_start_date      IS DISTINCT FROM OLD.coverage_start_date
    -- Campos del movimiento de nómina (agregados en 20260908000003).
    OR NEW.movement_type                IS DISTINCT FROM OLD.movement_type
    OR NEW.member_role                  IS DISTINCT FROM OLD.member_role
    OR NEW.adherent_plan_id             IS DISTINCT FROM OLD.adherent_plan_id
    OR NEW.parent_target_beneficiary_id IS DISTINCT FROM OLD.parent_target_beneficiary_id
    OR NEW.target_beneficiary_id        IS DISTINCT FROM OLD.target_beneficiary_id
    OR NEW.termination_date             IS DISTINCT FROM OLD.termination_date
    OR NEW.cascade_dependents           IS DISTINCT FROM OLD.cascade_dependents
  ) THEN
    RAISE EXCEPTION
      'El movimiento esta en estado "%": sus datos ya no se pueden editar. Cancelelo y cree uno nuevo.',
      OLD.status
      USING ERRCODE = '42501';
  END IF;

  -- 2. Un estado final no se reabre.
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'El movimiento ya esta en estado final "%" y no se puede reabrir.', OLD.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_adherent_incorporations_guard_lifecycle ON public.adherent_incorporations;
CREATE TRIGGER trg_adherent_incorporations_guard_lifecycle
  BEFORE UPDATE ON public.adherent_incorporations
  FOR EACH ROW
  EXECUTE FUNCTION public.adherent_incorporations_guard_lifecycle();

NOTIFY pgrst, 'reload schema';
$pase_17$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000004_total_amount_excluye_bajas.sql
  -- ##########################################################################
  v_paso := '20260908000004_total_amount_excluye_bajas.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_18$
-- `sales.total_amount` deja de contar a los beneficiarios dados de baja.
--
-- POR QUÉ
-- La baja de un empleado no borra su fila: la marca `status = 'inactive'` con su
-- `coverage_end_date`, para que el contrato conserve la historia de la nómina y
-- el anexo firmado siga teniendo a quién apuntar. Pero mientras el cálculo del
-- total siga sumando TODOS los beneficiarios, dar de baja a alguien no bajaría
-- la cuota: el contrato seguiría facturando a una persona que ya no está
-- cubierta.
--
-- QUÉ CAMBIA
-- Exactamente dos líneas de `recalculate_sale_total_amount(p_sale_id uuid)`: se
-- le agrega `AND COALESCE(status,'active') = 'active'` a sus dos lecturas de
-- `beneficiaries`. La función sigue siendo la ÚNICA fuente de verdad del total
-- (ver 20260818000001_fix_total_amount_single_source.sql) y la versión trigger
-- sigue delegando en ella sin tocarse.
--
-- IMPACTO SOBRE LOS DATOS ACTUALES: NINGUNO.
-- Verificado antes de escribir esto: las 39 filas de `beneficiaries` están en
-- `status='active'`, así que el filtro no cambia ni un total CALCULADO. El
-- control de abajo lo comprueba de nuevo al aplicar y ABORTA si alguno
-- cambiaría — así nadie descubre una diferencia después del COMMIT.
--
-- Ese control compara la fórmula vieja contra la nueva, NO contra
-- `sales.total_amount`. Ver el comentario largo del bloque: hay ventas cuyo
-- total guardado legítimamente no sale de esta fórmula.

-- ---------------------------------------------------------------------
-- 1. Normalización defensiva (esperado: 0 filas)
-- ---------------------------------------------------------------------
UPDATE public.beneficiaries
   SET status = 'active'
 WHERE status IS NULL OR btrim(status) = '';

-- ---------------------------------------------------------------------
-- 2. La función, con el filtro nuevo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_sale_total_amount(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_primary boolean;
  v_sum numeric;
  v_primary numeric;
  v_titular numeric;
BEGIN
  -- Sólo la nómina ACTIVA. Un beneficiario 'inactive' es alguien dado de baja
  -- por un anexo firmado: su fila se conserva como historia, pero no factura.
  SELECT COALESCE(bool_or(COALESCE(is_primary, false)), false),
         COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_has_primary, v_sum
  FROM public.beneficiaries
  WHERE sale_id = p_sale_id
    AND COALESCE(status, 'active') = 'active';

  IF v_has_primary THEN
    SELECT COALESCE(amount, 0) INTO v_primary
    FROM public.beneficiaries
    WHERE sale_id = p_sale_id
      AND COALESCE(is_primary, false)
      AND COALESCE(status, 'active') = 'active'
    LIMIT 1;

    -- Si el titular tiene monto 0 NO se pisa titular_amount: preserva el valor
    -- cargado a mano o traído del plan (mismo criterio que el front).
    IF v_primary > 0 THEN
      UPDATE public.sales SET total_amount = v_sum, titular_amount = v_primary WHERE id = p_sale_id;
    ELSE
      UPDATE public.sales SET total_amount = v_sum WHERE id = p_sale_id;
    END IF;
  ELSE
    SELECT COALESCE(titular_amount, 0) INTO v_titular FROM public.sales WHERE id = p_sale_id;
    UPDATE public.sales SET total_amount = v_titular + v_sum WHERE id = p_sale_id;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3. Control: el filtro no puede cambiar ningun total CALCULADO
-- ---------------------------------------------------------------------
-- OJO CON QUE SE COMPARA: las DOS FORMULAS entre si (la de antes, sin filtro,
-- contra la nueva, con filtro) y NO cada una contra `sales.total_amount`.
--
-- La diferencia importa. Hay ventas cuyo total guardado legitimamente NO sale
-- de esta formula: las venta-operacion de CAMBIO DE PLAN (`CMB-*`) no tienen
-- ninguna fila en `beneficiaries` y llevan su importe directo en
-- `total_amount`, puesto por `useCreatePlanChange`. Compararlas contra la
-- formula las marca como diferencia y aborta una migracion que en realidad no
-- las toca. (Paso en US test con CMB-2026-000001 y CMB-2026-000002.)
--
-- De paso, eso deja a la vista que `recalculate_sale_total_amount` pondria en
-- CERO el total de un cambio de plan si alguna vez se la llamara sobre esa
-- venta. Hoy no pasa: el trigger dispara sobre `beneficiaries` y esas ventas no
-- tienen ninguno, y `activate_plan_change` recalcula el contrato MADRE, no la
-- operacion. Es deuda preexistente, ajena a esta migracion.
DO $control$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT s.contract_number,
           -- Formula ANTERIOR: suma todos los beneficiarios.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false))
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id), 0)
           END AS total_viejo,
           -- Formula NUEVA: solo los activos.
           CASE
             WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                           WHERE b.sale_id = s.id AND COALESCE(b.is_primary, false)
                             AND COALESCE(b.status,'active') = 'active')
             THEN COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                             WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
             ELSE COALESCE(s.titular_amount, 0)
                  + COALESCE((SELECT SUM(COALESCE(b.amount,0)) FROM public.beneficiaries b
                               WHERE b.sale_id = s.id AND COALESCE(b.status,'active') = 'active'), 0)
           END AS total_nuevo
    FROM public.sales s
  LOOP
    IF r.total_viejo IS DISTINCT FROM r.total_nuevo THEN
      RAISE WARNING 'el filtro cambiaria % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;
      v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_n > 0 THEN
    RAISE EXCEPTION
      'El filtro por status cambiaria el total calculado de % venta(s). Significa que ya hay beneficiarios inactivos: revisar los WARNING antes de aplicar.', v_n;
  END IF;

  RAISE NOTICE 'Control OK: el filtro por status no cambia ningun total calculado.';
END
$control$;
$pase_18$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000005_activate_incorporation_movimientos.sql
  -- ##########################################################################
  v_paso := '20260908000005_activate_incorporation_movimientos.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_19$
-- Activación de los movimientos de nómina: la baja desvincula, el alta suma.
--
-- POR QUÉ SE REEMPLAZA `activate_adherent_incorporation()` Y NO SE CREA OTRA
-- Esta función es una de las CUATRO que `trg_beneficiaries_block_when_sale_signed`
-- exime por nombre, mirando la pila de llamadas con `GET DIAGNOSTICS ... PG_CONTEXT`
-- (ver 20260818000002). Conservar el MISMO nombre y la MISMA firma es lo que le
-- permite seguir escribiendo en un contrato ya firmado. Una función nueva
-- quedaría bloqueada con 42501, y sumarla al regex significaría tocar el guard.
-- Por el mismo motivo NO se agrega `set_config('app.allow_signed_beneficiary_mutation', ...)`:
-- la exención por PG_CONTEXT ya cubre estas escrituras, y activarla desarmaría el
-- guard para el resto de la transacción sin necesidad.
--
-- ⚠️ LA CORRECCIÓN MÁS IMPORTANTE DE ESTE ARCHIVO
-- El loop original filtra `activated_beneficiary_id IS NULL AND parent_sale_id IS
-- NOT NULL`. Ese filtro también matchea las filas de BAJA, que tienen poblado
-- `operation_beneficiary_id` (el snapshot de quien sale). Sin el
-- `AND COALESCE(movement_type,'alta') = 'alta'` de abajo, firmar una baja
-- COPIARÍA a la persona al contrato madre — en silencio y justo al revés de lo
-- pedido.
--
-- QUÉ HACE LA RAMA DE BAJA
-- Marca `status='inactive'` + `coverage_end_date` sobre el beneficiario del
-- CONTRATO MADRE (y, si `cascade_dependents`, sobre sus adherentes). No borra
-- nada: la fila queda como historia de la nómina y el anexo firmado conserva a
-- quién apuntaba. El total del contrato baja solo, porque
-- `recalculate_sale_total_amount` ya ignora a los inactivos (20260908000004).

CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
  v_parent_id uuid;
  v_plan_id uuid;
  v_member_role text;
  v_fin date;
  v_ids uuid[];
BEGIN
  -- Puerta de salida inmediata: cualquier venta que no sea una operación de
  -- movimiento de nómina sigue exactamente igual que antes.
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  -- Solo al pasar a 'completado', y una sola vez.
  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- =================================================================
  -- ALTA — suma la persona al contrato madre (comportamiento histórico)
  -- =================================================================
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
      -- Sin este filtro, una BAJA caería en este loop y copiaría a la persona
      -- al contrato madre en vez de sacarla. Ver el encabezado.
      AND COALESCE(movement_type, 'alta') = 'alta'
  LOOP
    v_new_id := NULL;

    -- ¿De qué empleado del CONTRATO MADRE cuelga? Sólo se acepta si de verdad
    -- pertenece a esa venta y es un empleado: si no, se deja NULL y la persona
    -- entra como adherente suelto. Es preferible a que la FK compuesta aborte la
    -- activación entera y el anexo firmado quede sin efecto.
    v_parent_id := NULL;
    IF r.parent_target_beneficiary_id IS NOT NULL THEN
      SELECT b.id INTO v_parent_id
      FROM public.beneficiaries b
      WHERE b.id = r.parent_target_beneficiary_id
        AND b.sale_id = r.parent_sale_id
        AND b.member_role = 'empleado';
    END IF;

    v_member_role := COALESCE(r.member_role, 'adherente');
    -- Un empleado nunca cuelga de nadie (chk_beneficiaries_empleado_sin_padre).
    IF v_member_role = 'empleado' THEN
      v_parent_id := NULL;
    END IF;

    -- Camino normal: copiar el adherente de la operación al contrato madre,
    -- con todos sus datos (domicilio, barrio, V.I., etc.).
    IF r.operation_beneficiary_id IS NOT NULL THEN
      SELECT COALESCE(r.adherent_plan_id, b.plan_id) INTO v_plan_id
      FROM public.beneficiaries b WHERE b.id = r.operation_beneficiary_id;

      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false,
             -- Ya firmó en el anexo: no debe volver a pedírsele firma si el
             -- contrato madre se reenvía a firmar.
             false,
             v_member_role, v_parent_id, v_plan_id
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    -- Respaldo: si se perdió el vínculo, se arma con los datos que la propia
    -- incorporación guarda. Mejor un adherente con menos datos que ninguno.
    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false,
        v_member_role, v_parent_id, r.adherent_plan_id
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- =================================================================
  -- BAJA — desvincula del contrato madre
  -- =================================================================
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND movement_type = 'baja'
      AND parent_sale_id IS NOT NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    v_fin := COALESCE(r.termination_date, r.coverage_end_date, CURRENT_DATE);

    -- Un solo UPDATE para el empleado y su cascada. `signature_required=false`
    -- evita que un reenvío a firmar del contrato madre les genere un enlace
    -- fantasma (ver bug conocido #12).
    WITH bajas AS (
      UPDATE public.beneficiaries
         SET status = 'inactive',
             coverage_end_date = v_fin,
             signature_required = false
       WHERE sale_id = r.parent_sale_id
         AND COALESCE(status, 'active') = 'active'
         AND ( id = r.target_beneficiary_id
               OR ( COALESCE(r.cascade_dependents, true)
                    AND parent_beneficiary_id = r.target_beneficiary_id ) )
      RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM bajas;

    UPDATE public.adherent_incorporations
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        activated_beneficiary_id = r.target_beneficiary_id,
        deactivated_beneficiary_ids = v_ids
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre. Vale para los dos movimientos: el
  -- alta lo sube, la baja lo baja (los inactivos ya no suman).
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- El trigger no se recrea: sigue siendo el mismo `trg_activate_adherent_incorporation`
-- (AFTER UPDATE ON sales) apuntando a esta función, que conserva nombre y firma.
$pase_19$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260908000006_seed_plantillas_empresa.sql
  -- ##########################################################################
  v_paso := '20260908000006_seed_plantillas_empresa.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_20$
-- =====================================================================
-- Seed de las plantillas del contrato de EMPRESA y del anexo de movimiento
-- Fecha: 2026-09-08
--
-- QUÉ HACE
-- Carga en `templates` los 2 documentos que necesita una venta corporativa:
--   · CONTRATO COLECTIVO DE EMPRESA   (template_type='contrato_empresa')
--     Lista a los empleados con su plan y sus adherentes anidados.
--   · ANEXO DE MOVIMIENTO DE NÓMINA   (template_type='anexo_movimiento')
--     Sirve para ALTA y para BAJA: es el mismo documento, y la variable
--     {{movimiento}} dice cuál es. Se emite sobre la venta-operación
--     (sale_type='alta_adherente', serie ANX-YYYY-NNNNNN).
--
-- POR QUÉ
-- Mismo motivo que 20260822000002: el código del flujo ya está (columnas de
-- nómina, triggers, hooks, pestañas) y el motor `src/lib/enhancedTemplateEngine.ts`
-- ya interpola todas sus variables —{{#empleados}}, {{#sus_adherentes}},
-- {{rol}}, {{plan_nombre}}, {{depende_de}}, {{movimiento}}—, pero sin la
-- plantilla en la base no hay NADA que adjuntar a la venta y el flujo es
-- inutilizable.
--
-- El HTML es copia literal de:
--   docs/plantilla-contrato-empresa.html
--   docs/plantilla-anexo-movimiento.html
-- Si se editan esos archivos, esta migración NO se re-aplica sola: hay que
-- actualizar la plantilla desde el diseñador.
--
-- POR QUÉ `requires_signature = true`
-- Las 2 llevan {{firma_contratante}} / {{firma_contratada}}. El front las
-- clasifica como document_type='contrato' (NO 'anexo') justamente para que
-- entren al circuito de firma: `finalize-signature-link` saltea los
-- documentos 'anexo' y nunca les generaría el PDF firmado.
--
-- SEGURIDAD / IDEMPOTENCIA
--   · `ON CONFLICT (company_id, name) DO NOTHING` (índice de 20260822000001):
--     correrla dos veces no duplica, y NO pisa una plantilla que un admin
--     haya editado a mano.
--   · Se siembra para TODAS las empresas: RLS ya aísla por company_id.
--   · El RAISE NOTICE final informa insertadas vs. salteadas, para que un
--     DO NOTHING silencioso no pase inadvertido.
--   · No borra ni modifica ninguna fila existente.
-- =====================================================================

DO $seed$
DECLARE
  v_insertadas  int;
  v_empresas    int;
  v_esperadas   int;
  v_contrato_empresa text := $tpl$
<!--
  PLANTILLA: "Contrato Colectivo de Empresa"

  CUÁNDO SE USA
  En una venta cuyo titular es una EMPRESA (clients.client_type = 'empresa').
  A diferencia del contrato individual, acá no hay un titular-persona: los
  beneficiarios son los EMPLEADOS, cada uno con su plan y su cuota, y de cada
  uno cuelgan sus adherentes.

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  Incluye firma_contratante y firma_contratada (entre llaves, más abajo). Esos
  campos son los que hacen que el documento se clasifique como firmable. Si se
  los saca, el contrato se generaría como adjunto y nunca se enviaría a firmar.

  LAS DOS TABLAS
  1. RESUMEN POR EMPLEADO — usa el loop de empleados, con el sub-loop de
     sus_adherentes anidado adentro. Una fila por empleado, con su plan, su
     cantidad de adherentes y el subtotal del grupo.
  2. DETALLE — usa el loop plano de beneficiarios, que ya viene ordenado como
     nómina (cada empleado seguido de su grupo) y trae las columnas rol,
     plan_nombre y depende_de.

  Se pueden borrar las que no se quieran: son independientes.

  OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que en
  este bloque los nombres van sin llaves a propósito.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 18px 0;">
    CONTRATO COLECTIVO DE ASISTENCIA MÉDICA
  </h2>

  <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>
      <td style="padding:3px 0;width:60%;"><strong>Razón Social:</strong> {{cliente.razonSocial}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>R.U.C.:</strong> {{cliente.ruc}}</td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><strong>Domicilio:</strong> {{cliente.direccion}} - {{cliente.ciudad}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Contrato Nº:</strong> {{venta.numeroContrato}}</td>
    </tr>
    <tr>
      <td style="padding:3px 0;"><strong>Contacto:</strong> {{cliente.telefono}} · {{cliente.email}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Inicio de vigencia:</strong> {{venta.fechaInicioContrato}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    La CONTRATANTE incorpora a la cobertura de asistencia médica a los funcionarios
    detallados a continuación, y a los adherentes a cargo de cada uno de ellos, con
    los beneficios y obligaciones que corresponden al plan contratado por cada
    persona.
  </p>

  <h3 style="font-size:12px;margin:14px 0 6px 0;">RESUMEN POR FUNCIONARIO</h3>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nº</th>
        <th style="border:1px solid #000;padding:4px;">Funcionario</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Cargo</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Adh.</th>
        <th style="border:1px solid #000;padding:4px;">Cuota del grupo</th>
      </tr>
    </thead>
    <tbody>
      {{#empleados}}
      <tr>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{indice}}</td>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{cantidadAdherentes}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{subtotalFormateado}}</td>
      </tr>
      {{#sus_adherentes}}
      <tr>
        <td style="border:1px solid #000;padding:4px;"></td>
        <td style="border:1px solid #000;padding:4px;padding-left:16px;">↳ {{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">-</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
      </tr>
      {{/sus_adherentes}}
      {{/empleados}}
    </tbody>
  </table>

  <h3 style="font-size:12px;margin:18px 0 6px 0;">DETALLE DE PERSONAS CUBIERTAS</h3>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Condición</th>
        <th style="border:1px solid #000;padding:4px;">Depende de</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Fecha de Ingreso</th>
        <th style="border:1px solid #000;padding:4px;">Cuota</th>
        <th style="border:1px solid #000;padding:4px;">V.I</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fechaNacimiento}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{edad}}</td>
        <td style="border:1px solid #000;padding:4px;">{{rol}}</td>
        <td style="border:1px solid #000;padding:4px;">{{depende_de}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{vigencia_inmediata_adherente}}</td>
      </tr>
      {{/beneficiarios}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Este contrato está firmado en dos copias, una para la CONTRATANTE y otra para la
    CONTRATADA. La cuota mensual por la totalidad de las personas cubiertas es de
    Guaraníes: <strong>{{monto_total}}</strong> ({{monto_total_letras}}).
  </p>

  <p style="margin:8px 0 0 0;text-align:justify;">
    Las incorporaciones y desvinculaciones posteriores de funcionarios se
    instrumentan mediante el anexo correspondiente, firmado por ambas partes, y
    surten efecto desde la fecha allí indicada.
  </p>

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATANTE</div>
        <div style="font-size:10px;">{{cliente.razonSocial}} - R.U.C. {{cliente.ruc}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        <!-- El ejecutivo de ventas no firma digitalmente: la línea queda para
             firma de puño y letra sobre el impreso. -->
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">EJECUTIVO DE VENTAS</div>
        <div style="font-size:10px;">{{vendedor_nombre}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
  v_anexo_movimiento text := $tpl$
<!--
  PLANTILLA: "Anexo de Movimiento de Nomina"

  CUÁNDO SE USA
  En la venta-operación que genera la pestaña "Movimientos" de un contrato ya
  firmado. Sirve para los DOS movimientos —incorporar (alta) y desvincular
  (baja)— porque es lo mismo desde el punto de vista del circuito: un anexo que
  firman el contratante y la contratada, y que recién al quedar firmado
  actualiza el contrato madre.

  CÓMO SABE SI ES ALTA O BAJA
  Con la variable movimiento (entre llaves, más abajo), que vale "ALTA" o
  "BAJA". La adosa attachGroupMonthlyTotal leyendo la fila de
  adherent_incorporations. En cualquier otra venta queda vacía.

  CÓMO USARLA
  Crear una plantilla nueva en el diseñador con este nombre y pegar este HTML.
  El encabezado y el zócalo con el logo de SAMAP los agrega automáticamente
  generate-base-pdf, así que NO van acá.

  IMPORTANTE — que sea FIRMABLE
  Incluye firma_contratante y firma_contratada (entre llaves, más abajo). Esos
  campos son los que hacen que el documento se clasifique como firmable. Si se
  los saca, el anexo se generaría como adjunto y nunca se enviaría a firmar.

  LA TABLA SE REPITE SOLA
  El bloque de beneficiarios se repite una vez por cada persona del movimiento.
  En una BAJA lista a quien sale y, si se marcó la cascada, también a sus
  adherentes: esas filas se cargan con signature_required en false, así que
  aparecen impresas pero NO se les pide firma ni se les genera DDJJ.

  OJO: el motor interpola TAMBIÉN dentro de los comentarios HTML, así que en
  este bloque los nombres van sin llaves a propósito.
-->

<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;">

  <h2 style="text-align:center;font-size:15px;margin:0 0 4px 0;">
    ANEXO DE MOVIMIENTO DE NÓMINA
  </h2>
  <p style="text-align:center;font-size:13px;font-weight:bold;margin:0 0 18px 0;">
    {{movimiento}}
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="padding:3px 0;"><strong>ID CLIENTE Nº:</strong> {{id_cliente}}</td>
      <td style="padding:3px 0;"><strong>Contratante:</strong> {{titular_nombre}}</td>
      <td style="padding:3px 0;text-align:right;"><strong>Contrato Nº:</strong> {{numero_contrato}}</td>
    </tr>
  </table>

  <p style="margin:0 0 12px 0;text-align:justify;">
    Por el presente anexo, el CONTRATANTE y la CONTRATADA dejan constancia del
    movimiento <strong>{{movimiento}}</strong> respecto de la/s siguiente/s
    persona/s, con efecto a partir de la fecha indicada en cada caso:
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead>
      <tr>
        <th style="border:1px solid #000;padding:4px;">Nombre y Apellido</th>
        <th style="border:1px solid #000;padding:4px;">C. I. Nº</th>
        <th style="border:1px solid #000;padding:4px;">Fecha Nac.</th>
        <th style="border:1px solid #000;padding:4px;">Edad</th>
        <th style="border:1px solid #000;padding:4px;">Condición</th>
        <th style="border:1px solid #000;padding:4px;">Depende de</th>
        <th style="border:1px solid #000;padding:4px;">Plan</th>
        <th style="border:1px solid #000;padding:4px;">Fecha</th>
        <th style="border:1px solid #000;padding:4px;">Cuota</th>
        <th style="border:1px solid #000;padding:4px;">Teléfono</th>
      </tr>
    </thead>
    <tbody>
      {{#beneficiarios}}
      <tr>
        <td style="border:1px solid #000;padding:4px;">{{nombreCompleto}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{dni}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fechaNacimiento}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{edad}}</td>
        <td style="border:1px solid #000;padding:4px;">{{parentesco}}</td>
        <td style="border:1px solid #000;padding:4px;">{{depende_de}}</td>
        <td style="border:1px solid #000;padding:4px;">{{plan_nombre}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{fecha_ingreso}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:right;">{{montoFormateado}}</td>
        <td style="border:1px solid #000;padding:4px;text-align:center;">{{telefono}}</td>
      </tr>
      {{/beneficiarios}}
    </tbody>
  </table>

  <p style="margin:16px 0 0 0;text-align:justify;">
    Este anexo está firmado en dos copias, una para el CONTRATANTE y otra para la
    CONTRATADA. La cuota mensual, desde el momento de la firma de este anexo, por
    todo el grupo de personas que conforman el contrato, es de Guaraníes:
    <strong>{{monto_total_grupo}}</strong>
  </p>

  <!--
    monto_total_grupo = cuota del CONTRATO COMPLETO ya con el movimiento
    aplicado: en un alta suma lo que entra, en una baja resta lo que sale.
    monto_total, en cambio, es solo el importe de esta operación — y es la base
    sobre la que se calcula la comisión, que en una baja es cero.
  -->

  <p style="margin:10px 0 0 0;">
    Asunción, {{fecha.dia}} / {{fecha.mes}} / {{fecha.anio}}
  </p>

  <table style="width:100%;margin-top:55px;border-collapse:collapse;text-align:center;">
    <tr>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratante}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">CONTRATANTE</div>
        <div style="font-size:10px;">{{titular_documento_label}} Nº {{titular_documento}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        <!-- El ejecutivo de ventas no firma digitalmente: la línea queda para
             firma de puño y letra sobre el impreso. -->
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">EJECUTIVO DE VENTAS</div>
        <div style="font-size:10px;">{{vendedor_nombre}}</div>
      </td>
      <td style="width:33%;vertical-align:bottom;">
        {{firma_contratada}}
        <div style="border-top:1px solid #555;margin-top:36px;padding-top:4px;">POR LA CONTRATADA</div>
      </td>
    </tr>
  </table>

</div>
$tpl$;
BEGIN
  SELECT count(*) INTO v_empresas FROM public.companies;
  v_esperadas := v_empresas * 2;

  WITH nuevas AS (
    INSERT INTO public.templates
      (company_id, name, description, content, template_type, is_active, requires_signature)
    -- [PROD A5] Nacen INACTIVAS: el front viejo lista toda plantilla activa sin
    -- filtrar por empresa. Se activan despues del deploy del front nuevo.
    SELECT c.id, v.name, v.description, v.content, v.template_type, false, true
      FROM public.companies c
      CROSS JOIN (VALUES
        ('Contrato Colectivo de Empresa',
         'Contrato de una venta cuyo titular es una empresa. Lista a los empleados con su plan y su cuota, y los adherentes a cargo de cada uno.',
         v_contrato_empresa::text,
         'contrato_empresa'),
        ('Anexo de Movimiento de Nomina',
         'Anexo de alta o baja de personas sobre un contrato ya firmado. La variable movimiento indica cual de los dos es. Se emite sobre la venta-operacion (sale_type=alta_adherente).',
         v_anexo_movimiento::text,
         'anexo_movimiento')
      ) AS v(name, description, content, template_type)
    ON CONFLICT (company_id, name) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_insertadas FROM nuevas;

  RAISE NOTICE 'Seed plantillas de empresa: % empresa(s) x 2 = % esperadas, % insertadas, % ya existían (no se pisaron).',
    v_empresas, v_esperadas, v_insertadas, v_esperadas - v_insertadas;

  IF v_insertadas < v_esperadas THEN
    RAISE NOTICE 'Revisá las salteadas: si alguien creó a mano una plantilla con el mismo nombre y otro contenido, el vendedor podría estar usando la equivocada. SELECT company_id, name, template_type FROM public.templates WHERE name IN (''Contrato Colectivo de Empresa'', ''Anexo de Movimiento de Nomina'');';
  END IF;
END
$seed$;
$pase_20$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260909000001_beneficiaries_opciones_por_empleado.sql
  -- ##########################################################################
  v_paso := '20260909000001_beneficiaries_opciones_por_empleado.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_21$
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
$pase_21$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260909000002_beneficiaries_sin_titular_en_empresa.sql
  -- ##########################################################################
  v_paso := '20260909000002_beneficiaries_sin_titular_en_empresa.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_22$
-- ============================================================================
-- Una venta de EMPRESA no lleva beneficiario titular
-- ============================================================================
-- La razon social NO es beneficiaria de si misma: en un contrato corporativo no
-- hay fila de titular, no hay `is_primary` y `titular_amount` es 0 (ver
-- CLAUDE.md, "Venta a EMPRESA"). Quien declara salud y cobra cobertura es cada
-- EMPLEADO de la nomina y cada uno de sus adherentes.
--
-- La pestaña DDJJ Salud violaba eso: cuando la venta no tenia ningun
-- beneficiario `is_primary` anteponia un "titular virtual" armado con el cliente
-- de la venta —que en una venta de empresa es la EMPRESA— y al guardar ese paso
-- insertaba la razon social como beneficiaria. Esa fila caia en `sueltos` de
-- `agruparNomina`, se imprimia en el contrato y la sumaba
-- `recalculate_sale_total_amount`.
--
-- El front ya no ofrece ese paso (SaleDDJJTab arma los pasos desde la nomina),
-- pero la guarda va tambien en la base para que sobreviva a un revert de
-- Lovable, que es la regla de defensa en profundidad del proyecto.
--
-- Se EXTIENDE la funcion existente `beneficiaries_validate_nomina()` en vez de
-- sumar un septimo trigger a `beneficiaries`: mismo nombre, misma firma, mismos
-- atributos (SECURITY DEFINER + search_path=public) y el mismo trigger
-- `trg_beneficiaries_validate_nomina` (BEFORE INSERT OR UPDATE) que ya la
-- ejecuta. Sus dos validaciones previas quedan intactas.
--
-- Cero impacto: al aplicarla no existe ninguna fila que la viole (verificado en
-- US test: 0 beneficiarios `is_primary` en ventas de empresa). Una venta a
-- persona fisica no cambia en nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.beneficiaries_validate_nomina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_padre text;
BEGIN
  -- La razon social no es beneficiaria de si misma.
  IF NEW.is_primary IS TRUE
     AND EXISTS (SELECT 1
                   FROM public.sales s
                   JOIN public.clients c ON c.id = s.client_id
                  WHERE s.id = NEW.sale_id
                    AND c.client_type = 'empresa') THEN
    RAISE EXCEPTION
      'Una venta de EMPRESA no lleva beneficiario titular: la razon social no es beneficiaria de si misma.'
      USING ERRCODE = '23514',
            HINT = 'Cargue a las personas en la pestaña Nomina (member_role=empleado) y a sus adherentes debajo de cada una.';
  END IF;

  IF NEW.parent_beneficiary_id IS NOT NULL THEN
    SELECT member_role INTO v_rol_padre
    FROM public.beneficiaries WHERE id = NEW.parent_beneficiary_id;

    IF v_rol_padre IS DISTINCT FROM 'empleado' THEN
      RAISE EXCEPTION
        'Un adherente solo puede depender de un EMPLEADO, y ese beneficiario no lo es.'
        USING ERRCODE = '23514',
              HINT = 'La nomina tiene exactamente dos niveles: empleado -> adherentes. No se admite anidar un adherente debajo de otro.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.member_role = 'empleado'
     AND NEW.member_role <> 'empleado'
     AND EXISTS (SELECT 1 FROM public.beneficiaries WHERE parent_beneficiary_id = NEW.id) THEN
    RAISE EXCEPTION
      'El empleado tiene adherentes a cargo: no puede dejar de ser empleado.'
      USING ERRCODE = '23514',
            HINT = 'Reasigne o elimine primero a sus adherentes.';
  END IF;

  RETURN NEW;
END;
$$;
$pase_22$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260910000001_sales_contract_end_date.sql
  -- ##########################################################################
  v_paso := '20260910000001_sales_contract_end_date.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_23$
-- ============================================================================
-- Fin de vigencia del contrato (sales.contract_end_date)
-- ============================================================================
-- La lista de ventas mostraba "Vence: {signature_expires_at}", que es la
-- expiracion del LINK DE FIRMA, no la vigencia del contrato — por eso todas las
-- filas decian "No definido". Hasta ahora el sistema no registraba en ningun
-- lado hasta cuando esta vigente un contrato, asi que las renovaciones dependian
-- de que alguien se acordara.
--
-- Esta columna pasa a ser la fuente de verdad de la vigencia: la lee la columna
-- VIGENCIA de la pantalla de Ventas (src/lib/vigencia.ts) y el aviso de
-- vencimiento al vendedor (`notify_expiring_sales()`, migracion 20260910000002).
--
-- En US test la columna YA EXISTE con 17 ventas cargadas; en BR produccion no
-- existia. El ADD COLUMN IF NOT EXISTS deja las dos bases en el mismo estado sin
-- tocar los datos existentes.
--
-- Cero impacto: nace NULL y nadie la lee obligatoriamente. Una venta sin fecha
-- de fin simplemente no muestra vigencia y no genera avisos.
--
-- SIN BACKFILL A PROPOSITO. `contract_start_date + 1 year` es una suposicion
-- comercial: aplicada de golpe sobre los contratos historicos dispararia una
-- tanda de avisos falsos en la primera corrida del cron, y el indice unico de
-- 20260910000002 los deja pegados (no hay "des-notificar"). El autocompletado a
-- 12 meses vive en el formulario (SaleBasicTab), donde una persona lo ve y lo
-- puede corregir antes de guardar.
-- ============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS contract_end_date date;

COMMENT ON COLUMN public.sales.contract_end_date IS
  'Fin de vigencia del contrato. Alimenta la columna VIGENCIA de la lista de ventas y el aviso de vencimiento al vendedor (notify_expiring_sales). Se sugiere a 12 meses del inicio desde el formulario, pero es editable.';

-- El job diario filtra por esta columna sobre el universo de ventas cerradas.
-- Parcial porque la mayoria de las filas la tiene en NULL.
CREATE INDEX IF NOT EXISTS idx_sales_contract_end_date
  ON public.sales (contract_end_date)
  WHERE contract_end_date IS NOT NULL;
$pase_23$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260910000002_notify_expiring_sales.sql
  -- ##########################################################################
  v_paso := '20260910000002_notify_expiring_sales.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_24$
-- ============================================================================
-- Aviso al vendedor: falta 1 mes para que venza la vigencia del contrato
-- ============================================================================
-- Un job diario de pg_cron recorre los contratos firmados/completados cuyo
-- `contract_end_date` cae dentro de los proximos 30 dias y le deja al VENDEDOR
-- una notificacion en la campanita, con el link a la venta.
--
-- Vive en la base y no en el front a proposito, por el mismo motivo que la
-- cadena de activacion de los anexos: el navegador puede no estar abierto el dia
-- que corresponde avisar, y un vendedor que no entra al sistema es justamente el
-- que mas necesita el recordatorio.
--
-- ── Idempotencia: un indice unico parcial, no una columna en `sales` ────────
-- Se notifica una sola vez por (vendedor, venta, fecha de vencimiento), y eso lo
-- garantiza `uq_notifications_contract_expiry` + ON CONFLICT DO NOTHING. El
-- `link` ya identifica la venta Y la fecha, asi que una renovacion (fecha nueva)
-- produce un link nuevo y vuelve a avisar sola, que es lo deseado.
--
-- La alternativa —un `sales.expiry_notified_at`— quedo descartada porque
-- obligaria a hacer UPDATE sobre `sales` de contratos ya firmados, despertando
-- `trg_audit_sales`, `update_sales_updated_at` y `vendedor_edit_restriction`.
-- Un `NOT EXISTS` suelto tampoco alcanza: no da garantia bajo concurrencia.
--
-- ── Por que hace falta traducir el destinatario ─────────────────────────────
-- `notifications.user_id` tiene FK dura a `auth.users(id)`: si una sola fila del
-- lote apunta a un id que no existe ahi, se cae el INSERT ENTERO y ese dia no se
-- avisa nada. Y `sales.salesperson_id` referencia `profiles.id`, que NO siempre
-- es el auth uid: en BR produccion `profiles` tiene ademas `user_id` y hay un
-- perfil donde difieren; en US test la columna `user_id` ni siquiera existe.
-- `auth_user_of_profile()` resuelve las dos formas y descarta al huerfano.
-- ============================================================================

-- ── 1. Traductor profiles.id -> auth.users.id ───────────────────────────────
-- El EXECUTE dinamico no es adorno: SQL estatico que mencione `p.user_id` no
-- compila en la base que no tiene esa columna, aunque la rama nunca se ejecute.
CREATE OR REPLACE FUNCTION public.auth_user_of_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_uid uuid;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  = 'user_id'
  ) THEN
    EXECUTE 'SELECT COALESCE(p.user_id, p.id) FROM public.profiles p WHERE p.id = $1'
      INTO v_uid USING p_profile_id;
  ELSE
    SELECT p.id INTO v_uid FROM public.profiles p WHERE p.id = p_profile_id;
  END IF;

  -- Sin esta guarda, un perfil sin usuario de auth voltea el lote completo.
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    RETURN NULL;
  END IF;

  RETURN v_uid;
END;
$fn$;

COMMENT ON FUNCTION public.auth_user_of_profile(uuid) IS
  'Traduce un profiles.id (p.ej. sales.salesperson_id) al auth.users.id destinatario de una notificacion. Devuelve NULL si el perfil no tiene usuario de auth, para no violar la FK de notifications.user_id.';

-- Es SECURITY DEFINER y devuelve identificadores de auth: no tiene por que estar
-- al alcance de un cliente. La llama `notify_expiring_sales`, que corre como
-- postgres y por lo tanto la sigue pudiendo ejecutar.
REVOKE ALL ON FUNCTION public.auth_user_of_profile(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Candado de idempotencia ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_contract_expiry
  ON public.notifications (user_id, link)
  WHERE type = 'contract_expiry';

-- ── 3. El job ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_expiring_sales(p_dias integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_insertadas integer;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, link)
  SELECT dest.uid,
         'Vence la vigencia de un contrato',
         format(
           'El contrato %s de %s vence el %s (faltan %s dias). Coordina la renovacion.',
           COALESCE(s.contract_number, 'sin numero'),
           COALESCE(
             NULLIF(c.razon_social, ''),
             NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
             'el cliente'
           ),
           to_char(s.contract_end_date, 'DD/MM/YYYY'),
           (s.contract_end_date - CURRENT_DATE)
         ),
         'contract_expiry',
         '/sales/' || s.id || '?vencimiento=' || to_char(s.contract_end_date, 'YYYY-MM-DD')
    FROM public.sales s
    LEFT JOIN public.clients c ON c.id = s.client_id
    CROSS JOIN LATERAL (SELECT public.auth_user_of_profile(s.salesperson_id) AS uid) dest
   WHERE s.status IN ('firmado', 'completado')
     AND s.salesperson_id IS NOT NULL
     AND dest.uid IS NOT NULL
     AND s.contract_end_date IS NOT NULL
     AND s.contract_end_date >= CURRENT_DATE
     AND s.contract_end_date <= CURRENT_DATE + p_dias
  ON CONFLICT (user_id, link) WHERE type = 'contract_expiry' DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN v_insertadas;
END;
$fn$;

COMMENT ON FUNCTION public.notify_expiring_sales(integer) IS
  'Job diario: avisa al vendedor de cada contrato firmado/completado cuyo contract_end_date cae dentro de p_dias. Idempotente por (user_id, link) via uq_notifications_contract_expiry. Devuelve cuantas notificaciones creo.';

-- La llama el cron con el rol postgres; ningun cliente tiene por que invocarla.
REVOKE ALL ON FUNCTION public.notify_expiring_sales(integer) FROM PUBLIC, anon, authenticated;

-- El agendado va en 20260910000003, en su propio archivo a proposito: ver el
-- encabezado de esa migracion.
$pase_24$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260910000003_schedule_notify_expiring_sales.sql
  -- ##########################################################################
  v_paso := '20260910000003_schedule_notify_expiring_sales.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_25$
-- ============================================================================
-- Agendado diario del aviso de vencimiento (pg_cron)
-- ============================================================================
-- Va en su PROPIO archivo, separado de 20260910000002, a proposito.
--
-- Cada archivo de migracion corre dentro de una unica transaccion. Si
-- `CREATE EXTENSION pg_cron` o `cron.schedule` fallan —la extension no
-- habilitada en ese proyecto, permisos, `cron.database_name` distinto— se
-- revierte TODO el archivo. Metido junto con las funciones, un fallo del
-- agendado se llevaria puestas `auth_user_of_profile`, `notify_expiring_sales` y
-- el indice de idempotencia, dejando la columna de 20260910000001 aplicada pero
-- el resto no: el peor de los estados intermedios.
--
-- Aca aislado, si esto falla, lo unico que queda pendiente es el agendado. La
-- funcion sigue instalada y se la puede llamar a mano o agendar despues, una vez
-- habilitada la extension desde Database → Extensions.
--
-- No hay precedente de pg_cron en ninguna otra migracion de este repo (los 2
-- jobs que corren en BR prod se crearon fuera de version), asi que no se puede
-- dar por hecho que la extension este disponible en todos los entornos.
--
-- Horario: la base corre en UTC y Paraguay es UTC-4, asi que 12:00 UTC son las
-- 08:00 de la manana aca — el vendedor se encuentra el aviso al empezar el dia.
--
-- Idempotente: el unschedule previo permite re-agendar aunque cambie el comando
-- o el horario, sin duplicar el job.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-expiring-sales';
END;
$$;

SELECT cron.schedule(
  'notify-expiring-sales',
  '0 12 * * *',
  $$SELECT public.notify_expiring_sales(30);$$
);
$pase_25$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260910000004_alta_empleado_con_adherentes.sql
  -- ##########################################################################
  v_paso := '20260910000004_alta_empleado_con_adherentes.sql';
  v_t := clock_timestamp();
  EXECUTE $pase_26$
-- ============================================================================
-- Alta de un EMPLEADO junto con sus ADHERENTES en un solo movimiento
-- ============================================================================
-- Hasta acá un alta de nómina era de un solo rol: o empleados, o adherentes de
-- un empleado que YA vivía en el contrato madre (`parent_target_beneficiary_id`).
-- Incorporar a alguien con su grupo familiar exigía dos movimientos y dos
-- ceremonias de firma, y el segundo ni siquiera se podía preparar hasta que el
-- primero estuviera firmado y activado.
--
-- Ahora el front arma el vínculo DENTRO de la venta-operación: el adherente
-- nace con `parent_beneficiary_id` apuntando al empleado de esa misma venta,
-- que es lo único que la FK compuesta `fk_beneficiaries_parent
-- (parent_beneficiary_id, sale_id)` permite. Esta función lo traduce al
-- contrato madre al activar.
--
-- Tres cambios, todos en la rama ALTA:
--   1. Los empleados se activan PRIMERO (ORDER BY), para que su
--      `activated_beneficiary_id` exista cuando le toque a sus adherentes.
--   2. Si el padre no resuelve contra la madre, se busca por el
--      `parent_beneficiary_id` del beneficiario de la operación → fila hermana
--      de `adherent_incorporations` → `activated_beneficiary_id`.
--   3. `requires_adherents` y `maternity_bonus` viajan a la madre.
--
-- ⚠️ El filtro `AND COALESCE(movement_type,'alta') = 'alta'` NO se toca: sin él
--    firmar una BAJA copiaría a la persona al contrato madre, en silencio.
-- ⚠️ Mismo nombre y misma firma que la versión anterior: es una de las 4
--    funciones que `trg_beneficiaries_block_when_sale_signed` exime por
--    PG_CONTEXT. Cambiarlas la dejaría afuera y el alta fallaría con 42501.
--
-- Sólo aplica en US test: el módulo de nómina de empresa no existe en BR prod.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_adherent_incorporation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_new_id uuid;
  v_parent_id uuid;
  v_plan_id uuid;
  v_member_role text;
  v_fin date;
  v_ids uuid[];
BEGIN
  IF NEW.sale_type IS DISTINCT FROM 'alta_adherente' THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text <> 'completado'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- ---------------- ALTA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND activated_beneficiary_id IS NULL
      AND parent_sale_id IS NOT NULL
      -- Sin este filtro una BAJA caeria aca y copiaria a la persona al contrato
      -- madre, en silencio y justo al reves de lo pedido.
      AND COALESCE(movement_type, 'alta') = 'alta'
    -- Los EMPLEADOS primero: un adherente que entra en el mismo movimiento
    -- cuelga de uno de ellos, y para vincularlo hace falta que su padre ya
    -- exista en el contrato madre (o sea, que su fila ya tenga
    -- activated_beneficiary_id).
    ORDER BY (COALESCE(member_role, 'adherente') = 'empleado') DESC, created_at
  LOOP
    v_new_id := NULL;

    v_parent_id := NULL;
    IF r.parent_target_beneficiary_id IS NOT NULL THEN
      SELECT b.id INTO v_parent_id
      FROM public.beneficiaries b
      WHERE b.id = r.parent_target_beneficiary_id
        AND b.sale_id = r.parent_sale_id
        AND b.member_role = 'empleado';
    END IF;

    -- Empleado NUEVO que entra en este mismo movimiento: su adherente no puede
    -- apuntar al contrato madre cuando se arma el alta (el padre todavia no
    -- existe alli), asi que el vinculo se guarda DENTRO de la venta-operacion,
    -- donde la FK compuesta (parent_beneficiary_id, sale_id) si se cumple. Aca
    -- se traduce: del padre en la operacion se salta a la fila hermana de
    -- adherent_incorporations y de ahi al beneficiario ya creado en la madre.
    IF v_parent_id IS NULL AND r.operation_beneficiary_id IS NOT NULL THEN
      SELECT ai.activated_beneficiary_id INTO v_parent_id
      FROM public.beneficiaries ob
      JOIN public.adherent_incorporations ai
        ON ai.operation_sale_id = r.operation_sale_id
       AND ai.operation_beneficiary_id = ob.parent_beneficiary_id
      WHERE ob.id = r.operation_beneficiary_id
        AND ob.parent_beneficiary_id IS NOT NULL;
    END IF;

    v_member_role := COALESCE(r.member_role, 'adherente');
    IF v_member_role = 'empleado' THEN
      v_parent_id := NULL;
    END IF;

    IF r.operation_beneficiary_id IS NOT NULL THEN
      SELECT COALESCE(r.adherent_plan_id, b.plan_id) INTO v_plan_id
      FROM public.beneficiaries b WHERE b.id = r.operation_beneficiary_id;

      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_type, document_number,
        birth_date, gender, relationship, amount, email, phone, address, barrio,
        city, province, postal_code, occupation, marital_status,
        entry_date, immediate_coverage, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id,
        requires_adherents, maternity_bonus
      )
      SELECT r.parent_sale_id, b.first_name, b.last_name, b.dni, b.document_type,
             b.document_number, b.birth_date, b.gender, b.relationship, b.amount,
             b.email, b.phone, b.address, b.barrio, b.city, b.province,
             b.postal_code, b.occupation, b.marital_status,
             b.entry_date, b.immediate_coverage,
             false, false,
             v_member_role, v_parent_id, v_plan_id,
             -- Un empleado que declaro grupo familiar tiene que seguir
             -- declarandolo en la madre: si no, pierde el boton "Agregar
             -- adherente" y pareceria que el sistema se rompio.
             COALESCE(b.requires_adherents, false),
             COALESCE(b.maternity_bonus, false)
      FROM public.beneficiaries b
      WHERE b.id = r.operation_beneficiary_id
      RETURNING id INTO v_new_id;
    END IF;

    IF v_new_id IS NULL THEN
      INSERT INTO public.beneficiaries (
        sale_id, first_name, last_name, dni, document_number, birth_date,
        relationship, amount, email, phone, entry_date, is_primary, signature_required,
        member_role, parent_beneficiary_id, plan_id
      )
      VALUES (
        r.parent_sale_id, r.adherent_first_name, r.adherent_last_name,
        r.adherent_document_number, r.adherent_document_number, r.adherent_birth_date,
        r.adherent_relationship, r.adherent_amount, r.adherent_email, r.adherent_phone,
        r.coverage_start_date, false, false,
        v_member_role, v_parent_id, r.adherent_plan_id
      )
      RETURNING id INTO v_new_id;
    END IF;

    UPDATE public.adherent_incorporations
    SET activated_beneficiary_id = v_new_id,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  -- ---------------- BAJA ----------------
  FOR r IN
    SELECT * FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id
      AND movement_type = 'baja'
      AND parent_sale_id IS NOT NULL
      AND status NOT IN ('completed', 'cancelled')
  LOOP
    v_fin := COALESCE(r.termination_date, r.coverage_end_date, CURRENT_DATE);

    WITH bajas AS (
      UPDATE public.beneficiaries
         SET status = 'inactive',
             coverage_end_date = v_fin,
             signature_required = false
       WHERE sale_id = r.parent_sale_id
         AND COALESCE(status, 'active') = 'active'
         AND ( id = r.target_beneficiary_id
               OR ( COALESCE(r.cascade_dependents, true)
                    AND parent_beneficiary_id = r.target_beneficiary_id ) )
      RETURNING id
    )
    SELECT array_agg(id) INTO v_ids FROM bajas;

    UPDATE public.adherent_incorporations
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        activated_beneficiary_id = r.target_beneficiary_id,
        deactivated_beneficiary_ids = v_ids
    WHERE id = r.id;
  END LOOP;

  -- Nueva cuota mensual del contrato madre: el alta la sube, la baja la baja.
  FOR r IN
    SELECT DISTINCT parent_sale_id
    FROM public.adherent_incorporations
    WHERE operation_sale_id = NEW.id AND parent_sale_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_sale_total_amount(r.parent_sale_id);
  END LOOP;

  RETURN NEW;
END;
$function$;
-- El trigger ya existe (trg_activate_adherent_incorporation ON sales) y no
-- se recrea: se reemplaza sólo el cuerpo de la función.
$pase_26$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- verificacion, guarda de datos e historial
  -- ##########################################################################
  v_paso := 'verificacion, guarda de datos e historial';
  v_t := clock_timestamp();
  EXECUTE $pase_27$
-- ############################################################################
-- VERIFICACION — aborta si falta algo
-- ############################################################################
DO $verif$
DECLARE
  v_faltas text[] := '{}';
  v_x text;
BEGIN
  FOREACH v_x IN ARRAY ARRAY['beneficiaries.status', 'beneficiaries.coverage_end_date', 'beneficiaries.entry_date', 'beneficiaries.immediate_coverage', 'beneficiaries.member_role', 'beneficiaries.parent_beneficiary_id', 'beneficiaries.plan_id', 'beneficiaries.requires_adherents', 'beneficiaries.maternity_bonus', 'clients.client_type', 'clients.razon_social', 'clients.ruc', 'clients.external_id', 'clients.hr_contact_name', 'clients.hr_contact_phone', 'clients.hr_contact_email', 'sales.employee_signature_mode', 'sales.maternity_bonus', 'sales.contract_end_date']::text[] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = split_part(v_x, '.', 1)
                      AND column_name = split_part(v_x, '.', 2)) THEN
      v_faltas := v_faltas || ('columna ' || v_x);
    END IF;
  END LOOP;

  FOREACH v_x IN ARRAY ARRAY['beneficiaries.trg_beneficiaries_block_when_sale_signed', 'beneficiaries.trg_beneficiaries_validate_nomina', 'sales.trg_activate_adherent_incorporation', 'sales.trg_activate_plan_change', 'adherent_incorporations.trg_adherent_incorporations_guard_lifecycle', 'plan_changes.trg_plan_changes_guard_lifecycle']::text[] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = format('public.%I', split_part(v_x, '.', 1))::regclass
                      AND tgname = split_part(v_x, '.', 2) AND NOT tgisinternal) THEN
      v_faltas := v_faltas || ('trigger ' || v_x);
    END IF;
  END LOOP;

  FOREACH v_x IN ARRAY ARRAY['adherent_incorporations', 'plan_changes'] LOOP
    IF NOT COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_x)), false) THEN
      v_faltas := v_faltas || ('tabla con RLS ' || v_x);
    END IF;
  END LOOP;

  IF pg_get_functiondef('public.recalculate_sale_total_amount(uuid)'::regprocedure)
     NOT LIKE '%COALESCE(status, ''active'') = ''active''%' THEN
    v_faltas := v_faltas || 'recalculate_sale_total_amount(uuid) sin filtro por status'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
                    AND pg_get_function_result(p.oid) = 'trigger'
                    AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%') THEN
    v_faltas := v_faltas || 'el trigger de total no delega en la version con argumento'::text;
  END IF;

  -- La trampa mas peligrosa del modulo (CLAUDE.md): sin este filtro, firmar una
  -- baja copia a la persona al contrato madre.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.activate_adherent_incorporation()'::regprocedure)
     NOT LIKE '%COALESCE(movement_type, ''alta'') = ''alta''%' THEN
    v_faltas := v_faltas || 'activate_adherent_incorporation sin el filtro movement_type=alta'::text;
  END IF;

  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.generate_contract_number()'::regprocedure)
     NOT LIKE '%alta_adherente%' THEN
    v_faltas := v_faltas || 'generate_contract_number sin las series de anexos'::text;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-expiring-sales') THEN
    v_faltas := v_faltas || 'job notify-expiring-sales'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM public.beneficiaries WHERE status <> 'active') THEN
    v_faltas := v_faltas || 'hay beneficiarios que no quedaron en active'::text;
  END IF;

  IF cardinality(v_faltas) > 0 THEN
    RAISE EXCEPTION 'Verificacion fallida, no se aplico nada: %', array_to_string(v_faltas, '; ');
  END IF;
END
$verif$;

-- ############################################################################
-- GUARDA DE DATOS — ninguna fila preexistente cambio
-- ############################################################################
DO $guarda$
DECLARE
  r record;
  v_h record;
  v_errores text[] := '{}';
  v_nuevas bigint;
  v_esperadas bigint := (SELECT valor FROM pe_scratch.esperado WHERE clave = 'plantillas_nuevas');
  v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM pe_scratch.foto ORDER BY tabla LOOP
    v_n := v_n + 1;
    IF r.tabla = 'templates' THEN
      SELECT * INTO v_h FROM pe_scratch.huella('templates', 'WHERE id IN (SELECT id FROM pe_scratch.templates_antes)');
    ELSE
      SELECT * INTO v_h FROM pe_scratch.huella(r.tabla);
    END IF;

    IF v_h.filas <> r.filas OR v_h.huella <> r.huella THEN
      v_errores := v_errores || format('%s: %s filas -> %s%s', r.tabla, r.filas, v_h.filas,
                                       CASE WHEN v_h.filas = r.filas THEN ' (mismo conteo, filas reescritas)' ELSE '' END);
    END IF;
  END LOOP;

  -- Columnas preexistentes: todas siguen, con el mismo nombre y el mismo tipo.
  SELECT v_errores || coalesce(array_agg(format('columna %s.%s (%s) desaparecio o cambio de tipo', c.tabla, c.columna, c.tipo)
                                         ORDER BY c.tabla, c.columna), '{}')
    INTO v_errores
    FROM pe_scratch.columnas c
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass(format('public.%I', c.tabla))
                        AND a.attname = c.columna AND a.attnum > 0 AND NOT a.attisdropped
                        AND format_type(a.atttypid, a.atttypmod) = c.tipo);

  -- templates: ademas de las preexistentes intactas, exactamente las sembradas
  -- y todas inactivas.
  SELECT count(*) INTO v_nuevas FROM public.templates
   WHERE id NOT IN (SELECT id FROM pe_scratch.templates_antes);
  IF v_nuevas <> v_esperadas THEN
    v_errores := v_errores || format('templates: %s filas nuevas, se esperaban %s', v_nuevas, v_esperadas);
  END IF;
  IF EXISTS (SELECT 1 FROM public.templates
              WHERE id NOT IN (SELECT id FROM pe_scratch.templates_antes)
                AND (is_active OR name <> ALL (ARRAY['Anexo de Incorporación de Adherente', 'Formulario de Solicitud de Cambio de Plan', 'Anexo Especial de Vigencia Inmediata', 'Contrato Colectivo de Empresa', 'Anexo de Movimiento de Nomina']::text[]))) THEN
    v_errores := v_errores || 'templates: hay filas nuevas activas o que no son las sembradas'::text;
  END IF;

  IF cardinality(v_errores) > 0 THEN
    RAISE EXCEPTION 'GUARDA DE DATOS: el pase modifico datos existentes. Se deshace todo. %', array_to_string(v_errores, ' | ');
  END IF;

  RAISE NOTICE 'Guarda OK: % tablas sin ninguna fila escrita; % plantillas nuevas, inactivas.', v_n, v_nuevas;
END
$guarda$;

-- ############################################################################
-- Ventas firmadas cuyo total guardado no sale de la formula (A2)
-- ############################################################################
-- No se tocaron, pero la proxima activacion de un anexo sobre ellas les
-- recalcularia el total. Si aparece una que no es de las 3 conocidas, hay que
-- mirarla antes de seguir.
DO $conocidas$
DECLARE
  v_distintas text[];
BEGIN
  SELECT coalesce(array_agg(s.contract_number ORDER BY s.contract_number), '{}')
    INTO v_distintas
    FROM public.sales s
   WHERE s.status::text IN ('firmado_parcial', 'firmado', 'completado')
     AND coalesce(s.total_amount, 0) IS DISTINCT FROM (
       CASE WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                          WHERE b.sale_id = s.id AND coalesce(b.is_primary, false))
            THEN coalesce((SELECT sum(coalesce(b.amount, 0)) FROM public.beneficiaries b WHERE b.sale_id = s.id), 0)
            ELSE coalesce(s.titular_amount, 0)
                 + coalesce((SELECT sum(coalesce(b.amount, 0)) FROM public.beneficiaries b WHERE b.sale_id = s.id), 0)
       END);

  IF NOT (v_distintas <@ ARRAY['2026-000109', '2026-000191', '2026-000207']::text[]) THEN
    RAISE EXCEPTION 'Hay ventas firmadas con el total fuera de la formula que no son las 3 conocidas: %. Revisar antes de aplicar.',
      array_to_string(v_distintas, ', ');
  END IF;
END
$conocidas$;

-- ############################################################################
-- Historial de migraciones: solo las versiones aplicadas
-- ############################################################################
-- Para que un "db push" futuro no las reaplique. Las excluidas (comisiones,
-- 20260822000003) NO se registran.
DO $hist$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES
      ('20260813000001', 'adherent_incorporation_schema', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260813000002', 'incorporacion_varios_adherentes', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260813000003', 'activacion_incorporacion', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260817000001', 'fix_incorporacion_status_vocabulario', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260817000002', 'sales_maternity_bonus', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260818000001', 'fix_total_amount_single_source', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260818000002', 'beneficiaries_signed_contract_guard', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260818000003', 'adherent_incorporation_lifecycle', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260819000001', 'plan_change_schema', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260819000002', 'plan_change_activation', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260822000001', 'templates_unique_name_por_empresa', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260822000002', 'seed_plantillas_tipos_venta', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000001', 'beneficiaries_nomina_empresa', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000002', 'clients_contacto_rrhh', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000003', 'adherent_incorporations_movimientos', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000004', 'total_amount_excluye_bajas', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000005', 'activate_incorporation_movimientos', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260908000006', 'seed_plantillas_empresa', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260909000001', 'beneficiaries_opciones_por_empleado', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260909000002', 'beneficiaries_sin_titular_en_empresa', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260910000001', 'sales_contract_end_date', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260910000002', 'notify_expiring_sales', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260910000003', 'schedule_notify_expiring_sales', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)']),
      ('20260910000004', 'alta_empleado_con_adherentes', ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)'])
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$hist$;
$pase_27$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- limpieza del esquema scratch
  -- ##########################################################################
  v_paso := 'limpieza del esquema scratch';
  v_t := clock_timestamp();
  EXECUTE $pase_28$
DROP SCHEMA pe_scratch CASCADE;
$pase_28$;
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  v_paso := 'mediciones';
  v_bloqueo := round(extract(epoch FROM clock_timestamp() - v_t_bloqueo)::numeric, 2);
  v_total := round(extract(epoch FROM clock_timestamp() - v_t_inicio)::numeric, 2);
  SELECT string_agg(format('%s %s s', n, round(d, 2)), ', ' ORDER BY d DESC) INTO v_lentos
    FROM (SELECT n, d FROM unnest(v_nombres, v_duraciones) u(n, d) ORDER BY d DESC LIMIT 3) s;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version <> ALL ($1)'
      INTO v_sin_archivo USING ARRAY['20250710182447', '20250710192711', '20250711110418', '20250715193438', '20250715195259', '20250715205545', '20250716144836', '20250716153716', '20250716155645', '20250716161248', '20250716162259', '20250716210249', '20250717002333', '20250717151249', '20250717170712', '20250717171225', '20250717195407', '20250717201311', '20250718125307', '20250725221720', '20250727181607', '20250730114958', '20250731123927', '20250731125815', '20250801111126', '20250801112733', '20250801140726', '20250803231059', '20250807125437', '20250807150749', '20250811204601', '20250812124915', '20250813123552', '20250814113907', '20250818131139', '20260203023846', '20260203023945', '20260203024758', '20260203114224', '20260203132328', '20260204022658', '20260205193814', '20260205194053', '20260205194128', '20260205203420', '20260206124854', '20260209130156', '20260209132845', '20260209171351', '20260209173731', '20260209181719', '20260209181922', '20260209191333', '20260209210415', '20260210120000', '20260210130000', '20260210143000', '20260211000000', '20260211100000', '20260211100001', '20260211180635', '20260211183409', '20260211183809', '20260211185141', '20260211192246', '20260211193726', '20260211200856', '20260211201657', '20260211202857', '20260213185108', '20260215030225', '20260215030640', '20260216120000', '20260218215303', '20260219013511', '20260219123301', '20260219130000', '20260220191434', '20260223120000', '20260223153000', '20260224120000', '20260224184412', '20260224201035', '20260224203002', '20260224203435', '20260225135136', '20260225152638', '20260226133225', '20260226163113', '20260226164303', '20260226172651', '20260226174702', '20260227004522', '20260304004143', '20260304112449', '20260304112557', '20260304120000', '20260304133819', '20260304141401', '20260304141708', '20260305211955', '20260306171942', '20260306174522', '20260306174644', '20260308022010', '20260308055116', '20260310120000', '20260313122252', '20260313202614', '20260313204145', '20260313204230', '20260313204443', '20260313204627', '20260313211823', '20260313211913', '20260313212022', '20260316191713', '20260316201341', '20260318005826', '20260318021419', '20260318022449', '20260318212246', '20260318212319', '20260318214336', '20260318214356', '20260319154519', '20260320115908', '20260320121637', '20260320132936', '20260320161525', '20260325103000', '20260325104500', '20260325105000', '20260330120000', '20260331012519', '20260331012616', '20260331021912', '20260331023708', '20260331121915', '20260331142943', '20260331161407', '20260331223756', '20260331230901', '20260401003748', '20260402203606', '20260404235832', '20260406153000', '20260407144448', '20260414000000', '20260414000001', '20260414000002', '20260416103000', '20260804175027', '20260804175810', '20260804190000', '20260804200000', '20260804210000', '20260804220000', '20260813000001', '20260813000002', '20260813000003', '20260817000001', '20260817000002', '20260818000001', '20260818000002', '20260818000003', '20260819000001', '20260819000002', '20260819000003', '20260819210000', '20260821120000', '20260822000001', '20260822000002', '20260822000003', '20260908000001', '20260908000002', '20260908000003', '20260908000004', '20260908000005', '20260908000006', '20260909000001', '20260909000002', '20260910000001', '20260910000002', '20260910000003', '20260910000004', '20261007000001']::text[];
  END IF;
  v_medicion := format('Tablas bloqueadas %s s (desde el PASO 0 hasta el final; total %s s). Pasos mas lentos: %s. '
                       || 'db push: %s.',
                       v_bloqueo, v_total, v_lentos,
                       CASE WHEN coalesce(v_sin_archivo, 0) > 0
                            THEN format('BLOQUEADO por la CLI (%s versiones en el historial sin archivo en el repo)', v_sin_archivo)
                            ELSE 'ATENCION, la CLI podria aplicar migraciones excluidas (comisiones) con un db push' END);

  RAISE NOTICE 'PASE APLICADO. %', v_medicion;

EXCEPTION WHEN OTHERS THEN
  -- Cualquier error deshace la sentencia ENTERA; esto solo agrega en que paso fue.
  RAISE EXCEPTION USING
    MESSAGE = SQLERRM || '  [paso: ' || v_paso || ']',
    ERRCODE = SQLSTATE;
END
$pase_entrega_a$;

-- Lectura posterior, para ver el resultado en el SQL Editor.
SELECT 'PASE APLICADO' AS estado,
       (SELECT count(*) FROM public.templates WHERE name = ANY (ARRAY['Anexo de Incorporación de Adherente', 'Formulario de Solicitud de Cambio de Plan', 'Anexo Especial de Vigencia Inmediata', 'Contrato Colectivo de Empresa', 'Anexo de Movimiento de Nomina']::text[]) AND NOT is_active) AS plantillas_inactivas_a_activar,
       (SELECT count(*) FROM public.beneficiaries WHERE status = 'active') AS beneficiarios_activos,
       (SELECT count(*) FROM pg_namespace WHERE nspname = 'pe_scratch') AS scratch_restante;
