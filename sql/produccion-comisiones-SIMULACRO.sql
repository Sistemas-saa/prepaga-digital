-- ============================================================================
-- PASE A BR PRODUCCION — MODULO DE COMISIONES — SIMULACRO (deshace todo al final)
-- ============================================================================
-- GENERADO por scripts/produccion/build-comisiones.mjs. NO EDITAR A MANO.
--
-- Destino: ejiycfqxgtrzaysgpzmx (BR prod) o una COPIA de prod con la Entrega A
-- aplicada. Aborta solo si el modulo ya existe, si falta la Entrega A, o si el
-- esquema de public no es EXACTAMENTE el aprobado (esquema-prod-referencia-post-entrega-a.txt:
-- 90 tablas, 1053 columnas con su tipo).
--
-- Como correrlo: pegar el archivo ENTERO en el SQL Editor, o psql -f.
-- Es UNA sola sentencia DO: atomica en cualquier cliente. Cada paso se ejecuta
-- con replace(..., chr(13), '') porque el SQL Editor en Windows pega con CRLF.
--
-- Garantias:
--   * Las 12 migraciones son 100 % aditivas: solo objetos commission_*.
--   * Guarda de datos: identidad fisica (ctid + xmin) de cada fila de cada tabla
--     preexistente de public, antes y despues. Si UNA sola fila cambio, ABORTA.
--   * El modulo queda instalado y APAGADO: no se inserta configuracion.
--   * lock_timeout 3 s: si una tabla esta en uso, se cancela en vez de encolar.
-- Evitar los minutos :00 y :30 (crons de prod).
-- ============================================================================

DO $pase_comisiones$
DECLARE
  v_paso        text := 'inicio';
  v_tablas      bigint;
  v_t_inicio    timestamptz := clock_timestamp();
  v_t           timestamptz;
  v_nombres     text[] := '{}';
  v_duraciones  numeric[] := '{}';
  v_total       numeric;
  v_lentos      text;
  v_sin_archivo bigint;
  v_medicion    text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  -- ##########################################################################
  -- 0.a precondiciones
  -- ##########################################################################
  v_paso := '0.a precondiciones';
  v_t := clock_timestamp();
  EXECUTE replace($pase_00$
DO $pre$
BEGIN
  IF to_regclass('public.commission_settings') IS NOT NULL
     OR to_regclass('public.commission_items') IS NOT NULL THEN
    RAISE EXCEPTION 'El modulo de comisiones ya existe en esta base (o no es BR prod). No se hizo nada.';
  END IF;
  IF to_regclass('public.adherent_incorporations') IS NULL THEN
    RAISE EXCEPTION 'Falta el pase de la Entrega A en esta base. No se hizo nada.';
  END IF;
END
$pre$;

DO $esquema$
DECLARE
  v_ref    text[] := string_to_array($esquema_ref$adherent_incorporations.activated_beneficiary_id:uuid
adherent_incorporations.adherent_amount:numeric
adherent_incorporations.adherent_birth_date:date
adherent_incorporations.adherent_document_number:text
adherent_incorporations.adherent_document_type:text
adherent_incorporations.adherent_email:text
adherent_incorporations.adherent_first_name:text
adherent_incorporations.adherent_last_name:text
adherent_incorporations.adherent_phone:text
adherent_incorporations.adherent_plan_id:uuid
adherent_incorporations.adherent_relationship:text
adherent_incorporations.cascade_dependents:boolean
adherent_incorporations.client_id:uuid
adherent_incorporations.company_id:uuid
adherent_incorporations.completed_at:timestamp with time zone
adherent_incorporations.coverage_end_date:date
adherent_incorporations.coverage_start_date:date
adherent_incorporations.created_at:timestamp with time zone
adherent_incorporations.created_by:uuid
adherent_incorporations.deactivated_beneficiary_ids:uuid[]
adherent_incorporations.document_id:uuid
adherent_incorporations.id:uuid
adherent_incorporations.member_role:text
adherent_incorporations.movement_type:text
adherent_incorporations.notes:text
adherent_incorporations.operation_beneficiary_id:uuid
adherent_incorporations.operation_sale_id:uuid
adherent_incorporations.parent_sale_id:uuid
adherent_incorporations.parent_target_beneficiary_id:uuid
adherent_incorporations.plan_id:uuid
adherent_incorporations.signature_link_id:uuid
adherent_incorporations.source:text
adherent_incorporations.status:text
adherent_incorporations.target_beneficiary_id:uuid
adherent_incorporations.termination_date:date
adherent_incorporations.termination_reason:text
adherent_incorporations.titular_document:text
adherent_incorporations.titular_email:text
adherent_incorporations.titular_name:text
adherent_incorporations.titular_phone:text
adherent_incorporations.updated_at:timestamp with time zone
audit_comments.audit_action:text
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
beneficiaries.coverage_end_date:date
beneficiaries.created_at:timestamp with time zone
beneficiaries.dni:character varying(20)
beneficiaries.document_number:character varying
beneficiaries.document_type:character varying
beneficiaries.email:character varying(255)
beneficiaries.entry_date:date
beneficiaries.first_name:character varying(100)
beneficiaries.gender:character varying
beneficiaries.has_preexisting_conditions:boolean
beneficiaries.id:uuid
beneficiaries.immediate_coverage:boolean
beneficiaries.is_primary:boolean
beneficiaries.last_name:character varying(100)
beneficiaries.marital_status:character varying
beneficiaries.maternity_bonus:boolean
beneficiaries.member_role:text
beneficiaries.occupation:character varying
beneficiaries.parent_beneficiary_id:uuid
beneficiaries.phone:character varying(50)
beneficiaries.plan_id:uuid
beneficiaries.postal_code:character varying
beneficiaries.preexisting_conditions_detail:text
beneficiaries.province:character varying
beneficiaries.relationship:character varying(50)
beneficiaries.requires_adherents:boolean
beneficiaries.sale_id:uuid
beneficiaries.signature_link_id:uuid
beneficiaries.signature_required:boolean
beneficiaries.status:text
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
clients.client_type:text
clients.company_id:uuid
clients.country_id:uuid
clients.created_at:timestamp with time zone
clients.dni:character varying(20)
clients.email:character varying(255)
clients.external_id:character varying
clients.first_name:character varying(100)
clients.gender:character varying(20)
clients.hr_contact_email:text
clients.hr_contact_name:text
clients.hr_contact_phone:text
clients.id:uuid
clients.is_active:boolean
clients.last_name:character varying(100)
clients.marital_status:character varying(30)
clients.notes:text
clients.phone:character varying(50)
clients.postal_code:character varying(20)
clients.province:character varying(100)
clients.razon_social:character varying
clients.ruc:character varying
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
plan_changes.client_id:uuid
plan_changes.company_id:uuid
plan_changes.completed_at:timestamp with time zone
plan_changes.created_at:timestamp with time zone
plan_changes.created_by:uuid
plan_changes.document_id:uuid
plan_changes.id:uuid
plan_changes.members_snapshot:jsonb
plan_changes.new_contract_start_date:date
plan_changes.new_plan_id:uuid
plan_changes.new_total_amount:numeric
plan_changes.notes:text
plan_changes.observations:text
plan_changes.operation_sale_id:uuid
plan_changes.parent_sale_id:uuid
plan_changes.previous_plan_id:uuid
plan_changes.previous_total_amount:numeric
plan_changes.reason:text
plan_changes.signature_link_id:uuid
plan_changes.source:text
plan_changes.status:text
plan_changes.titular_document:text
plan_changes.titular_name:text
plan_changes.updated_at:timestamp with time zone
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
sales.contract_end_date:date
sales.contract_number:character varying
sales.contract_pdf_url:text
sales.contract_start_date:date
sales.created_at:timestamp with time zone
sales.employee_signature_mode:text
sales.id:uuid
sales.immediate_coverage:boolean
sales.maternity_bonus:boolean
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
    RAISE EXCEPTION 'ESQUEMA DISTINTO DEL APROBADO. No se hizo nada. Faltan %: % | Sobran %: %',
      cardinality(v_faltan), array_to_string(v_faltan[1:10], ', '),
      cardinality(v_sobran), array_to_string(v_sobran[1:10], ', ');
  END IF;
END
$esquema$;
$pase_00$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 0.b foto antes
  -- ##########################################################################
  v_paso := '0.b foto antes';
  v_t := clock_timestamp();
  EXECUTE replace($pase_01$
CREATE SCHEMA pc_scratch;
CREATE TABLE pc_scratch.columnas (tabla text, columna text, tipo text, PRIMARY KEY (tabla, columna));
INSERT INTO pc_scratch.columnas
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r', 'p');

CREATE FUNCTION pc_scratch.huella(p_tabla text, OUT filas bigint, OUT huella text)
LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass(format('public.%I', p_tabla)) IS NULL THEN
    filas := -1; huella := 'LA TABLA YA NO EXISTE'; RETURN;
  END IF;
  EXECUTE format(
    'SELECT count(*), md5(coalesce(string_agg(ctid::text || %L || xmin::text, %L ORDER BY ctid), %L)) FROM public.%I',
    ':', ',', '', p_tabla)
  INTO filas, huella;
END
$fn$;

CREATE TABLE pc_scratch.foto (tabla text PRIMARY KEY, filas bigint, huella text);
INSERT INTO pc_scratch.foto
SELECT c.relname, h.filas, h.huella
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pc_scratch.huella(c.relname) h
 WHERE c.relkind IN ('r', 'p');
$pase_01$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 202608040001_commission_01_schema.sql
  -- ##########################################################################
  v_paso := '202608040001_commission_01_schema.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_02$
-- Commission module: additive schema only. No existing table is modified.

CREATE TABLE IF NOT EXISTS public.commission_promoter_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  default_percent numeric(5,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_promoter_types_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT commission_promoter_types_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT commission_promoter_types_percent_range CHECK (default_percent IS NULL OR default_percent BETWEEN 0 AND 100),
  CONSTRAINT commission_promoter_types_company_code_key UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.commission_salespeople (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  promoter_type_id uuid NOT NULL REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_salespeople_company_salesperson_key UNIQUE (company_id, salesperson_id)
);

CREATE TABLE IF NOT EXISTS public.commission_plan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  group_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_plan_settings_group_type_check CHECK (group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_plan_settings_company_plan_key UNIQUE (company_id, plan_id)
);

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  salesperson_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  promoter_type_id uuid REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES public.plans(id) ON DELETE RESTRICT,
  sale_type text,
  group_type text,
  calc_mode text NOT NULL,
  percent numeric(5,2),
  fixed_amount numeric(14,2),
  base text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  priority integer NOT NULL DEFAULT 0,
  specificity smallint GENERATED ALWAYS AS (
    (salesperson_id IS NOT NULL)::integer +
    (promoter_type_id IS NOT NULL)::integer +
    (plan_id IS NOT NULL)::integer +
    (sale_type IS NOT NULL)::integer +
    (group_type IS NOT NULL)::integer
  ) STORED,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_sale_type_not_blank CHECK (sale_type IS NULL OR btrim(sale_type) <> ''),
  CONSTRAINT commission_rules_group_type_check CHECK (group_type IS NULL OR group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_rules_calc_mode_check CHECK (calc_mode IN ('percent', 'fixed')),
  CONSTRAINT commission_rules_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_rules_fixed_amount_nonnegative CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
  CONSTRAINT commission_rules_calc_values_check CHECK (
    (calc_mode = 'percent' AND percent IS NOT NULL AND fixed_amount IS NULL)
    OR (calc_mode = 'fixed' AND fixed_amount IS NOT NULL AND percent IS NULL)
  ),
  CONSTRAINT commission_rules_base_check CHECK (base IN ('plan_price', 'sale_total_amount', 'per_adherent')),
  CONSTRAINT commission_rules_valid_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT commission_rules_dimensions_valid_from_key UNIQUE NULLS NOT DISTINCT
    (company_id, salesperson_id, promoter_type_id, plan_id, sale_type, group_type, valid_from)
);

CREATE TABLE IF NOT EXISTS public.commission_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  accrual_event text NOT NULL DEFAULT 'venta_completada',
  liquidation_prefix text NOT NULL DEFAULT 'LIQ-',
  next_liquidation_number bigint NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_settings_accrual_event_check CHECK (accrual_event IN ('firma_completa', 'venta_completada')),
  CONSTRAINT commission_settings_prefix_not_blank CHECK (btrim(liquidation_prefix) <> ''),
  CONSTRAINT commission_settings_next_number_positive CHECK (next_liquidation_number > 0)
);

CREATE TABLE IF NOT EXISTS public.commission_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  liquidation_number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'borrador',
  concept text NOT NULL DEFAULT 'COMISION VENTA PRE-PAGA',
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  salesperson_name text NOT NULL,
  salesperson_email text,
  promoter_type_id uuid NOT NULL REFERENCES public.commission_promoter_types(id) ON DELETE RESTRICT,
  promoter_type_code text NOT NULL,
  promoter_type_name text NOT NULL,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency_code varchar(3) NOT NULL DEFAULT 'PYG',
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  notes text,
  annulled_at timestamptz,
  annulled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  annulment_reason text,
  CONSTRAINT commission_periods_dates_check CHECK (period_end >= period_start),
  CONSTRAINT commission_periods_status_check CHECK (status IN ('borrador', 'cerrada', 'pagada', 'anulada')),
  CONSTRAINT commission_periods_concept_not_blank CHECK (btrim(concept) <> ''),
  CONSTRAINT commission_periods_number_not_blank CHECK (btrim(liquidation_number) <> ''),
  CONSTRAINT commission_periods_total_nonnegative CHECK (total_amount >= 0),
  CONSTRAINT commission_periods_company_number_key UNIQUE (company_id, liquidation_number)
);

CREATE TABLE IF NOT EXISTS public.commission_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.commission_periods(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  salesperson_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  item_number integer NOT NULL,
  group_type text,
  sale_date date NOT NULL,
  client_display_id text NOT NULL,
  client_sequence integer,
  client_name text NOT NULL,
  plan_name text NOT NULL,
  percent numeric(5,2),
  base_amount numeric(14,2) NOT NULL,
  commission_amount numeric(14,2) NOT NULL,
  concept text NOT NULL DEFAULT 'COMISION',
  rule_id uuid NOT NULL REFERENCES public.commission_rules(id) ON DELETE RESTRICT,
  rule_snapshot jsonb NOT NULL,
  is_settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_items_item_positive CHECK (item_number > 0),
  CONSTRAINT commission_items_group_type_check CHECK (group_type IS NULL OR group_type IN ('INDIVIDUAL', 'GRUPAL')),
  CONSTRAINT commission_items_sequence_positive CHECK (client_sequence IS NULL OR client_sequence > 0),
  CONSTRAINT commission_items_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_items_amounts_nonnegative CHECK (base_amount >= 0 AND commission_amount >= 0),
  CONSTRAINT commission_items_rule_snapshot_object CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  CONSTRAINT commission_items_period_sale_key UNIQUE (period_id, sale_id),
  CONSTRAINT commission_items_period_item_key UNIQUE (period_id, item_number)
);

CREATE INDEX IF NOT EXISTS commission_salespeople_salesperson_idx ON public.commission_salespeople (salesperson_id);
CREATE INDEX IF NOT EXISTS commission_salespeople_promoter_type_idx ON public.commission_salespeople (promoter_type_id);
CREATE INDEX IF NOT EXISTS commission_plan_settings_plan_idx ON public.commission_plan_settings (plan_id);
CREATE INDEX IF NOT EXISTS commission_rules_resolution_idx ON public.commission_rules (company_id, is_active, valid_from, valid_to, priority DESC, specificity DESC);
CREATE INDEX IF NOT EXISTS commission_rules_salesperson_idx ON public.commission_rules (salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_promoter_type_idx ON public.commission_rules (promoter_type_id) WHERE promoter_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_plan_idx ON public.commission_rules (plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_created_by_idx ON public.commission_rules (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_company_dates_idx ON public.commission_periods (company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS commission_periods_salesperson_status_idx ON public.commission_periods (salesperson_id, status);
CREATE INDEX IF NOT EXISTS commission_periods_promoter_type_idx ON public.commission_periods (promoter_type_id);
CREATE INDEX IF NOT EXISTS commission_items_period_idx ON public.commission_items (period_id);
CREATE INDEX IF NOT EXISTS commission_items_salesperson_idx ON public.commission_items (salesperson_id, is_settled);
CREATE INDEX IF NOT EXISTS commission_items_company_idx ON public.commission_items (company_id);
CREATE INDEX IF NOT EXISTS commission_items_rule_idx ON public.commission_items (rule_id);
CREATE INDEX IF NOT EXISTS commission_items_sale_idx ON public.commission_items (sale_id);
CREATE INDEX IF NOT EXISTS commission_periods_created_by_idx ON public.commission_periods (created_by);
CREATE INDEX IF NOT EXISTS commission_periods_closed_by_idx ON public.commission_periods (closed_by) WHERE closed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_paid_by_idx ON public.commission_periods (paid_by) WHERE paid_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_periods_annulled_by_idx ON public.commission_periods (annulled_by) WHERE annulled_by IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_items_one_settlement_per_sale_idx ON public.commission_items (sale_id) WHERE is_settled;
$pase_02$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 202608040002_commission_02_integrity.sql
  -- ##########################################################################
  v_paso := '202608040002_commission_02_integrity.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_03$
-- Commission module integrity, cross-company isolation and accounting guards.

CREATE OR REPLACE FUNCTION public.commission_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_validate_configuration_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_salespeople' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
    SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission promoter type must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_plan_settings' THEN
    SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission plan must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_rules' THEN
    IF NEW.salesperson_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule salesperson must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.promoter_type_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule promoter type must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.plan_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule plan must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_validate_accounting_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_salesperson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_periods' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
    SELECT company_id INTO v_company_id FROM public.commission_promoter_types WHERE id = NEW.promoter_type_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period promoter type must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.commission_periods WHERE id = NEW.period_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its period company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.sales WHERE id = NEW.sale_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its sale company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id INTO v_company_id FROM public.commission_rules WHERE id = NEW.rule_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission item rule must belong to the same company' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_require_rpc_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.commission_rpc_mutation', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION '% may only be mutated through commission RPCs', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'commission_items' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'is_settled') IS DISTINCT FROM (to_jsonb(OLD) - 'is_settled') THEN
    RAISE EXCEPTION 'commission item snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commission_promoter_types_touch_updated_at ON public.commission_promoter_types;
CREATE TRIGGER commission_promoter_types_touch_updated_at BEFORE UPDATE ON public.commission_promoter_types
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_salespeople_touch_updated_at ON public.commission_salespeople;
CREATE TRIGGER commission_salespeople_touch_updated_at BEFORE UPDATE ON public.commission_salespeople
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_plan_settings_touch_updated_at ON public.commission_plan_settings;
CREATE TRIGGER commission_plan_settings_touch_updated_at BEFORE UPDATE ON public.commission_plan_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_rules_touch_updated_at ON public.commission_rules;
CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();
DROP TRIGGER IF EXISTS commission_settings_touch_updated_at ON public.commission_settings;
CREATE TRIGGER commission_settings_touch_updated_at BEFORE UPDATE ON public.commission_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();

DROP TRIGGER IF EXISTS commission_salespeople_validate_company ON public.commission_salespeople;
CREATE TRIGGER commission_salespeople_validate_company BEFORE INSERT OR UPDATE ON public.commission_salespeople
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_plan_settings_validate_company ON public.commission_plan_settings;
CREATE TRIGGER commission_plan_settings_validate_company BEFORE INSERT OR UPDATE ON public.commission_plan_settings
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_rules_validate_company ON public.commission_rules;
CREATE TRIGGER commission_rules_validate_company BEFORE INSERT OR UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_configuration_company();
DROP TRIGGER IF EXISTS commission_periods_validate_company ON public.commission_periods;
CREATE TRIGGER commission_periods_validate_company BEFORE INSERT OR UPDATE ON public.commission_periods
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_accounting_company();
DROP TRIGGER IF EXISTS commission_items_validate_company ON public.commission_items;
CREATE TRIGGER commission_items_validate_company BEFORE INSERT OR UPDATE ON public.commission_items
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_accounting_company();

DROP TRIGGER IF EXISTS commission_periods_rpc_only ON public.commission_periods;
CREATE TRIGGER commission_periods_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.commission_periods
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();
DROP TRIGGER IF EXISTS commission_items_rpc_only ON public.commission_items;
CREATE TRIGGER commission_items_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.commission_items
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();

REVOKE ALL ON FUNCTION public.commission_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_validate_configuration_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_validate_accounting_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_require_rpc_mutation() FROM PUBLIC;
$pase_03$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 202608040003_commission_03_rpcs.sql
  -- ##########################################################################
  v_paso := '202608040003_commission_03_rpcs.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_04$
-- Commission RPCs. All authorization and company boundaries are checked internally.

CREATE OR REPLACE FUNCTION public.commission_authorize_company(p_company_id uuid, p_write boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_user_id, 'super_admin'::public.app_role) THEN RETURN; END IF;
  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'company access denied' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_user_id, 'admin'::public.app_role)
     OR public.has_role(v_user_id, 'financiero'::public.app_role) THEN RETURN; END IF;
  IF NOT p_write AND (
    public.has_role(v_user_id, 'supervisor'::public.app_role)
    OR public.has_role(v_user_id, 'auditor'::public.app_role)
  ) THEN RETURN; END IF;
  RAISE EXCEPTION 'commission permission denied' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_promoter_type_id uuid;
  v_base numeric(14,2);
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  -- "Sec" has no confirmed business source yet. Preserve it as NULL instead of
  -- inventing a family-member or installment meaning.
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.promoter_type_id INTO v_promoter_type_id
  FROM public.commission_salespeople cs
  JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.is_active
  WHERE cs.company_id = v_sale.company_id AND cs.salesperson_id = v_sale.salesperson_id AND cs.is_active;
  IF v_promoter_type_id IS NULL THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.promoter_type_id IS NULL OR r.promoter_type_id = v_promoter_type_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.promoter_type_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  IF v_rule.id IS NULL THEN error_code := 'no_rule'; RETURN NEXT; RETURN; END IF;
  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, 2);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, 2)
    ELSE v_rule.fixed_amount
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_resolve_rule(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, rule_id uuid, calc_mode text, percent numeric, base_type text,
  base_amount numeric, commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company_id uuid;
BEGIN
  SELECT s.company_id INTO v_company_id FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_company_id, false);
  RETURN QUERY SELECT c.sale_id, c.rule_id, c.calc_mode, c.percent, c.base_type,
                      c.base_amount, c.commission_amount, c.error_code
               FROM public.commission_calculate_sale(p_sale_id) c;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_preview(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid, calc_mode text,
  percent numeric, base_type text, base_amount numeric, commission_amount numeric,
  error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_accrual_event text;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  SELECT st.accrual_event INTO v_accrual_event FROM public.commission_settings st
    WHERE st.company_id = p_company_id AND st.is_enabled;
  IF v_accrual_event IS NULL THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_salespeople cs WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active) THEN
    RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY
  SELECT c.sale_id, c.sale_date, c.client_display_id, c.client_sequence, c.client_name,
         c.plan_name, c.group_type, c.rule_id, c.calc_mode, c.percent, c.base_type,
         c.base_amount, c.commission_amount, c.error_code
  FROM public.sales s
  CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c
  WHERE s.company_id = p_company_id AND s.salesperson_id = p_salesperson_id
    AND s.sale_date BETWEEN p_from AND p_to
    AND ((v_accrual_event = 'venta_completada' AND s.status::text = 'completado')
      OR (v_accrual_event = 'firma_completa' AND s.signature_completed_at IS NOT NULL))
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_items ci
      JOIN public.commission_periods cp ON cp.id = ci.period_id
      WHERE ci.sale_id = s.id AND cp.status <> 'anulada'
    )
  ORDER BY s.sale_date, s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE; v_promoter public.commission_promoter_types%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  SELECT pt.* INTO v_promoter FROM public.commission_salespeople cs
    JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active AND pt.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, promoter_type_id, promoter_type_code,
    promoter_type_name, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_promoter.id, v_promoter.code, v_promoter.name, v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      jsonb_build_object('rule_id', r.id, 'calc_mode', r.calc_mode, 'percent', r.percent,
        'fixed_amount', r.fixed_amount, 'base', r.base, 'priority', r.priority,
        'specificity', r.specificity, 'valid_from', r.valid_from, 'valid_to', r.valid_to)
    FROM preview pv
    JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_close_period(p_period_id uuid)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods can be closed' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_items i WHERE i.period_id = p_period_id) THEN RAISE EXCEPTION 'empty period cannot be closed' USING ERRCODE = '23514'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_items SET is_settled = true WHERE period_id = p_period_id;
  UPDATE public.commission_periods p SET status = 'cerrada', closed_at = now(), closed_by = v_user_id,
    total_amount = (SELECT COALESCE(sum(i.commission_amount), 0) FROM public.commission_items i WHERE i.period_id = p_period_id)
    WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_annul_period(p_period_id uuid, p_reason text)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status = 'anulada' THEN RAISE EXCEPTION 'period is already annulled' USING ERRCODE = '55000'; END IF;
  IF v_period.status = 'pagada' THEN RAISE EXCEPTION 'paid periods require an explicit accounting reversal' USING ERRCODE = '55000'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'annulment reason is required' USING ERRCODE = '23514'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_items SET is_settled = false WHERE period_id = p_period_id AND is_settled;
  UPDATE public.commission_periods p SET status = 'anulada', annulled_at = now(), annulled_by = v_user_id,
    annulment_reason = btrim(p_reason) WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_pay_period(p_period_id uuid)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_period public.commission_periods%ROWTYPE; v_user_id uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'cerrada' THEN RAISE EXCEPTION 'only closed periods can be marked paid' USING ERRCODE = '55000'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  UPDATE public.commission_periods p
  SET status = 'pagada', paid_at = now(), paid_by = v_user_id
  WHERE p.id = p_period_id RETURNING * INTO v_period;
  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean,
  promoter_type_id uuid, promoter_type_code text, promoter_type_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT p.id, btrim(concat_ws(' ', p.first_name, p.last_name)), p.email,
    COALESCE(cs.is_active, false), pt.id, pt.code, pt.name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  LEFT JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.company_id = cs.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_authorize_company(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_resolve_rule(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_close_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_annul_period(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_pay_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM PUBLIC;
$pase_04$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 202608040004_commission_04_rls_grants.sql
  -- ##########################################################################
  v_paso := '202608040004_commission_04_rls_grants.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_05$
-- Commission RLS and explicit grants. Anonymous users receive no access.

CREATE OR REPLACE FUNCTION public.commission_can_read_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.get_user_company_id((SELECT auth.uid())) = p_company_id
      AND (
        public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'financiero'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'supervisor'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'auditor'::public.app_role)
      )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.commission_can_write_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (
      public.get_user_company_id((SELECT auth.uid())) = p_company_id
      AND (
        public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'financiero'::public.app_role)
      )
    )
  )
$$;

ALTER TABLE public.commission_promoter_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_salespeople ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_plan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_promoter_types_read ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_read ON public.commission_promoter_types FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_promoter_types_write ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_write ON public.commission_promoter_types FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_salespeople_read ON public.commission_salespeople;
CREATE POLICY commission_salespeople_read ON public.commission_salespeople FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id) OR salesperson_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS commission_salespeople_write ON public.commission_salespeople;
CREATE POLICY commission_salespeople_write ON public.commission_salespeople FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_plan_settings_read ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_read ON public.commission_plan_settings FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_plan_settings_write ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_write ON public.commission_plan_settings FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_rules_read ON public.commission_rules;
CREATE POLICY commission_rules_read ON public.commission_rules FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
CREATE POLICY commission_rules_write ON public.commission_rules FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_settings_read ON public.commission_settings;
CREATE POLICY commission_settings_read ON public.commission_settings FOR SELECT TO authenticated
USING (
  public.commission_can_read_company(company_id)
  OR (
    public.get_user_company_id((SELECT auth.uid())) = company_id
    AND public.has_role((SELECT auth.uid()), 'vendedor'::public.app_role)
  )
);
DROP POLICY IF EXISTS commission_settings_write ON public.commission_settings;
CREATE POLICY commission_settings_write ON public.commission_settings FOR ALL TO authenticated
USING (public.commission_can_write_company(company_id)) WITH CHECK (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_periods_staff_read ON public.commission_periods;
CREATE POLICY commission_periods_staff_read ON public.commission_periods FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_periods_salesperson_read ON public.commission_periods;
CREATE POLICY commission_periods_salesperson_read ON public.commission_periods FOR SELECT TO authenticated
USING (salesperson_id = (SELECT auth.uid()) AND status IN ('cerrada', 'pagada'));

DROP POLICY IF EXISTS commission_items_staff_read ON public.commission_items;
CREATE POLICY commission_items_staff_read ON public.commission_items FOR SELECT TO authenticated
USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_items_salesperson_read ON public.commission_items;
CREATE POLICY commission_items_salesperson_read ON public.commission_items FOR SELECT TO authenticated
USING (
  salesperson_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.commission_periods p
    WHERE p.id = period_id AND p.status IN ('cerrada', 'pagada')
  )
);

REVOKE ALL ON TABLE public.commission_promoter_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_salespeople FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_plan_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_periods FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_items FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_promoter_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_salespeople TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_plan_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_settings TO authenticated;
GRANT SELECT ON TABLE public.commission_periods TO authenticated;
GRANT SELECT ON TABLE public.commission_items TO authenticated;

REVOKE ALL ON FUNCTION public.commission_can_read_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_can_write_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_can_read_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_can_write_company(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.commission_resolve_rule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_preview(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_close_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_annul_period(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_pay_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_list_salespeople(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.commission_resolve_rule(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.commission_close_period(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_annul_period(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.commission_pay_period(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM anon;
$pase_05$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804175027_commission_security_hardening.sql
  -- ##########################################################################
  v_paso := '20260804175027_commission_security_hardening.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_06$
-- Remove Data API execution from internal SECURITY DEFINER helpers.
-- Supabase projects may have explicit default EXECUTE grants for API roles, so
-- revoking only from PUBLIC is insufficient.

REVOKE ALL ON FUNCTION public.commission_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_validate_configuration_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_validate_accounting_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_require_rpc_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_authorize_company(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;
$pase_06$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804175810_commission_rls_policy_consolidation.sql
  -- ##########################################################################
  v_paso := '20260804175810_commission_rls_policy_consolidation.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_07$
-- Preserve the access model while avoiding overlapping permissive policies.

DROP POLICY IF EXISTS commission_promoter_types_write ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_insert ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_update ON public.commission_promoter_types;
DROP POLICY IF EXISTS commission_promoter_types_delete ON public.commission_promoter_types;
CREATE POLICY commission_promoter_types_insert ON public.commission_promoter_types
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_promoter_types_update ON public.commission_promoter_types
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_promoter_types_delete ON public.commission_promoter_types
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_salespeople_write ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_insert ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_update ON public.commission_salespeople;
DROP POLICY IF EXISTS commission_salespeople_delete ON public.commission_salespeople;
CREATE POLICY commission_salespeople_insert ON public.commission_salespeople
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_salespeople_update ON public.commission_salespeople
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_salespeople_delete ON public.commission_salespeople
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_plan_settings_write ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_insert ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_update ON public.commission_plan_settings;
DROP POLICY IF EXISTS commission_plan_settings_delete ON public.commission_plan_settings;
CREATE POLICY commission_plan_settings_insert ON public.commission_plan_settings
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_plan_settings_update ON public.commission_plan_settings
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_plan_settings_delete ON public.commission_plan_settings
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_rules_write ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_insert ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_update ON public.commission_rules;
DROP POLICY IF EXISTS commission_rules_delete ON public.commission_rules;
CREATE POLICY commission_rules_insert ON public.commission_rules
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_rules_update ON public.commission_rules
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_rules_delete ON public.commission_rules
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_settings_write ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_insert ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_update ON public.commission_settings;
DROP POLICY IF EXISTS commission_settings_delete ON public.commission_settings;
CREATE POLICY commission_settings_insert ON public.commission_settings
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_settings_update ON public.commission_settings
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
CREATE POLICY commission_settings_delete ON public.commission_settings
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

DROP POLICY IF EXISTS commission_periods_staff_read ON public.commission_periods;
DROP POLICY IF EXISTS commission_periods_salesperson_read ON public.commission_periods;
DROP POLICY IF EXISTS commission_periods_read ON public.commission_periods;
CREATE POLICY commission_periods_read ON public.commission_periods
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR (salesperson_id = (SELECT auth.uid()) AND status IN ('cerrada', 'pagada'))
);

DROP POLICY IF EXISTS commission_items_staff_read ON public.commission_items;
DROP POLICY IF EXISTS commission_items_salesperson_read ON public.commission_items;
DROP POLICY IF EXISTS commission_items_read ON public.commission_items;
CREATE POLICY commission_items_read ON public.commission_items
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR (
    salesperson_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.commission_periods p
      WHERE p.id = period_id AND p.status IN ('cerrada', 'pagada')
    )
  )
);
$pase_07$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804190000_commission_fix_list_salespeople_email_cast.sql
  -- ##########################################################################
  v_paso := '20260804190000_commission_fix_list_salespeople_email_cast.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_08$
-- Fix: commission_list_salespeople devolvía HTTP 400 en el frontend.
--
-- Causa: la función declara `email text` en su RETURNS TABLE, pero
-- `public.profiles.email` es `character varying`. En PL/pgSQL, RETURN QUERY
-- exige coincidencia exacta de tipos y lanza:
--
--   ERROR: structure of query does not match function result type
--   DETAIL: Returned type character varying does not match expected type
--           text in column 3.
--
-- SQLSTATE 42804, que PostgREST traduce a HTTP 400. Por eso el selector de
-- "Vendedor" en Comisiones > Nueva liquidación quedaba vacío y la consola se
-- llenaba de 400 sobre /rpc/commission_list_salespeople.
--
-- Solución: castear explícitamente a ::text las columnas que provienen de
-- tablas legacy con varchar. Sólo cambia el cast; la lógica, los permisos y
-- la firma de la función quedan idénticos.
--
-- NOTA: se mantiene el JOIN por `ur.user_id = p.id` tal como estaba, para no
-- alterar la semántica en un módulo contable sin decisión explícita. Ver el
-- riesgo documentado en docs/PLAN-COMISIONES.md sobre profiles.id vs
-- profiles.user_id.

CREATE OR REPLACE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean,
  promoter_type_id uuid, promoter_type_code text, promoter_type_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT
    p.id,
    btrim(concat_ws(' ', p.first_name, p.last_name))::text,
    p.email::text,
    COALESCE(cs.is_active, false),
    pt.id,
    pt.code::text,
    pt.name::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  LEFT JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.company_id = cs.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

-- Los permisos no se recrean: CREATE OR REPLACE conserva los GRANT/REVOKE
-- existentes (REVOKE de PUBLIC/anon, GRANT EXECUTE a authenticated).
$pase_08$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804200000_commission_currency_rounding.sql
  -- ##########################################################################
  v_paso := '20260804200000_commission_currency_rounding.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_09$
-- Fix: los importes se calculaban con 2 decimales aunque el guarani es entero.
--
-- Problema: commission_calculate_sale declaraba `v_base numeric(14,2)` y
-- redondeaba a 2 decimales. El frontend en cambio ya formatea PYG con 0
-- decimales (formatCommissionCurrency en src/lib/commissionCurrency.ts).
-- Resultado: los items IMPRESOS no suman el total IMPRESO, porque el total es
-- la suma de valores con centimos y cada linea se muestra redondeada. En una
-- liquidacion eso es un descuadre visible contra el reporte legado, que maneja
-- enteros (43.364 / total 4.164.827).
--
-- Solucion: redondear al numero de decimales de la moneda de la empresa,
-- tomado de company_currency_settings.decimal_places, con DEFAULT 0 (guaranies)
-- cuando no hay fila configurada — hoy la tabla esta vacia. Queda parametrizable
-- para una empresa que opere en otra moneda.
--
-- v_base pasa de numeric(14,2) a numeric para no redondear antes de tiempo:
-- el redondeo ocurre una sola vez, al final, sobre el valor exacto.

CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_promoter_type_id uuid;
  v_base numeric;
  v_decimals integer;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  -- Decimales de la moneda de la empresa. Sin fila configurada => 0 (PYG).
  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  -- "Sec" has no confirmed business source yet. Preserve it as NULL instead of
  -- inventing a family-member or installment meaning.
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.promoter_type_id INTO v_promoter_type_id
  FROM public.commission_salespeople cs
  JOIN public.commission_promoter_types pt ON pt.id = cs.promoter_type_id AND pt.is_active
  WHERE cs.company_id = v_sale.company_id AND cs.salesperson_id = v_sale.salesperson_id AND cs.is_active;
  IF v_promoter_type_id IS NULL THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.promoter_type_id IS NULL OR r.promoter_type_id = v_promoter_type_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.promoter_type_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  IF v_rule.id IS NULL THEN error_code := 'no_rule'; RETURN NEXT; RETURN; END IF;
  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$$;
$pase_09$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804210000_commission_remove_promoter_types.sql
  -- ##########################################################################
  v_paso := '20260804210000_commission_remove_promoter_types.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_10$
-- Elimina el concepto de "tipo de promotor" del módulo de comisiones.
--
-- Decisión de negocio: en SAMAP el promotor ES el vendedor. La categoría de
-- promotor venía del reporte legado ("Tip Prom 86") y no representa nada en la
-- operación real, pero estaba impuesta como obligatoria: commission_salespeople
-- .promoter_type_id era NOT NULL, así que no se podía habilitar un vendedor sin
-- inventarle una categoría — y ni siquiera existía pantalla para crearla.
--
-- Qué se elimina:
--   - tabla  commission_promoter_types
--   - columna commission_salespeople.promoter_type_id  (era NOT NULL)
--   - columna commission_rules.promoter_type_id        (era dimensión de regla)
--   - columnas commission_periods.promoter_type_id / _code / _name (snapshot)
--
-- Qué NO cambia: habilitar un vendedor sigue siendo una fila en
-- commission_salespeople con is_active = true. Sólo desaparece la categoría.
--
-- La matriz de reglas pierde una dimensión y queda en cuatro: vendedor, plan,
-- tipo de venta y tipo de grupo. `specificity` se recalcula en consecuencia.
--
-- Seguro de aplicar: el módulo todavía no liquidó nada. Si hubiera períodos
-- cerrados, este script perdería el snapshot del promotor — por eso se aplica
-- ahora y no después.

-- 1) Índices que dependen de las columnas a eliminar.
DROP INDEX IF EXISTS public.commission_salespeople_promoter_type_idx;
DROP INDEX IF EXISTS public.commission_rules_promoter_type_idx;
DROP INDEX IF EXISTS public.commission_periods_promoter_type_idx;

-- 2) commission_rules: la columna participa de una constraint UNIQUE y de una
--    columna generada, así que hay que desarmarlas y rehacerlas.
ALTER TABLE public.commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_dimensions_valid_from_key;
ALTER TABLE public.commission_rules DROP COLUMN IF EXISTS specificity;
ALTER TABLE public.commission_rules DROP COLUMN IF EXISTS promoter_type_id;

ALTER TABLE public.commission_rules
  ADD COLUMN specificity smallint GENERATED ALWAYS AS (
    (salesperson_id IS NOT NULL)::integer +
    (plan_id IS NOT NULL)::integer +
    (sale_type IS NOT NULL)::integer +
    (group_type IS NOT NULL)::integer
  ) STORED;

ALTER TABLE public.commission_rules
  ADD CONSTRAINT commission_rules_dimensions_valid_from_key UNIQUE NULLS NOT DISTINCT
    (company_id, salesperson_id, plan_id, sale_type, group_type, valid_from);

-- 3) commission_salespeople y commission_periods.
ALTER TABLE public.commission_salespeople DROP COLUMN IF EXISTS promoter_type_id;
ALTER TABLE public.commission_periods DROP COLUMN IF EXISTS promoter_type_id;
ALTER TABLE public.commission_periods DROP COLUMN IF EXISTS promoter_type_code;
ALTER TABLE public.commission_periods DROP COLUMN IF EXISTS promoter_type_name;

-- 4) Triggers de integridad: se quitan los chequeos de empresa del promotor.
CREATE OR REPLACE FUNCTION public.commission_validate_configuration_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_salespeople' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_plan_settings' THEN
    SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission plan must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'commission_rules' THEN
    IF NEW.salesperson_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule salesperson must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.plan_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.plans WHERE id = NEW.plan_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission rule plan must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_validate_accounting_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_salesperson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_periods' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.commission_periods WHERE id = NEW.period_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its period company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.sales WHERE id = NEW.sale_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its sale company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id INTO v_company_id FROM public.commission_rules WHERE id = NEW.rule_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission item rule must belong to the same company' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5) commission_calculate_sale: el vendedor se valida por existencia de una fila
--    activa en commission_salespeople, sin pasar por el tipo de promotor.
--    Mantiene el redondeo por decimales de moneda de la migración anterior.
CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_base numeric;
  v_decimals integer;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = v_sale.company_id
      AND cs.salesperson_id = v_sale.salesperson_id
      AND cs.is_active
  ) THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  IF v_rule.id IS NULL THEN error_code := 'no_rule'; RETURN NEXT; RETURN; END IF;
  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$$;

-- 6) commission_list_salespeople: cambia el tipo de retorno, así que hay que
--    borrarla y recrearla (CREATE OR REPLACE no permite cambiar RETURNS TABLE).
--    El DROP se lleva los GRANT, por eso se re-otorgan al final.
DROP FUNCTION IF EXISTS public.commission_list_salespeople(uuid);

CREATE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT
    p.id,
    btrim(concat_ws(' ', p.first_name, p.last_name))::text,
    p.email::text,
    COALESCE(cs.is_active, false)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_list_salespeople(uuid) TO authenticated;

-- 7) commission_generate_period: deja de snapshotear el promotor y valida al
--    vendedor sólo por commission_salespeople.
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active
  ) THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      jsonb_build_object('rule_id', r.id, 'calc_mode', r.calc_mode, 'percent', r.percent,
        'fixed_amount', r.fixed_amount, 'base', r.base, 'priority', r.priority,
        'specificity', r.specificity, 'valid_from', r.valid_from, 'valid_to', r.valid_to)
    FROM preview pv
    JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$$;

-- 8) Finalmente, la tabla. Ya no queda ninguna referencia.
DROP TABLE IF EXISTS public.commission_promoter_types;
$pase_10$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260804220000_commission_salesperson_default_percent.sql
  -- ##########################################################################
  v_paso := '20260804220000_commission_salesperson_default_percent.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_11$
-- Porcentaje por defecto por vendedor, como respaldo cuando ninguna regla aplica.
--
-- Pedido: "en caso de no tener una regla asignada, darle un % configurable al
-- vendedor". Hasta ahora la única salida era crear una regla comodín (plan
-- «Todos»), lo que obliga a mantener reglas para cubrir huecos.
--
-- Comportamiento: la REGLA SIEMPRE MANDA. El porcentaje por defecto se usa
-- únicamente cuando el motor no encontró ninguna regla aplicable para esa venta.
-- Si el vendedor no tiene porcentaje por defecto, se sigue devolviendo 'no_rule'
-- y la liquidación sigue bloqueada: nunca se asume 0% en silencio.
--
-- Trazabilidad: el ítem liquidado guarda rule_id = NULL y un rule_snapshot con
-- source = 'salesperson_default', de modo que en una auditoría se distingue lo
-- calculado por regla de lo calculado por defecto.

-- 1) Configuración en el vendedor.
ALTER TABLE public.commission_salespeople
  ADD COLUMN IF NOT EXISTS default_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS default_base text NOT NULL DEFAULT 'sale_total_amount';

ALTER TABLE public.commission_salespeople
  DROP CONSTRAINT IF EXISTS commission_salespeople_default_percent_range;
ALTER TABLE public.commission_salespeople
  ADD CONSTRAINT commission_salespeople_default_percent_range
  CHECK (default_percent IS NULL OR default_percent BETWEEN 0 AND 100);

ALTER TABLE public.commission_salespeople
  DROP CONSTRAINT IF EXISTS commission_salespeople_default_base_check;
ALTER TABLE public.commission_salespeople
  ADD CONSTRAINT commission_salespeople_default_base_check
  CHECK (default_base IN ('plan_price', 'sale_total_amount'));

-- 2) Un ítem calculado por defecto no tiene regla, así que rule_id deja de ser
--    obligatorio. La FK se mantiene: si hay regla, tiene que existir.
ALTER TABLE public.commission_items ALTER COLUMN rule_id DROP NOT NULL;

-- 3) El trigger contable sólo valida la empresa de la regla cuando hay regla.
CREATE OR REPLACE FUNCTION public.commission_validate_accounting_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_salesperson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'commission_periods' THEN
    SELECT company_id INTO v_company_id FROM public.profiles WHERE id = NEW.salesperson_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'commission period salesperson must belong to the same company' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.commission_periods WHERE id = NEW.period_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its period company and salesperson' USING ERRCODE = '23514';
    END IF;
    SELECT company_id, salesperson_id INTO v_company_id, v_salesperson_id
      FROM public.sales WHERE id = NEW.sale_id;
    IF v_company_id IS DISTINCT FROM NEW.company_id OR v_salesperson_id IS DISTINCT FROM NEW.salesperson_id THEN
      RAISE EXCEPTION 'commission item must match its sale company and salesperson' USING ERRCODE = '23514';
    END IF;
    IF NEW.rule_id IS NOT NULL THEN
      SELECT company_id INTO v_company_id FROM public.commission_rules WHERE id = NEW.rule_id;
      IF v_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'commission item rule must belong to the same company' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3.b) El listado de vendedores expone la nueva configuración. Cambia el tipo de
--      retorno, así que va con DROP + CREATE y re-otorgamiento del GRANT.
DROP FUNCTION IF EXISTS public.commission_list_salespeople(uuid);

CREATE FUNCTION public.commission_list_salespeople(p_company_id uuid)
RETURNS TABLE (
  salesperson_id uuid, display_name text, email text, is_active boolean,
  default_percent numeric, default_base text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  RETURN QUERY SELECT
    p.id,
    btrim(concat_ws(' ', p.first_name, p.last_name))::text,
    p.email::text,
    COALESCE(cs.is_active, false),
    cs.default_percent::numeric,
    COALESCE(cs.default_base, 'sale_total_amount')::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'vendedor'::public.app_role
  LEFT JOIN public.commission_salespeople cs ON cs.salesperson_id = p.id AND cs.company_id = p.company_id
  WHERE p.company_id = p_company_id AND p.is_active
  ORDER BY p.first_name, p.last_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_list_salespeople(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_list_salespeople(uuid) TO authenticated;

-- 4) El cálculo: si no hay regla, se intenta el porcentaje por defecto.
CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_base numeric;
  v_decimals integer;
  v_default_percent numeric(5,2);
  v_default_base text;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.default_percent, cs.default_base
    INTO v_default_percent, v_default_base
  FROM public.commission_salespeople cs
  WHERE cs.company_id = v_sale.company_id
    AND cs.salesperson_id = v_sale.salesperson_id
    AND cs.is_active;
  IF NOT FOUND THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  -- Sin regla aplicable: respaldo con el porcentaje por defecto del vendedor.
  IF v_rule.id IS NULL THEN
    IF v_default_percent IS NULL THEN
      error_code := 'no_rule'; RETURN NEXT; RETURN;
    END IF;
    v_default_base := COALESCE(v_default_base, 'sale_total_amount');
    v_base := CASE v_default_base
      WHEN 'plan_price' THEN COALESCE(v_plan.price, 0)
      ELSE COALESCE(v_sale.total_amount, 0)
    END;
    rule_id := NULL;
    calc_mode := 'percent';
    percent := v_default_percent;
    base_type := v_default_base;
    base_amount := round(v_base, v_decimals);
    IF v_base <= 0 THEN error_code := 'invalid_base_amount'; RETURN NEXT; RETURN; END IF;
    commission_amount := round(v_base * v_default_percent / 100, v_decimals);
    error_code := NULL;
    RETURN NEXT; RETURN;
  END IF;

  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$$;

-- 5) generate_period: los ítems sin regla ya no se pierden en el JOIN, y su
--    snapshot deja constancia de que salieron del porcentaje por defecto.
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active
  ) THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      CASE WHEN r.id IS NULL THEN
        jsonb_build_object('source', 'salesperson_default', 'calc_mode', 'percent',
          'percent', pv.percent, 'base', pv.base_type)
      ELSE
        jsonb_build_object('source', 'rule', 'rule_id', r.id, 'calc_mode', r.calc_mode,
          'percent', r.percent, 'fixed_amount', r.fixed_amount, 'base', r.base,
          'priority', r.priority, 'specificity', r.specificity,
          'valid_from', r.valid_from, 'valid_to', r.valid_to)
      END
    FROM preview pv
    LEFT JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$$;
$pase_11$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20260819000003_commission_sale_type_snapshot.sql
  -- ##########################################################################
  v_paso := '20260819000003_commission_sale_type_snapshot.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_12$
-- Snapshot del TIPO DE VENTA en la liquidación de comisiones.
--
-- Contexto: `commission_rules.sale_type` ya existe como dimensión y el resolvedor
-- ya la matchea contra `sales.sale_type`. Lo que faltaba era dejar registrado en
-- la liquidación CUÁL era el tipo de la venta al momento de liquidarla.
--
-- Sin esto, auditar una liquidación obliga a ir a mirar `sales.sale_type` HOY,
-- que puede haber cambiado (o la venta puede haber mutado de estado). El ítem
-- liquidado tiene que ser autocontenido: es dato contable congelado.
--
-- Esta migración NO toca la lógica de resolución de reglas, ni el redondeo, ni
-- los `error_code`. Sólo propaga un dato más a lo largo de la cadena
-- commission_calculate_sale -> commission_preview -> commission_generate_period
-- -> commission_items.

-- ---------------------------------------------------------------------
-- 1) La columna en el ítem liquidado.
--    NULLABLE a propósito: hay filas históricas y ponerla NOT NULL las rompe.
--    El backfill del paso 5 las completa, pero la columna queda nullable para
--    no depender de que ese backfill haya corrido en todos los entornos.
-- ---------------------------------------------------------------------
ALTER TABLE public.commission_items
  ADD COLUMN IF NOT EXISTS sale_type text;

COMMENT ON COLUMN public.commission_items.sale_type IS
  'Tipo de la venta (sales.sale_type) al momento de liquidar. Snapshot inmutable de auditoría.';

-- ---------------------------------------------------------------------
-- 2) commission_calculate_sale: se agrega `sale_type` al RETURNS TABLE.
--
--    Postgres NO permite cambiar el tipo de retorno con CREATE OR REPLACE
--    (error 42P13: "cannot change return type of existing function"), así que
--    hay que DROP + CREATE. Y como commission_preview la consume con
--    CROSS JOIN LATERAL, se dropea PRIMERO commission_preview y se recrea
--    DESPUÉS, para que en ningún momento quede una versión de preview
--    apuntando a una firma vieja.
--
--    Nota: commission_resolve_rule(uuid) también llama a esta función, pero
--    selecciona columnas explícitas (c.sale_id, c.rule_id, ...), así que la
--    columna nueva no la afecta y no hace falta recrearla.
--
--    Los DROP pierden los GRANT, por eso se re-otorgan al final de cada CREATE
--    copiando exactamente los de 202608040003 / 202608040004.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.commission_preview(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS public.commission_calculate_sale(uuid);

CREATE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text, sale_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_base numeric;
  v_decimals integer;
  v_default_percent numeric(5,2);
  v_default_base text;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');
  -- Mismo COALESCE que usa el resolvedor de reglas, para que lo que se muestra
  -- y lo que se liquida sea exactamente el valor contra el que se matcheó.
  sale_type := COALESCE(v_sale.sale_type, 'venta_nueva');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.default_percent, cs.default_base
    INTO v_default_percent, v_default_base
  FROM public.commission_salespeople cs
  WHERE cs.company_id = v_sale.company_id
    AND cs.salesperson_id = v_sale.salesperson_id
    AND cs.is_active;
  IF NOT FOUND THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  -- Sin regla aplicable: respaldo con el porcentaje por defecto del vendedor.
  IF v_rule.id IS NULL THEN
    IF v_default_percent IS NULL THEN
      error_code := 'no_rule'; RETURN NEXT; RETURN;
    END IF;
    v_default_base := COALESCE(v_default_base, 'sale_total_amount');
    v_base := CASE v_default_base
      WHEN 'plan_price' THEN COALESCE(v_plan.price, 0)
      ELSE COALESCE(v_sale.total_amount, 0)
    END;
    rule_id := NULL;
    calc_mode := 'percent';
    percent := v_default_percent;
    base_type := v_default_base;
    base_amount := round(v_base, v_decimals);
    IF v_base <= 0 THEN error_code := 'invalid_base_amount'; RETURN NEXT; RETURN; END IF;
    commission_amount := round(v_base * v_default_percent / 100, v_decimals);
    error_code := NULL;
    RETURN NEXT; RETURN;
  END IF;

  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$function$;

-- Se revoca tambien de `authenticated`, no solo de PUBLIC/anon: Supabase tiene
-- ALTER DEFAULT PRIVILEGES que otorga EXECUTE a los roles de API sobre las
-- funciones NUEVAS, y el DROP del paso 2 la volvio nueva. Sin esto, cualquier
-- usuario logueado podria invocarla por la Data API con el sale_id de OTRA
-- empresa: es SECURITY DEFINER y no llama a commission_authorize_company.
-- Es la misma revocacion que hace 20260804175027_commission_security_hardening.sql
-- y que verifica supabase/tests/commission_module_test.sql.
REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) commission_preview: misma definición que en 202608040003, propagando
--    la columna nueva. Se conservan SECURITY DEFINER, search_path y los
--    GRANT/REVOKE originales (los perdió el DROP del paso 2).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.commission_preview(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid, calc_mode text,
  percent numeric, base_type text, base_amount numeric, commission_amount numeric,
  error_code text, sale_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_accrual_event text;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, false);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  SELECT st.accrual_event INTO v_accrual_event FROM public.commission_settings st
    WHERE st.company_id = p_company_id AND st.is_enabled;
  IF v_accrual_event IS NULL THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_salespeople cs WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active) THEN
    RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000';
  END IF;
  RETURN QUERY
  SELECT c.sale_id, c.sale_date, c.client_display_id, c.client_sequence, c.client_name,
         c.plan_name, c.group_type, c.rule_id, c.calc_mode, c.percent, c.base_type,
         c.base_amount, c.commission_amount, c.error_code, c.sale_type
  FROM public.sales s
  CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c
  WHERE s.company_id = p_company_id AND s.salesperson_id = p_salesperson_id
    AND s.sale_date BETWEEN p_from AND p_to
    AND ((v_accrual_event = 'venta_completada' AND s.status::text = 'completado')
      OR (v_accrual_event = 'firma_completa' AND s.signature_completed_at IS NOT NULL))
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_items ci
      JOIN public.commission_periods cp ON cp.id = ci.period_id
      WHERE ci.sale_id = s.id AND cp.status <> 'anulada'
    )
  ORDER BY s.sale_date, s.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_preview(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_preview(uuid, uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) commission_generate_period: idéntica a la de 20260804220000, salvo que
--    ahora escribe pv.sale_type en el ítem y lo agrega al rule_snapshot
--    (que es el registro inmutable de auditoría), junto a `source`.
--    El tipo de retorno no cambia (uuid), así que alcanza con CREATE OR REPLACE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active
  ) THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot, sale_type
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      CASE WHEN r.id IS NULL THEN
        jsonb_build_object('source', 'salesperson_default', 'calc_mode', 'percent',
          'percent', pv.percent, 'base', pv.base_type, 'sale_type', pv.sale_type)
      ELSE
        jsonb_build_object('source', 'rule', 'rule_id', r.id, 'calc_mode', r.calc_mode,
          'percent', r.percent, 'fixed_amount', r.fixed_amount, 'base', r.base,
          'priority', r.priority, 'specificity', r.specificity,
          'valid_from', r.valid_from, 'valid_to', r.valid_to, 'sale_type', pv.sale_type)
      END,
      pv.sale_type
    FROM preview pv
    LEFT JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Backfill de las filas históricas.
--
--    `commission_items` está protegida por el trigger
--    commission_require_rpc_mutation (202608040002), que rechaza con 42501
--    cualquier INSERT/UPDATE/DELETE que no venga de las RPC del módulo. La
--    puerta es la GUC `app.commission_rpc_mutation` = 'on' (local a la
--    transacción), así que el UPDATE va envuelto en un DO que la prende.
--
--    Ese mismo trigger además declara inmutable el snapshot en UPDATE: compara
--    to_jsonb(NEW) - 'is_settled' contra to_jsonb(OLD) - 'is_settled'. Como
--    `sale_type` es una columna NUEVA que hasta recién no existía, para las
--    filas históricas pasa de NULL a un valor y ESO dispararía la excepción de
--    inmutabilidad. Por eso el trigger se desactiva sólo durante el backfill
--    (ALTER TABLE ... DISABLE TRIGGER) y se vuelve a activar inmediatamente:
--    no se está relajando ninguna regla, se está completando el snapshot que
--    la columna nueva no podía tener.
-- ---------------------------------------------------------------------
DO $backfill$
DECLARE
  v_rows integer;
BEGIN
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  ALTER TABLE public.commission_items DISABLE TRIGGER commission_items_rpc_only;

  UPDATE public.commission_items ci
     SET sale_type = COALESCE(s.sale_type, 'venta_nueva')
    FROM public.sales s
   WHERE s.id = ci.sale_id
     AND ci.sale_type IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  ALTER TABLE public.commission_items ENABLE TRIGGER commission_items_rpc_only;
  RAISE NOTICE 'commission_items backfilleados con sale_type: %', v_rows;
END;
$backfill$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN — las 5 filas deben decir OK
-- ---------------------------------------------------------------------
SELECT 'columna commission_items.sale_type' AS chequeo,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='commission_items' AND column_name='sale_type')
       THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL
SELECT 'commission_calculate_sale devuelve sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_calculate_sale' AND n.nspname='public'
              AND 'sale_type' = ANY(p.proargnames))
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'commission_preview devuelve sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_preview' AND n.nspname='public'
              AND 'sale_type' = ANY(p.proargnames))
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'commission_generate_period graba sale_type',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='commission_generate_period' AND n.nspname='public'
              AND p.prosrc LIKE '%pv.sale_type%')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'sin ítems históricos sin sale_type',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.commission_items WHERE sale_type IS NULL)
       THEN 'OK' ELSE 'FALTA' END;
$pase_12$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- 20261007000001_commission_report_additive.sql
  -- ##########################################################################
  v_paso := '20261007000001_commission_report_additive.sql';
  v_t := clock_timestamp();
  EXECUTE replace($pase_13$
-- Comisiones: reporte de liquidacion (todo ADITIVO).
--
-- Espejo de sql/aplicar-comisiones-reporte-test.sql, que es como se aplica en
-- US test (ykducvvcjzdpoojxlsig) — el historial de migraciones de test diverge
-- del repo, ver CLAUDE.md. El cuerpo es EL MISMO, byte a byte, salvo:
--   · sin BEGIN/COMMIT (el CLI ya corre cada migracion en su transaccion);
--   · sin el INSERT en supabase_migrations (lo hace el CLI);
--   · sin el SELECT de verificacion final (el CONTROL del paso 9 ya aborta).
-- Se conservan el preflight y el CONTROL: en una base nueva
-- (`supabase db reset`) el cuerpo vivo de las 2 funciones es exactamente el de
-- 20260819000003, asi que el control pasa; si alguna vez no lo fuera, la
-- migracion aborta en vez de pisar una version desconocida.
--
-- ⚠️ El modulo de comisiones NO existe en BR producción (ejiycfqxgtrzaysgpzmx):
--    esta migracion NO debe llegar ahi por un `db push` sin --project-ref.
--    Usar los scripts commission:*:us (scripts/commission-us-guard.mjs).
--
-- Que agrega:
--   1. base 'net_of_fee_and_tax' en commission_rules.base y
--      commission_salespeople.default_base (solo se amplia el CHECK);
--   2. commission_settings.tax_divisor / .maternity_extra_amount,
--      commission_plan_settings.report_code;
--   3. commission_admin_fees + commission_admin_fee_for();
--   4. commission_calculate_sale con la rama de la base neta (copia textual +
--      inserciones);
--   5. commission_generate_period: detalle de la base neta en el rule_snapshot
--      solo para esa base ('{}' para las demas => snapshots viejos identicos);
--   6. commission_period_adjustments (solo RPC, solo en borrador);
--   7. RPCs commission_add_adjustment / _delete_adjustment /
--      _suggest_maternity_adjustments / commission_export_rows;
--   8. vista commission_period_payable (security_invoker).

-- ============================================================================
-- 0. PREFLIGHT — prerequisitos y foto del "antes"
-- ============================================================================
DO $preflight$
DECLARE
  v_falta text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_falta
  FROM unnest(ARRAY['public.commission_settings','public.commission_salespeople',
                    'public.commission_plan_settings','public.commission_rules',
                    'public.commission_periods','public.commission_items',
                    'public.sales','public.clients','public.beneficiaries',
                    'public.company_currency_settings']) AS t
  WHERE to_regclass(t) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas tablas: %. Este script es para US test con el modulo de comisiones aplicado.', v_falta;
  END IF;

  SELECT string_agg(f, ', ') INTO v_falta
  FROM unnest(ARRAY['public.commission_calculate_sale(uuid)',
                    'public.commission_preview(uuid,uuid,date,date)',
                    'public.commission_generate_period(uuid,uuid,date,date,text,text)',
                    'public.commission_require_rpc_mutation()',
                    'public.commission_touch_updated_at()',
                    'public.commission_authorize_company(uuid,boolean)',
                    'public.commission_can_read_company(uuid)',
                    'public.commission_can_write_company(uuid)']) AS f
  WHERE to_regprocedure(f) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas funciones: %.', v_falta;
  END IF;

  -- commission_calculate_sale tiene que ser la de 20260819000003 (devuelve sale_type).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.commission_calculate_sale(uuid)'::regprocedure
      AND 'sale_type' = ANY(p.proargnames)
  ) THEN
    RAISE EXCEPTION 'commission_calculate_sale no devuelve sale_type: falta aplicar 20260819000003.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'commission_items'
                   AND column_name = 'sale_type') THEN
    RAISE EXCEPTION 'commission_items.sale_type no existe: falta aplicar 20260819000003.';
  END IF;

  -- Columnas que leen commission_export_rows y commission_suggest_maternity_adjustments.
  SELECT string_agg(x.tbl || '.' || x.col, ', ') INTO v_falta
  FROM (VALUES ('sales', 'maternity_bonus'), ('sales', 'adherents_count'),
               ('sales', 'contract_number'), ('sales', 'total_amount'),
               ('clients', 'client_type'), ('beneficiaries', 'status'),
               ('beneficiaries', 'is_primary')) AS x(tbl, col)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = x.tbl
                      AND c.column_name = x.col);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estas columnas: %. Este script es para US test.', v_falta;
  END IF;
END
$preflight$;

-- Foto del "antes". Tablas en un esquema de trabajo (cr_scratch) y no TEMP: el SQL Editor no
-- mantiene la sesion entre los pasos del script y las TEMP desaparecian
-- (42P01 relation "_cr_calc_before" does not exist). Se borra al final.
DROP SCHEMA IF EXISTS cr_scratch CASCADE;
CREATE SCHEMA cr_scratch;


-- (a) Lo que calcula HOY el motor para cada venta de las empresas con modulo.
--     commission_calculate_sale es SECURITY DEFINER y no llama a
--     commission_authorize_company, asi que corre como el owner (postgres)
--     tambien desde el SQL Editor, donde auth.uid() es NULL.
CREATE TABLE cr_scratch._cr_calc_before AS
SELECT c.*
FROM public.sales s
JOIN public.commission_settings st ON st.company_id = s.company_id
CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c;

-- (b) Huella de cada liquidacion y de sus items (dato contable congelado).
CREATE TABLE cr_scratch._cr_periods_before AS
SELECT p.id, p.status, p.total_amount,
       md5(to_jsonb(p)::text) AS period_md5,
       (SELECT count(*) FROM public.commission_items i WHERE i.period_id = p.id) AS items_count,
       (SELECT sum(i.commission_amount) FROM public.commission_items i WHERE i.period_id = p.id) AS items_sum,
       (SELECT md5(string_agg(to_jsonb(i)::text, '|' ORDER BY i.item_number))
          FROM public.commission_items i WHERE i.period_id = p.id) AS items_md5
FROM public.commission_periods p;

-- (c) Huella de la configuracion (sin las columnas que agrega este script).
CREATE TABLE cr_scratch._cr_config_before AS
SELECT 'commission_settings'::text AS t,
       md5(string_agg((to_jsonb(x) - 'tax_divisor' - 'maternity_extra_amount')::text, '|' ORDER BY x.company_id)) AS h
  FROM public.commission_settings x
UNION ALL
SELECT 'commission_rules', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_rules x
UNION ALL
SELECT 'commission_salespeople', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_salespeople x
UNION ALL
SELECT 'commission_plan_settings', md5(string_agg((to_jsonb(x) - 'report_code')::text, '|' ORDER BY x.id)) FROM public.commission_plan_settings x;

-- (d) Fuente y atributos de TODAS las funciones commission_* existentes.
CREATE TABLE cr_scratch._cr_src_before AS
SELECT p.oid, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS result,
       p.prosrc, p.prosecdef, p.provolatile,
       p.proconfig::text AS proconfig, p.proacl::text AS proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'commission\_%';


-- ============================================================================
-- 1. Nueva base de calculo 'net_of_fee_and_tax' en los dos CHECK
--    (solo se AMPLIA la lista: todo valor valido hoy sigue siendo valido)
-- ============================================================================
ALTER TABLE public.commission_rules DROP CONSTRAINT IF EXISTS commission_rules_base_check;
ALTER TABLE public.commission_rules ADD CONSTRAINT commission_rules_base_check
  CHECK (base IN ('plan_price', 'sale_total_amount', 'per_adherent', 'net_of_fee_and_tax'));

ALTER TABLE public.commission_salespeople DROP CONSTRAINT IF EXISTS commission_salespeople_default_base_check;
ALTER TABLE public.commission_salespeople ADD CONSTRAINT commission_salespeople_default_base_check
  CHECK (default_base IN ('plan_price', 'sale_total_amount', 'net_of_fee_and_tax'));


-- ============================================================================
-- 2. Columnas de configuracion del reporte
-- ============================================================================
-- Los CHECK van aparte (DROP IF EXISTS + ADD) y no en linea con el ADD COLUMN,
-- para que una segunda corrida sea un no-op limpio.
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS tax_divisor numeric(6,4) NOT NULL DEFAULT 1.10,
  ADD COLUMN IF NOT EXISTS maternity_extra_amount numeric(14,2);

ALTER TABLE public.commission_settings DROP CONSTRAINT IF EXISTS commission_settings_tax_divisor_check;
ALTER TABLE public.commission_settings ADD CONSTRAINT commission_settings_tax_divisor_check
  CHECK (tax_divisor >= 1);
ALTER TABLE public.commission_settings DROP CONSTRAINT IF EXISTS commission_settings_maternity_extra_nonneg;
ALTER TABLE public.commission_settings ADD CONSTRAINT commission_settings_maternity_extra_nonneg
  CHECK (maternity_extra_amount IS NULL OR maternity_extra_amount >= 0);

COMMENT ON COLUMN public.commission_settings.tax_divisor IS
  'Divisor de IVA de la base neta (1.10 = IVA 10%). Solo lo usa la base net_of_fee_and_tax.';
COMMENT ON COLUMN public.commission_settings.maternity_extra_amount IS
  'Monto del adicional por prima de maternidad que sugiere commission_suggest_maternity_adjustments. NULL = apagado.';

ALTER TABLE public.commission_plan_settings
  ADD COLUMN IF NOT EXISTS report_code text;

ALTER TABLE public.commission_plan_settings DROP CONSTRAINT IF EXISTS commission_plan_settings_report_code_check;
ALTER TABLE public.commission_plan_settings ADD CONSTRAINT commission_plan_settings_report_code_check
  CHECK (report_code IS NULL OR (btrim(report_code) <> '' AND length(report_code) <= 20));

COMMENT ON COLUMN public.commission_plan_settings.report_code IS
  'Codigo corto del plan para la columna Plan del reporte de liquidacion. NULL = usar el nombre del plan.';


-- ============================================================================
-- 3. Gasto administrativo por tipo de venta (con vigencia)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.commission_admin_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_admin_fees_sale_type_not_blank CHECK (btrim(sale_type) <> ''),
  CONSTRAINT commission_admin_fees_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT commission_admin_fees_valid_dates_check CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT commission_admin_fees_company_type_from_key UNIQUE (company_id, sale_type, valid_from)
);

CREATE INDEX IF NOT EXISTS commission_admin_fees_created_by_idx
  ON public.commission_admin_fees (created_by) WHERE created_by IS NOT NULL;

COMMENT ON TABLE public.commission_admin_fees IS
  'Gasto administrativo que se descuenta del total de la venta en la base net_of_fee_and_tax. Sin fila vigente => error admin_fee_not_configured (nunca se asume 0).';

DROP TRIGGER IF EXISTS commission_admin_fees_touch_updated_at ON public.commission_admin_fees;
CREATE TRIGGER commission_admin_fees_touch_updated_at BEFORE UPDATE ON public.commission_admin_fees
FOR EACH ROW EXECUTE FUNCTION public.commission_touch_updated_at();

ALTER TABLE public.commission_admin_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_admin_fees_read ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_read ON public.commission_admin_fees
FOR SELECT TO authenticated USING (public.commission_can_read_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_insert ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_insert ON public.commission_admin_fees
FOR INSERT TO authenticated WITH CHECK (public.commission_can_write_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_update ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_update ON public.commission_admin_fees
FOR UPDATE TO authenticated
USING (public.commission_can_write_company(company_id))
WITH CHECK (public.commission_can_write_company(company_id));
DROP POLICY IF EXISTS commission_admin_fees_delete ON public.commission_admin_fees;
CREATE POLICY commission_admin_fees_delete ON public.commission_admin_fees
FOR DELETE TO authenticated USING (public.commission_can_write_company(company_id));

REVOKE ALL ON TABLE public.commission_admin_fees FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_admin_fees TO authenticated;

-- Helper interno: el gasto vigente para (empresa, tipo de venta, fecha).
-- NULL si no hay ninguno: el que llama decide que eso es un error.
CREATE OR REPLACE FUNCTION public.commission_admin_fee_for(p_company_id uuid, p_sale_type text, p_on date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.amount
  FROM public.commission_admin_fees f
  WHERE f.company_id = p_company_id
    AND f.sale_type = p_sale_type
    AND f.is_active
    AND p_on IS NOT NULL
    AND f.valid_from <= p_on
    AND (f.valid_to IS NULL OR f.valid_to >= p_on)
  ORDER BY f.valid_from DESC, f.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.commission_admin_fee_for(uuid, text, date) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 4. commission_calculate_sale — copia TEXTUAL de 20260819000003 (L48-175)
--    con SOLO estas inserciones (el control del paso 9 lo demuestra):
--      · DECLARE v_admin_fee / v_tax_divisor
--      · rama "sin regla": guarda de gasto + WHEN 'net_of_fee_and_tax'
--      · rama "regla":     guarda de gasto + WHEN 'net_of_fee_and_tax'
--    Misma firma y mismo retorno => CREATE OR REPLACE conserva los GRANT; igual
--    se repite el REVOKE de 20260819000003.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_calculate_sale(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid, sale_date date, client_display_id text, client_sequence integer,
  client_name text, plan_name text, group_type text, rule_id uuid,
  calc_mode text, percent numeric, base_type text, base_amount numeric,
  commission_amount numeric, error_code text, sale_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_group_type text;
  v_base numeric;
  v_decimals integer;
  v_default_percent numeric(5,2);
  v_default_base text;
  v_admin_fee numeric;
  v_tax_divisor numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_client FROM public.clients c WHERE c.id = v_sale.client_id;
  SELECT * INTO v_plan FROM public.plans p WHERE p.id = v_sale.plan_id;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_sale.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  sale_id := v_sale.id;
  sale_date := v_sale.sale_date;
  client_display_id := COALESCE(NULLIF(v_client.dni, ''), v_sale.client_id::text);
  client_sequence := NULL;
  client_name := btrim(concat_ws(' ', v_client.first_name, v_client.last_name));
  plan_name := COALESCE(v_plan.name, 'SIN PLAN');
  -- Mismo COALESCE que usa el resolvedor de reglas, para que lo que se muestra
  -- y lo que se liquida sea exactamente el valor contra el que se matcheó.
  sale_type := COALESCE(v_sale.sale_type, 'venta_nueva');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_settings st
    WHERE st.company_id = v_sale.company_id AND st.is_enabled
  ) THEN error_code := 'module_disabled'; RETURN NEXT; RETURN; END IF;

  SELECT cs.default_percent, cs.default_base
    INTO v_default_percent, v_default_base
  FROM public.commission_salespeople cs
  WHERE cs.company_id = v_sale.company_id
    AND cs.salesperson_id = v_sale.salesperson_id
    AND cs.is_active;
  IF NOT FOUND THEN error_code := 'salesperson_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT ps.group_type INTO v_group_type
  FROM public.commission_plan_settings ps
  WHERE ps.company_id = v_sale.company_id AND ps.plan_id = v_sale.plan_id AND ps.is_active;
  group_type := v_group_type;
  IF v_client.id IS NULL OR v_sale.client_id IS NULL THEN error_code := 'client_not_configured'; RETURN NEXT; RETURN; END IF;
  IF v_group_type IS NULL THEN error_code := 'plan_not_configured'; RETURN NEXT; RETURN; END IF;

  SELECT r.* INTO v_rule
  FROM public.commission_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND v_sale.sale_date IS NOT NULL
    AND r.valid_from <= v_sale.sale_date
    AND (r.valid_to IS NULL OR r.valid_to >= v_sale.sale_date)
    AND (r.salesperson_id IS NULL OR r.salesperson_id = v_sale.salesperson_id)
    AND (r.plan_id IS NULL OR r.plan_id = v_sale.plan_id)
    AND (r.sale_type IS NULL OR r.sale_type = COALESCE(v_sale.sale_type, 'venta_nueva'))
    AND (r.group_type IS NULL OR r.group_type = v_group_type)
  ORDER BY r.priority DESC,
    (r.salesperson_id IS NOT NULL) DESC,
    (r.plan_id IS NOT NULL) DESC,
    (r.sale_type IS NOT NULL) DESC,
    (r.group_type IS NOT NULL) DESC,
    r.specificity DESC, r.valid_from DESC, r.id
  LIMIT 1;

  -- Sin regla aplicable: respaldo con el porcentaje por defecto del vendedor.
  IF v_rule.id IS NULL THEN
    IF v_default_percent IS NULL THEN
      error_code := 'no_rule'; RETURN NEXT; RETURN;
    END IF;
    v_default_base := COALESCE(v_default_base, 'sale_total_amount');
    -- [reporte] Base neta: (total - gasto administrativo) / divisor de IVA.
    -- Sin gasto vigente NO se asume 0: la venta queda con error y bloquea.
    IF v_default_base = 'net_of_fee_and_tax' THEN
      v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
      SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
      IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
        calc_mode := 'percent'; percent := v_default_percent; base_type := v_default_base;
        error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
      END IF;
    END IF;
    v_base := CASE v_default_base
      WHEN 'plan_price' THEN COALESCE(v_plan.price, 0)
      WHEN 'net_of_fee_and_tax' THEN (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor
      ELSE COALESCE(v_sale.total_amount, 0)
    END;
    rule_id := NULL;
    calc_mode := 'percent';
    percent := v_default_percent;
    base_type := v_default_base;
    base_amount := round(v_base, v_decimals);
    IF v_base <= 0 THEN error_code := 'invalid_base_amount'; RETURN NEXT; RETURN; END IF;
    commission_amount := round(v_base * v_default_percent / 100, v_decimals);
    error_code := NULL;
    RETURN NEXT; RETURN;
  END IF;

  -- [reporte] Misma base neta para las reglas, con el mismo criterio.
  IF v_rule.base = 'net_of_fee_and_tax' THEN
    v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
    SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
    rule_id := v_rule.id; calc_mode := v_rule.calc_mode; percent := v_rule.percent; base_type := v_rule.base;
    IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
      error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
    END IF;
    -- Tambien en modo 'fixed': una base neta <= 0 no puede llegar a commission_items.
    IF COALESCE(v_sale.total_amount, 0) - v_admin_fee <= 0 THEN
      base_amount := round((COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor, v_decimals);
      error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  CASE v_rule.base
    WHEN 'plan_price' THEN v_base := COALESCE(v_plan.price, 0);
    WHEN 'sale_total_amount' THEN v_base := COALESCE(v_sale.total_amount, 0);
    WHEN 'net_of_fee_and_tax' THEN v_base := (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor;
    WHEN 'per_adherent' THEN v_base := NULL;
  END CASE;

  rule_id := v_rule.id;
  calc_mode := v_rule.calc_mode;
  percent := v_rule.percent;
  base_type := v_rule.base;
  IF v_rule.base = 'per_adherent' THEN
    error_code := 'per_adherent_not_defined'; RETURN NEXT; RETURN;
  END IF;
  base_amount := round(v_base, v_decimals);
  IF v_rule.calc_mode = 'percent' AND v_base <= 0 THEN
    error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
  END IF;
  commission_amount := CASE v_rule.calc_mode
    WHEN 'percent' THEN round(v_base * v_rule.percent / 100, v_decimals)
    ELSE round(v_rule.fixed_amount, v_decimals)
  END;
  error_code := NULL;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_calculate_sale(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 5. commission_generate_period — copia TEXTUAL de 20260819000003 (L243-321)
--    con UNA sola insercion: al rule_snapshot se le concatena (||) el detalle
--    de la base neta SOLO cuando base_type = 'net_of_fee_and_tax'. Para
--    cualquier otra base se concatena '{}'::jsonb, que deja el objeto identico:
--    los snapshots de siempre salen byte a byte iguales.
--    No se agregan columnas a commission_items.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_generate_period(
  p_company_id uuid, p_salesperson_id uuid, p_from date, p_to date,
  p_concept text DEFAULT 'COMISION VENTA PRE-PAGA', p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid()); v_settings public.commission_settings%ROWTYPE;
  v_salesperson public.profiles%ROWTYPE;
  v_period_id uuid; v_number text; v_currency varchar(3); v_count integer; v_errors integer; v_inserted integer;
BEGIN
  PERFORM public.commission_authorize_company(p_company_id, true);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'invalid period dates' USING ERRCODE = '22007'; END IF;
  IF btrim(COALESCE(p_concept, '')) = '' THEN RAISE EXCEPTION 'concept is required' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_settings FROM public.commission_settings st WHERE st.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.is_enabled THEN RAISE EXCEPTION 'commission module is disabled or not configured' USING ERRCODE = '55000'; END IF;
  SELECT p.* INTO v_salesperson FROM public.profiles p WHERE p.id = p_salesperson_id AND p.company_id = p_company_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'active salesperson not found in company' USING ERRCODE = '55000'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_salespeople cs
    WHERE cs.company_id = p_company_id AND cs.salesperson_id = p_salesperson_id AND cs.is_active
  ) THEN RAISE EXCEPTION 'salesperson is not enabled for commissions' USING ERRCODE = '55000'; END IF;

  v_number := v_settings.liquidation_prefix || lpad(v_settings.next_liquidation_number::text, 6, '0');
  SELECT COALESCE(ccs.currency_code, 'PYG') INTO v_currency FROM public.company_currency_settings ccs WHERE ccs.company_id = p_company_id;
  v_currency := COALESCE(v_currency, 'PYG');
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_periods (
    company_id, liquidation_number, period_start, period_end, concept, salesperson_id,
    salesperson_name, salesperson_email, currency_code, created_by, notes
  ) VALUES (
    p_company_id, v_number, p_from, p_to, p_concept, p_salesperson_id,
    btrim(concat_ws(' ', v_salesperson.first_name, v_salesperson.last_name)), v_salesperson.email,
    v_currency, v_user_id, p_notes
  ) RETURNING id INTO v_period_id;

  WITH preview AS MATERIALIZED (
    SELECT * FROM public.commission_preview(p_company_id, p_salesperson_id, p_from, p_to)
  ), inserted AS (
    INSERT INTO public.commission_items (
      period_id, company_id, salesperson_id, sale_id, item_number, group_type, sale_date,
      client_display_id, client_sequence, client_name, plan_name, percent, base_amount,
      commission_amount, concept, rule_id, rule_snapshot, sale_type
    )
    SELECT v_period_id, p_company_id, p_salesperson_id, pv.sale_id,
      row_number() OVER (ORDER BY pv.sale_date, pv.sale_id)::integer, pv.group_type, pv.sale_date,
      pv.client_display_id, pv.client_sequence, pv.client_name, pv.plan_name, pv.percent,
      pv.base_amount, pv.commission_amount, 'COMISION', pv.rule_id,
      CASE WHEN r.id IS NULL THEN
        jsonb_build_object('source', 'salesperson_default', 'calc_mode', 'percent',
          'percent', pv.percent, 'base', pv.base_type, 'sale_type', pv.sale_type)
      ELSE
        jsonb_build_object('source', 'rule', 'rule_id', r.id, 'calc_mode', r.calc_mode,
          'percent', r.percent, 'fixed_amount', r.fixed_amount, 'base', r.base,
          'priority', r.priority, 'specificity', r.specificity,
          'valid_from', r.valid_from, 'valid_to', r.valid_to, 'sale_type', pv.sale_type)
      END
      || CASE WHEN pv.base_type = 'net_of_fee_and_tax' THEN
        jsonb_build_object('admin_fee', public.commission_admin_fee_for(p_company_id, pv.sale_type, pv.sale_date),
          'tax_divisor', v_settings.tax_divisor,
          'gross_amount', (SELECT s2.total_amount FROM public.sales s2 WHERE s2.id = pv.sale_id))
      ELSE '{}'::jsonb END,
      pv.sale_type
    FROM preview pv
    LEFT JOIN public.commission_rules r ON r.id = pv.rule_id
    WHERE pv.error_code IS NULL
    RETURNING sale_id
  )
  SELECT (SELECT count(*) FROM preview),
    (SELECT count(*) FROM preview WHERE error_code IS NOT NULL),
    (SELECT count(*) FROM inserted)
  INTO v_count, v_errors, v_inserted;
  IF v_count = 0 THEN RAISE EXCEPTION 'no eligible sales for this period' USING ERRCODE = 'P0002'; END IF;
  IF v_errors > 0 THEN RAISE EXCEPTION 'preview contains % unresolved sale(s); period was not generated', v_errors USING ERRCODE = '23514'; END IF;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'period item materialization was incomplete' USING ERRCODE = '55000'; END IF;

  UPDATE public.commission_settings SET next_liquidation_number = next_liquidation_number + 1 WHERE company_id = p_company_id;
  RETURN v_period_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_generate_period(uuid, uuid, date, date, text, text) TO authenticated;


-- ============================================================================
-- 6. Ajustes de la liquidacion (viatico, recupero, bonificacion, ...)
--    Solo se escriben por RPC, como commission_periods / commission_items.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.commission_period_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.commission_periods(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  item_id uuid REFERENCES public.commission_items(id) ON DELETE RESTRICT,
  concept text NOT NULL,
  calc_mode text NOT NULL,
  base_amount numeric(14,2),
  percent numeric(5,2),
  amount numeric(14,2) NOT NULL,
  sign smallint NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_period_adjustments_concept_check
    CHECK (concept IN ('viatico', 'recupero', 'bonificacion', 'adicional', 'descuento', 'otro')),
  CONSTRAINT commission_period_adjustments_calc_mode_check CHECK (calc_mode IN ('amount', 'percent')),
  CONSTRAINT commission_period_adjustments_percent_range CHECK (percent IS NULL OR percent BETWEEN 0 AND 100),
  CONSTRAINT commission_period_adjustments_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT commission_period_adjustments_base_nonnegative CHECK (base_amount IS NULL OR base_amount >= 0),
  CONSTRAINT commission_period_adjustments_sign_check CHECK (sign IN (1, -1)),
  CONSTRAINT commission_period_adjustments_calc_values CHECK (
    (calc_mode = 'amount' AND percent IS NULL AND base_amount IS NULL)
    OR (calc_mode = 'percent' AND percent IS NOT NULL AND base_amount IS NOT NULL AND base_amount >= 0)
  ),
  CONSTRAINT commission_period_adjustments_sign_concept CHECK (
    (concept = 'descuento' AND sign = -1)
    OR (concept IN ('viatico', 'recupero', 'bonificacion', 'adicional') AND sign = 1)
    OR concept = 'otro'
  )
);

CREATE INDEX IF NOT EXISTS commission_period_adjustments_period_idx
  ON public.commission_period_adjustments (period_id);
CREATE INDEX IF NOT EXISTS commission_period_adjustments_company_idx
  ON public.commission_period_adjustments (company_id);
CREATE INDEX IF NOT EXISTS commission_period_adjustments_item_idx
  ON public.commission_period_adjustments (item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_period_adjustments_created_by_idx
  ON public.commission_period_adjustments (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS commission_period_adjustments_item_concept_key
  ON public.commission_period_adjustments (period_id, item_id, concept) WHERE item_id IS NOT NULL;

COMMENT ON TABLE public.commission_period_adjustments IS
  'Ajustes de una liquidacion. amount siempre >= 0; el signo va en sign. Solo se escriben via commission_add_adjustment / commission_delete_adjustment / commission_suggest_maternity_adjustments, y solo con el periodo en borrador.';

CREATE OR REPLACE FUNCTION public.commission_validate_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id uuid;
  v_company_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_period_id := OLD.period_id;
  ELSE
    v_period_id := NEW.period_id;
  END IF;

  SELECT p.company_id, p.status INTO v_company_id, v_status
  FROM public.commission_periods p WHERE p.id = v_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'borrador' THEN
    RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.period_id IS DISTINCT FROM OLD.period_id THEN
    RAISE EXCEPTION 'commission adjustment cannot move to another period' USING ERRCODE = '23514';
  END IF;
  IF NEW.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'commission adjustment must match its period company' USING ERRCODE = '23514';
  END IF;
  IF NEW.item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_items i
    WHERE i.id = NEW.item_id AND i.period_id = NEW.period_id
  ) THEN
    RAISE EXCEPTION 'commission adjustment item must belong to its period' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_validate_adjustment() FROM PUBLIC, anon, authenticated;

-- Orden de disparo (alfabetico): primero _rpc_only, despues _validate.
DROP TRIGGER IF EXISTS commission_period_adjustments_rpc_only ON public.commission_period_adjustments;
CREATE TRIGGER commission_period_adjustments_rpc_only
BEFORE INSERT OR UPDATE OR DELETE ON public.commission_period_adjustments
FOR EACH ROW EXECUTE FUNCTION public.commission_require_rpc_mutation();

DROP TRIGGER IF EXISTS commission_period_adjustments_validate ON public.commission_period_adjustments;
CREATE TRIGGER commission_period_adjustments_validate
BEFORE INSERT OR UPDATE OR DELETE ON public.commission_period_adjustments
FOR EACH ROW EXECUTE FUNCTION public.commission_validate_adjustment();

ALTER TABLE public.commission_period_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_period_adjustments_read ON public.commission_period_adjustments;
CREATE POLICY commission_period_adjustments_read ON public.commission_period_adjustments
FOR SELECT TO authenticated USING (
  public.commission_can_read_company(company_id)
  OR EXISTS (
    SELECT 1 FROM public.commission_periods p
    WHERE p.id = period_id
      AND p.salesperson_id = (SELECT auth.uid())
      AND p.status IN ('cerrada', 'pagada')
  )
);

REVOKE ALL ON TABLE public.commission_period_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commission_period_adjustments TO authenticated;


-- ============================================================================
-- 7. RPCs de ajustes y de exportacion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commission_add_adjustment(
  p_period_id uuid,
  p_concept text,
  p_calc_mode text,
  p_amount numeric DEFAULT NULL,
  p_base_amount numeric DEFAULT NULL,
  p_percent numeric DEFAULT NULL,
  p_sign smallint DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_item_id uuid DEFAULT NULL
)
RETURNS public.commission_period_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.commission_periods%ROWTYPE;
  v_row public.commission_period_adjustments%ROWTYPE;
  v_user_id uuid := (SELECT auth.uid());
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_mode text := lower(btrim(COALESCE(p_calc_mode, '')));
  v_decimals integer;
  v_amount numeric;
  v_sign smallint;
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;

  IF v_concept NOT IN ('viatico', 'recupero', 'bonificacion', 'adicional', 'descuento', 'otro') THEN
    RAISE EXCEPTION 'invalid adjustment concept: %', p_concept USING ERRCODE = '23514';
  END IF;
  IF v_mode NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'invalid adjustment calc mode: %', p_calc_mode USING ERRCODE = '23514';
  END IF;

  -- Signo: lo fija el concepto, salvo 'otro', que lo exige explicito.
  IF v_concept = 'otro' THEN
    IF p_sign IS NULL OR p_sign NOT IN (1, -1) THEN
      RAISE EXCEPTION 'sign (1 or -1) is required for concept otro' USING ERRCODE = '23514';
    END IF;
    v_sign := p_sign;
  ELSE
    v_sign := CASE WHEN v_concept = 'descuento' THEN -1 ELSE 1 END;
    IF p_sign IS NOT NULL AND p_sign <> v_sign THEN
      RAISE EXCEPTION 'sign % does not match concept %', p_sign, v_concept USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Mismo redondeo que commission_calculate_sale: decimales de la moneda, default 0.
  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_period.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  IF v_mode = 'amount' THEN
    IF p_base_amount IS NOT NULL OR p_percent IS NOT NULL THEN
      RAISE EXCEPTION 'amount mode does not accept base amount or percent' USING ERRCODE = '23514';
    END IF;
    IF p_amount IS NULL OR p_amount < 0 THEN
      RAISE EXCEPTION 'amount is required and must be >= 0' USING ERRCODE = '23514';
    END IF;
    v_amount := round(p_amount, v_decimals);
  ELSE
    IF p_amount IS NOT NULL THEN
      RAISE EXCEPTION 'percent mode computes the amount; do not send amount' USING ERRCODE = '23514';
    END IF;
    IF p_base_amount IS NULL OR p_base_amount < 0 THEN
      RAISE EXCEPTION 'base amount is required and must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
      RAISE EXCEPTION 'percent is required and must be between 0 and 100' USING ERRCODE = '23514';
    END IF;
    v_amount := round(p_base_amount * p_percent / 100, v_decimals);
  END IF;

  IF p_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commission_items i WHERE i.id = p_item_id AND i.period_id = p_period_id
  ) THEN
    RAISE EXCEPTION 'adjustment item does not belong to this period' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_period_adjustments (
    period_id, company_id, item_id, concept, calc_mode, base_amount, percent,
    amount, sign, notes, created_by
  ) VALUES (
    p_period_id, v_period.company_id, p_item_id, v_concept, v_mode,
    CASE WHEN v_mode = 'percent' THEN p_base_amount END,
    CASE WHEN v_mode = 'percent' THEN p_percent END,
    v_amount, v_sign, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_delete_adjustment(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_id uuid;
  v_period public.commission_periods%ROWTYPE;
BEGIN
  SELECT a.period_id INTO v_period_id FROM public.commission_period_adjustments a WHERE a.id = p_adjustment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission adjustment not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = v_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;
  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  DELETE FROM public.commission_period_adjustments a WHERE a.id = p_adjustment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_suggest_maternity_adjustments(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.commission_periods%ROWTYPE;
  v_user_id uuid := (SELECT auth.uid());
  v_extra numeric;
  v_decimals integer;
  v_count integer;
BEGIN
  SELECT * INTO v_period FROM public.commission_periods p WHERE p.id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission period not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.commission_authorize_company(v_period.company_id, true);
  IF v_period.status <> 'borrador' THEN RAISE EXCEPTION 'only draft periods accept adjustments' USING ERRCODE = '55000'; END IF;

  SELECT st.maternity_extra_amount INTO v_extra
  FROM public.commission_settings st WHERE st.company_id = v_period.company_id;
  IF v_extra IS NULL THEN
    RAISE EXCEPTION 'maternity extra amount is not configured' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(MAX(ccs.decimal_places), 0) INTO v_decimals
  FROM public.company_currency_settings ccs
  WHERE ccs.company_id = v_period.company_id;
  v_decimals := GREATEST(COALESCE(v_decimals, 0), 0);

  PERFORM set_config('app.commission_rpc_mutation', 'on', true);
  INSERT INTO public.commission_period_adjustments (
    period_id, company_id, item_id, concept, calc_mode, base_amount, percent,
    amount, sign, notes, created_by
  )
  SELECT p_period_id, v_period.company_id, ci.id, 'adicional', 'amount', NULL, NULL,
         round(v_extra, v_decimals), 1, 'Prima de maternidad', v_user_id
  FROM public.commission_items ci
  JOIN public.sales s ON s.id = ci.sale_id
  WHERE ci.period_id = p_period_id
    AND COALESCE(s.maternity_bonus, false)
  ORDER BY ci.item_number
  ON CONFLICT (period_id, item_id, concept) WHERE item_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Filas para el Excel de liquidacion. Lectura: staff con permiso de lectura de
-- comisiones (commission_authorize_company(company, false)) de CADA empresa
-- involucrada. gross_amount / admin_fee / tax_divisor salen del rule_snapshot y
-- son NULL para items liquidados con otra base (o antes de este script);
-- sale_total_amount es el total ACTUAL de la venta, para que el reporte tenga un
-- "Total" tambien en esos items.
CREATE OR REPLACE FUNCTION public.commission_export_rows(p_period_ids uuid[])
RETURNS TABLE (
  period_id uuid, item_id uuid, sale_id uuid, item_number integer, group_type text,
  sale_date date, client_name text, client_display_id text, plan_name text,
  report_code text, sale_type text, contract_number text, lives integer,
  base_type text, calc_mode text, percent numeric, base_amount numeric,
  commission_amount numeric, gross_amount numeric, admin_fee numeric,
  tax_divisor numeric, sale_total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_period_ids IS NULL OR cardinality(p_period_ids) = 0 THEN
    RETURN;
  END IF;

  FOR v_company_id IN
    SELECT DISTINCT cp.company_id FROM public.commission_periods cp WHERE cp.id = ANY(p_period_ids)
  LOOP
    PERFORM public.commission_authorize_company(v_company_id, false);
  END LOOP;

  RETURN QUERY
  SELECT ci.period_id::uuid,
         ci.id::uuid,
         ci.sale_id::uuid,
         ci.item_number::integer,
         ci.group_type::text,
         ci.sale_date::date,
         ci.client_name::text,
         ci.client_display_id::text,
         ci.plan_name::text,
         ps.report_code::text,
         COALESCE(ci.sale_type, ci.rule_snapshot->>'sale_type')::text,
         s.contract_number::text,
         (CASE
            WHEN c.client_type = 'empresa' OR COALESCE(bn.has_primary, false) THEN COALESCE(bn.n_active, 0)
            WHEN COALESCE(bn.n_active, 0) > 0 THEN bn.n_active + 1
            ELSE COALESCE(s.adherents_count, 0) + 1
          END)::integer,
         (ci.rule_snapshot->>'base')::text,
         (ci.rule_snapshot->>'calc_mode')::text,
         ci.percent::numeric,
         ci.base_amount::numeric,
         ci.commission_amount::numeric,
         (ci.rule_snapshot->>'gross_amount')::numeric,
         (ci.rule_snapshot->>'admin_fee')::numeric,
         (ci.rule_snapshot->>'tax_divisor')::numeric,
         s.total_amount::numeric
  FROM public.commission_items ci
  LEFT JOIN public.sales s ON s.id = ci.sale_id
  LEFT JOIN public.clients c ON c.id = s.client_id
  LEFT JOIN public.commission_plan_settings ps
    ON ps.company_id = ci.company_id AND ps.plan_id = s.plan_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE COALESCE(b.status, 'active') = 'active')::integer AS n_active,
           bool_or(COALESCE(b.is_primary, false) AND COALESCE(b.status, 'active') = 'active') AS has_primary
    FROM public.beneficiaries b
    WHERE b.sale_id = ci.sale_id
  ) bn ON true
  WHERE ci.period_id = ANY(p_period_ids)
  ORDER BY ci.period_id, ci.item_number;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_add_adjustment(uuid, text, text, numeric, numeric, numeric, smallint, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_delete_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_suggest_maternity_adjustments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commission_export_rows(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_add_adjustment(uuid, text, text, numeric, numeric, numeric, smallint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_delete_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_suggest_maternity_adjustments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_export_rows(uuid[]) TO authenticated;


-- ============================================================================
-- 8. Vista: total a cobrar por liquidacion
--    total_items sale de los ITEMS, no de commission_periods.total_amount: en un
--    borrador ese total vale 0 hasta el cierre (comportamiento existente).
--    security_invoker => aplica la RLS de quien consulta (el vendedor solo ve
--    sus liquidaciones cerradas/pagadas, igual que en las tablas).
-- ============================================================================
CREATE OR REPLACE VIEW public.commission_period_payable
WITH (security_invoker = true) AS
SELECT p.id AS period_id,
       p.company_id,
       p.salesperson_id,
       p.status,
       p.currency_code,
       it.total_items,
       it.items_count,
       adj.viatico,
       adj.recupero,
       adj.bonificacion,
       adj.adicional,
       adj.descuento,
       adj.otro,
       adj.total_adjustments,
       (it.total_items + adj.total_adjustments)::numeric(14,2) AS total_a_cobrar
FROM public.commission_periods p
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(i.commission_amount), 0)::numeric(14,2) AS total_items,
         count(*)::integer AS items_count
  FROM public.commission_items i
  WHERE i.period_id = p.id
) it
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'viatico'), 0)::numeric(14,2) AS viatico,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'recupero'), 0)::numeric(14,2) AS recupero,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'bonificacion'), 0)::numeric(14,2) AS bonificacion,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'adicional'), 0)::numeric(14,2) AS adicional,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'descuento'), 0)::numeric(14,2) AS descuento,
         COALESCE(sum(a.sign * a.amount) FILTER (WHERE a.concept = 'otro'), 0)::numeric(14,2) AS otro,
         COALESCE(sum(a.sign * a.amount), 0)::numeric(14,2) AS total_adjustments
  FROM public.commission_period_adjustments a
  WHERE a.period_id = p.id
) adj;

REVOKE ALL ON TABLE public.commission_period_payable FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commission_period_payable TO authenticated;


-- ============================================================================
-- 9. CONTROL FINAL — si algo del comportamiento existente cambio, ABORTA
-- ============================================================================
CREATE TABLE cr_scratch._cr_calc_after AS
SELECT c.*
FROM public.sales s
JOIN public.commission_settings st ON st.company_id = s.company_id
CROSS JOIN LATERAL public.commission_calculate_sale(s.id) c;

CREATE TABLE cr_scratch._cr_periods_after AS
SELECT p.id, p.status, p.total_amount,
       md5(to_jsonb(p)::text) AS period_md5,
       (SELECT count(*) FROM public.commission_items i WHERE i.period_id = p.id) AS items_count,
       (SELECT sum(i.commission_amount) FROM public.commission_items i WHERE i.period_id = p.id) AS items_sum,
       (SELECT md5(string_agg(to_jsonb(i)::text, '|' ORDER BY i.item_number))
          FROM public.commission_items i WHERE i.period_id = p.id) AS items_md5
FROM public.commission_periods p;

CREATE TABLE cr_scratch._cr_config_after AS
SELECT 'commission_settings'::text AS t,
       md5(string_agg((to_jsonb(x) - 'tax_divisor' - 'maternity_extra_amount')::text, '|' ORDER BY x.company_id)) AS h
  FROM public.commission_settings x
UNION ALL
SELECT 'commission_rules', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_rules x
UNION ALL
SELECT 'commission_salespeople', md5(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id)) FROM public.commission_salespeople x
UNION ALL
SELECT 'commission_plan_settings', md5(string_agg((to_jsonb(x) - 'report_code')::text, '|' ORDER BY x.id)) FROM public.commission_plan_settings x;

DO $control$
DECLARE
  v_n integer;
  r record;
  v_frag text;
  v_new text;
  v_old text;
  v_stripped text;
  v_hits integer;
  -- Fragmentos insertados, LITERALES. Quitandolos del cuerpo nuevo tiene que
  -- quedar EXACTAMENTE el cuerpo vivo de antes. Si el cuerpo vivo en esta base
  -- no es el del repo (drift), este control falla y no se aplica nada.
  v_frags_calc text[] := ARRAY[
    $frag$  v_admin_fee numeric;
  v_tax_divisor numeric;
$frag$,
    $frag$    -- [reporte] Base neta: (total - gasto administrativo) / divisor de IVA.
    -- Sin gasto vigente NO se asume 0: la venta queda con error y bloquea.
    IF v_default_base = 'net_of_fee_and_tax' THEN
      v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
      SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
      IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
        calc_mode := 'percent'; percent := v_default_percent; base_type := v_default_base;
        error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
      END IF;
    END IF;
$frag$,
    $frag$      WHEN 'net_of_fee_and_tax' THEN (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor
$frag$,
    $frag$  -- [reporte] Misma base neta para las reglas, con el mismo criterio.
  IF v_rule.base = 'net_of_fee_and_tax' THEN
    v_admin_fee := public.commission_admin_fee_for(v_sale.company_id, COALESCE(v_sale.sale_type, 'venta_nueva'), v_sale.sale_date);
    SELECT st.tax_divisor INTO v_tax_divisor FROM public.commission_settings st WHERE st.company_id = v_sale.company_id;
    rule_id := v_rule.id; calc_mode := v_rule.calc_mode; percent := v_rule.percent; base_type := v_rule.base;
    IF v_admin_fee IS NULL OR COALESCE(v_tax_divisor, 0) <= 0 THEN
      error_code := 'admin_fee_not_configured'; RETURN NEXT; RETURN;
    END IF;
    -- Tambien en modo 'fixed': una base neta <= 0 no puede llegar a commission_items.
    IF COALESCE(v_sale.total_amount, 0) - v_admin_fee <= 0 THEN
      base_amount := round((COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor, v_decimals);
      error_code := 'invalid_base_amount'; RETURN NEXT; RETURN;
    END IF;
  END IF;

$frag$,
    $frag$    WHEN 'net_of_fee_and_tax' THEN v_base := (COALESCE(v_sale.total_amount, 0) - v_admin_fee) / v_tax_divisor;
$frag$
  ];
  v_frags_gen text[] := ARRAY[
    $frag$
      || CASE WHEN pv.base_type = 'net_of_fee_and_tax' THEN
        jsonb_build_object('admin_fee', public.commission_admin_fee_for(p_company_id, pv.sale_type, pv.sale_date),
          'tax_divisor', v_settings.tax_divisor,
          'gross_amount', (SELECT s2.total_amount FROM public.sales s2 WHERE s2.id = pv.sale_id))
      ELSE '{}'::jsonb END$frag$
  ];
BEGIN
  -- (a) El motor calcula lo mismo para todas las ventas.
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_calc_after EXCEPT ALL SELECT * FROM cr_scratch._cr_calc_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_calc_before EXCEPT ALL SELECT * FROM cr_scratch._cr_calc_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: commission_calculate_sale cambio su resultado en % fila(s). No se aplica nada.', v_n;
  END IF;

  -- (b) Liquidaciones e items intactos.
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_periods_after EXCEPT ALL SELECT * FROM cr_scratch._cr_periods_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_periods_before EXCEPT ALL SELECT * FROM cr_scratch._cr_periods_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: cambiaron % liquidacion(es) o sus items. No se aplica nada.', v_n;
  END IF;

  -- (c) Configuracion intacta (sin contar las columnas nuevas).
  SELECT count(*) INTO v_n FROM (
    (SELECT * FROM cr_scratch._cr_config_after EXCEPT ALL SELECT * FROM cr_scratch._cr_config_before)
    UNION ALL
    (SELECT * FROM cr_scratch._cr_config_before EXCEPT ALL SELECT * FROM cr_scratch._cr_config_after)
  ) d;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CONTROL: cambio la configuracion existente del modulo. No se aplica nada.';
  END IF;

  -- (d) Toda funcion commission_* que ya existia, salvo las 2 reemplazadas, sigue
  --     identica (fuente, firma, retorno, SECURITY DEFINER, volatilidad,
  --     search_path y GRANTs). Incluye commission_require_rpc_mutation y
  --     commission_preview.
  FOR r IN
    SELECT b.proname, b.args
    FROM cr_scratch._cr_src_before b
    LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname NOT IN ('commission_calculate_sale', 'commission_generate_period')
      AND (p.oid IS NULL
           OR replace(p.prosrc, E'\r', '') IS DISTINCT FROM replace(b.prosrc, E'\r', '')
           OR pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM b.args
           OR pg_get_function_result(p.oid) IS DISTINCT FROM b.result
           OR p.prosecdef IS DISTINCT FROM b.prosecdef
           OR p.provolatile IS DISTINCT FROM b.provolatile
           OR p.proconfig::text IS DISTINCT FROM b.proconfig
           OR p.proacl::text IS DISTINCT FROM b.proacl)
  LOOP
    RAISE EXCEPTION 'CONTROL: la funcion %(%) cambio y no debia. No se aplica nada.', r.proname, r.args;
  END LOOP;

  -- (e) Las 2 reemplazadas conservan firma, retorno y atributos...
  FOR r IN
    SELECT b.proname, b.args
    FROM cr_scratch._cr_src_before b
    LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname IN ('commission_calculate_sale', 'commission_generate_period')
      AND (p.oid IS NULL
           OR pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM b.args
           OR pg_get_function_result(p.oid) IS DISTINCT FROM b.result
           OR p.prosecdef IS DISTINCT FROM b.prosecdef
           OR p.provolatile IS DISTINCT FROM b.provolatile
           OR p.proconfig::text IS DISTINCT FROM b.proconfig
           OR p.proacl::text IS DISTINCT FROM b.proacl)
  LOOP
    RAISE EXCEPTION 'CONTROL: % cambio de firma, atributos o GRANTs. No se aplica nada.', r.proname;
  END LOOP;

  -- ...y su cuerpo nuevo es el viejo MAS los fragmentos, nada mas.
  FOR r IN
    SELECT b.proname, b.prosrc AS old_src, p.prosrc AS new_src
    FROM cr_scratch._cr_src_before b
    JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname IN ('commission_calculate_sale', 'commission_generate_period')
  LOOP
    v_old := replace(r.old_src, E'\r', '');
    v_new := replace(r.new_src, E'\r', '');

    IF v_old LIKE '%net_of_fee_and_tax%' THEN
      -- Segunda corrida: la base ya tenia esta version. Tiene que quedar igual.
      IF v_new IS DISTINCT FROM v_old THEN
        RAISE EXCEPTION 'CONTROL: % ya tenia net_of_fee_and_tax pero con OTRO cuerpo. No se aplica nada.', r.proname;
      END IF;
      CONTINUE;
    END IF;

    v_stripped := v_new;
    FOREACH v_frag IN ARRAY CASE WHEN r.proname = 'commission_calculate_sale' THEN v_frags_calc ELSE v_frags_gen END
    LOOP
      v_frag := replace(v_frag, E'\r', '');
      v_hits := (length(v_stripped) - length(replace(v_stripped, v_frag, ''))) / length(v_frag);
      IF v_hits <> 1 THEN
        RAISE EXCEPTION 'CONTROL: un fragmento insertado aparece % vez/veces en % (se esperaba 1). No se aplica nada.', v_hits, r.proname;
      END IF;
      v_stripped := replace(v_stripped, v_frag, '');
    END LOOP;

    IF v_stripped IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'CONTROL: el cuerpo vivo de % no es el del repo (20260819000003). Hay drift: no se aplica nada.', r.proname
        USING HINT = 'Comparar pg_get_functiondef de la base contra supabase/migrations/20260819000003_commission_sale_type_snapshot.sql.';
    END IF;
  END LOOP;

  -- (f) El guard de mutacion por RPC sigue siendo el mismo objeto, sin cambios
  --     (ya cubierto por (d); se deja explicito porque es el candado contable).
  IF NOT EXISTS (
    SELECT 1 FROM cr_scratch._cr_src_before b JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proname = 'commission_require_rpc_mutation'
      AND replace(p.prosrc, E'\r', '') = replace(b.prosrc, E'\r', '')
  ) THEN
    RAISE EXCEPTION 'CONTROL: commission_require_rpc_mutation cambio. No se aplica nada.';
  END IF;

  RAISE NOTICE 'CONTROL OK: calculo, liquidaciones, configuracion y funciones existentes sin cambios.';
END
$control$;

DROP SCHEMA IF EXISTS cr_scratch CASCADE;

NOTIFY pgrst, 'reload schema';
$pase_13$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  -- ##########################################################################
  -- verificacion, guarda de datos e historial
  -- ##########################################################################
  v_paso := 'verificacion, guarda de datos e historial';
  v_t := clock_timestamp();
  EXECUTE replace($pase_14$
DO $verif$
DECLARE
  v_faltas text[] := '{}';
  v_x text;
BEGIN
  FOREACH v_x IN ARRAY ARRAY['commission_settings', 'commission_salespeople', 'commission_plan_settings', 'commission_rules', 'commission_periods', 'commission_items', 'commission_admin_fees', 'commission_period_adjustments']::text[] LOOP
    IF to_regclass('public.' || v_x) IS NULL THEN
      v_faltas := v_faltas || ('tabla ' || v_x);
    ELSIF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_x)) THEN
      v_faltas := v_faltas || ('RLS apagada en ' || v_x);
    END IF;
  END LOOP;
  FOREACH v_x IN ARRAY ARRAY['commission_resolve_rule', 'commission_calculate_sale', 'commission_preview', 'commission_generate_period', 'commission_close_period', 'commission_pay_period', 'commission_annul_period', 'commission_list_salespeople', 'commission_add_adjustment', 'commission_delete_adjustment', 'commission_suggest_maternity_adjustments', 'commission_export_rows', 'commission_admin_fee_for']::text[] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = v_x) THEN
      v_faltas := v_faltas || ('funcion ' || v_x);
    END IF;
  END LOOP;
  IF to_regclass('public.commission_period_payable') IS NULL THEN
    v_faltas := v_faltas || 'vista commission_period_payable'::text;
  END IF;
  IF to_regclass('public.commission_promoter_types') IS NOT NULL THEN
    v_faltas := v_faltas || 'sigue commission_promoter_types (debia eliminarse)'::text;
  END IF;
  IF to_regnamespace('cr_scratch') IS NOT NULL THEN
    v_faltas := v_faltas || 'quedo el esquema de trabajo cr_scratch'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.commission_settings) THEN
    v_faltas := v_faltas || 'commission_settings no esta vacia (el pase no carga configuracion)'::text;
  END IF;
  -- Ningun permiso para anon sobre las tablas del modulo.
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'commission%') THEN
    v_faltas := v_faltas || 'anon tiene permisos sobre tablas commission_*'::text;
  END IF;
  IF cardinality(v_faltas) > 0 THEN
    RAISE EXCEPTION 'Verificacion fallida, no se aplico nada: %', array_to_string(v_faltas, '; ');
  END IF;
END
$verif$;

DO $guarda$
DECLARE
  r record;
  v_h record;
  v_errores text[] := '{}';
  v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM pc_scratch.foto ORDER BY tabla LOOP
    v_n := v_n + 1;
    SELECT * INTO v_h FROM pc_scratch.huella(r.tabla);
    IF v_h.filas <> r.filas OR v_h.huella <> r.huella THEN
      v_errores := v_errores || format('%s: %s filas -> %s%s', r.tabla, r.filas, v_h.filas,
                                       CASE WHEN v_h.filas = r.filas THEN ' (mismo conteo, filas reescritas)' ELSE '' END);
    END IF;
  END LOOP;
  SELECT v_errores || coalesce(array_agg(format('columna %s.%s (%s) desaparecio o cambio de tipo', c.tabla, c.columna, c.tipo)
                                         ORDER BY c.tabla, c.columna), '{}')
    INTO v_errores
    FROM pc_scratch.columnas c
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass(format('public.%I', c.tabla))
                        AND a.attname = c.columna AND a.attnum > 0 AND NOT a.attisdropped
                        AND format_type(a.atttypid, a.atttypmod) = c.tipo);
  IF cardinality(v_errores) > 0 THEN
    RAISE EXCEPTION 'GUARDA DE DATOS: el pase modifico datos existentes. Se deshace todo. %', array_to_string(v_errores, ' | ');
  END IF;
  RAISE NOTICE 'Guarda OK: % tablas preexistentes sin ninguna fila escrita.', v_n;
END
$guarda$;

DO $hist$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES
      ('202608040001', 'commission_01_schema', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('202608040002', 'commission_02_integrity', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('202608040003', 'commission_03_rpcs', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('202608040004', 'commission_04_rls_grants', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804175027', 'commission_security_hardening', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804175810', 'commission_rls_policy_consolidation', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804190000', 'commission_fix_list_salespeople_email_cast', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804200000', 'commission_currency_rounding', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804210000', 'commission_remove_promoter_types', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260804220000', 'commission_salesperson_default_percent', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20260819000003', 'commission_sale_type_snapshot', ARRAY['-- aplicada por sql/produccion-comisiones.sql']),
      ('20261007000001', 'commission_report_additive', ARRAY['-- aplicada por sql/produccion-comisiones.sql'])
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$hist$;
$pase_14$, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;

  v_paso := 'mediciones';
  v_total := round(extract(epoch FROM clock_timestamp() - v_t_inicio)::numeric, 2);
  SELECT string_agg(format('%s %s s', n, round(d, 2)), ', ' ORDER BY d DESC) INTO v_lentos
    FROM (SELECT n, d FROM unnest(v_nombres, v_duraciones) u(n, d) ORDER BY d DESC LIMIT 3) s;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version <> ALL ($1)'
      INTO v_sin_archivo USING ARRAY['20250710182447', '20250710192711', '20250711110418', '20250715193438', '20250715195259', '20250715205545', '20250716144836', '20250716153716', '20250716155645', '20250716161248', '20250716162259', '20250716210249', '20250717002333', '20250717151249', '20250717170712', '20250717171225', '20250717195407', '20250717201311', '20250718125307', '20250725221720', '20250727181607', '20250730114958', '20250731123927', '20250731125815', '20250801111126', '20250801112733', '20250801140726', '20250803231059', '20250807125437', '20250807150749', '20250811204601', '20250812124915', '20250813123552', '20250814113907', '20250818131139', '20260203023846', '20260203023945', '20260203024758', '20260203114224', '20260203132328', '20260204022658', '20260205193814', '20260205194053', '20260205194128', '20260205203420', '20260206124854', '20260209130156', '20260209132845', '20260209171351', '20260209173731', '20260209181719', '20260209181922', '20260209191333', '20260209210415', '20260210120000', '20260210130000', '20260210143000', '20260211000000', '20260211100000', '20260211100001', '20260211180635', '20260211183409', '20260211183809', '20260211185141', '20260211192246', '20260211193726', '20260211200856', '20260211201657', '20260211202857', '20260213185108', '20260215030225', '20260215030640', '20260216120000', '20260218215303', '20260219013511', '20260219123301', '20260219130000', '20260220191434', '20260223120000', '20260223153000', '20260224120000', '20260224184412', '20260224201035', '20260224203002', '20260224203435', '20260225135136', '20260225152638', '20260226133225', '20260226163113', '20260226164303', '20260226172651', '20260226174702', '20260227004522', '20260304004143', '20260304112449', '20260304112557', '20260304120000', '20260304133819', '20260304141401', '20260304141708', '20260305211955', '20260306171942', '20260306174522', '20260306174644', '20260308022010', '20260308055116', '20260310120000', '20260313122252', '20260313202614', '20260313204145', '20260313204230', '20260313204443', '20260313204627', '20260313211823', '20260313211913', '20260313212022', '20260316191713', '20260316201341', '20260318005826', '20260318021419', '20260318022449', '20260318212246', '20260318212319', '20260318214336', '20260318214356', '20260319154519', '20260320115908', '20260320121637', '20260320132936', '20260320161525', '20260325103000', '20260325104500', '20260325105000', '20260330120000', '20260331012519', '20260331012616', '20260331021912', '20260331023708', '20260331121915', '20260331142943', '20260331161407', '20260331223756', '20260331230901', '20260401003748', '20260402203606', '20260404235832', '20260406153000', '20260407144448', '20260414000000', '20260414000001', '20260414000002', '20260416103000', '202608040001', '202608040002', '202608040003', '202608040004', '20260804175027', '20260804175810', '20260804190000', '20260804200000', '20260804210000', '20260804220000', '20260813000001', '20260813000002', '20260813000003', '20260817000001', '20260817000002', '20260818000001', '20260818000002', '20260818000003', '20260819000001', '20260819000002', '20260819000003', '20260819210000', '20260821120000', '20260822000001', '20260822000002', '20260822000003', '20260908000001', '20260908000002', '20260908000003', '20260908000004', '20260908000005', '20260908000006', '20260909000001', '20260909000002', '20260910000001', '20260910000002', '20260910000003', '20260910000004', '20261007000001', '20261109000001']::text[];
  END IF;
  v_medicion := format('Duracion total %s s. Pasos mas lentos: %s. db push: %s.', v_total, v_lentos,
                       CASE WHEN coalesce(v_sin_archivo, 0) > 0
                            THEN format('BLOQUEADO por la CLI (%s versiones en el historial sin archivo en el repo)', v_sin_archivo)
                            ELSE 'ATENCION, la CLI podria aplicar migraciones con un db push' END);

  v_paso := 'fin del simulacro';
  EXECUTE 'SELECT count(*) FROM pc_scratch.foto' INTO v_tablas;
  RAISE EXCEPTION 'SIMULACRO OK — nada quedo aplicado. % tablas preexistentes sin ninguna fila escrita, % tablas del modulo creadas y verificadas. %',
    v_tablas, 8, v_medicion;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING
    MESSAGE = SQLERRM || '  [paso: ' || v_paso || ']',
    ERRCODE = SQLSTATE;
END
$pase_comisiones$;
