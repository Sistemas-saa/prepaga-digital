import { Database } from '@/integrations/supabase/types';

/** Base enum from DB (auto-generated) */
type BaseSaleStatus = Database['public']['Enums']['sale_status'];

/** Extended sale statuses added via migrations but not yet in auto-generated types */
type ExtendedSaleStatus =
  | 'preparando_documentos'
  | 'esperando_ddjj'
  | 'en_revision'
  | 'rechazado'
  | 'aprobado_para_templates'
  | 'listo_para_enviar'
  | 'firmado_parcial'
  | 'expirado';

export type SaleStatus = BaseSaleStatus | ExtendedSaleStatus;
export type AppRole = 'super_admin' | 'admin' | 'supervisor' | 'auditor' | 'gestor' | 'vendedor' | 'financiero';

/** All possible sale states */
export const ALL_SALE_STATUSES: SaleStatus[] = [
  'borrador',
  'enviado',
  'firmado',
  'completado',
  'cancelado',
  'pendiente',
  'en_auditoria',
];

/** Human-readable labels for sale statuses */
export const SALE_STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  firmado: 'Firmado',
  completado: 'Completado',
  cancelado: 'Cancelado',
  pendiente: 'Pendiente',
  en_auditoria: 'En Auditoría',
  rechazado: 'Rechazado',
  aprobado_para_templates: 'Aprobado',
  preparando_documentos: 'Preparando Documentos',
  esperando_ddjj: 'Esperando DDJJ',
  en_revision: 'En Revisión',
  listo_para_enviar: 'Listo para Enviar',
  firmado_parcial: 'Firmado Parcial',
  expirado: 'Expirado',
};

/** All application roles */
export const ALL_ROLES: AppRole[] = [
  'super_admin',
  'admin',
  'supervisor',
  'auditor',
  'gestor',
  'vendedor',
  'financiero',
];

/** A condition that must be met for a transition */
export interface TransitionCondition {
  id: string;
  type: 'built_in' | 'custom';
  /** For built_in: key like 'has_client', 'has_plan', etc. */
  built_in_key?: string;
  /** Human-readable label shown in UI */
  label: string;
  /** Optional longer description */
  description?: string;
}

/** A single allowed state transition */
export interface TransitionRule {
  id: string;
  from: SaleStatus;
  to: SaleStatus;
  allowed_roles: AppRole[];
  conditions: TransitionCondition[];
  require_note?: boolean;
}

/** Per-state role visibility/access config */
export interface StateAccessRule {
  state: SaleStatus;
  visible_to: AppRole[];
  editable_by: AppRole[];
}

/** The full workflow configuration (stored as JSONB) */
export interface WorkflowConfig {
  transitions: TransitionRule[];
  state_access: StateAccessRule[];
}

/** Available built-in condition definitions */
export const BUILT_IN_CONDITIONS: { key: string; label: string; description: string }[] = [
  { key: 'has_client', label: 'Cliente asignado', description: 'La venta tiene un cliente asociado' },
  { key: 'has_plan', label: 'Plan seleccionado', description: 'La venta tiene un plan asignado' },
  { key: 'has_beneficiaries', label: 'Adherentes cargados', description: 'La venta tiene al menos un adherente' },
  { key: 'has_documents', label: 'Documentos generados', description: 'La venta tiene PDF de contrato generado' },
  { key: 'has_template', label: 'Template asignado', description: 'La venta tiene template de cuestionario' },
  { key: 'has_ddjj', label: 'DDJJ completada', description: 'El cuestionario de salud fue respondido' },
  { key: 'audit_approved', label: 'Auditoria aprobada', description: 'El proceso de auditoria fue aprobado' },
  { key: 'all_signatures_complete', label: 'Firmas completadas', description: 'Todas las firmas requeridas fueron completadas' },
  { key: 'has_signature_token', label: 'Link de firma generado', description: 'Se genero un token de firma valido' },
];

/** Default workflow config that matches the current implicit flow */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  transitions: [
    // BORRADOR → EN_AUDITORIA: vendedor envía para revisión
    {
      id: 'default-1',
      from: 'borrador',
      to: 'en_auditoria',
      allowed_roles: ['vendedor', 'gestor', 'admin', 'super_admin'],
      conditions: [
        { id: 'dc-1', type: 'built_in', built_in_key: 'has_client', label: 'Cliente asignado' },
        { id: 'dc-2', type: 'built_in', built_in_key: 'has_plan', label: 'Plan seleccionado' },
      ],
      require_note: false,
    },
    // EN_AUDITORIA → APROBADO (aprobado_para_templates): auditor aprueba
    {
      id: 'default-2',
      from: 'en_auditoria',
      to: 'aprobado_para_templates',
      allowed_roles: ['vendedor', 'auditor', 'admin', 'super_admin'],
      conditions: [],
      require_note: false,
    },
    // EN_AUDITORIA → RECHAZADO: auditor rechaza con comentario obligatorio
    {
      id: 'default-3',
      from: 'en_auditoria',
      to: 'rechazado',
      allowed_roles: ['auditor', 'admin', 'super_admin'],
      conditions: [],
      require_note: true,
    },
    // RECHAZADO → BORRADOR: vendedor corrige y vuelve a editar
    {
      id: 'default-4',
      from: 'rechazado',
      to: 'borrador',
      allowed_roles: ['vendedor', 'gestor', 'admin', 'super_admin'],
      conditions: [],
      require_note: false,
    },
    // APROBADO → ENVIADO: vendedor envía para firma
    {
      id: 'default-5',
      from: 'aprobado_para_templates',
      to: 'enviado',
      allowed_roles: ['vendedor', 'gestor', 'admin', 'super_admin'],
      conditions: [
        { id: 'dc-3', type: 'built_in', built_in_key: 'has_signature_token', label: 'Link de firma generado' },
      ],
      require_note: false,
    },
    // ENVIADO → FIRMADO: firma del cliente completada
    {
      id: 'default-6',
      from: 'enviado',
      to: 'firmado',
      allowed_roles: ['vendedor', 'gestor', 'admin', 'super_admin'],
      conditions: [
        { id: 'dc-4', type: 'built_in', built_in_key: 'all_signatures_complete', label: 'Firmas completadas' },
      ],
      require_note: false,
    },
    // FIRMADO → COMPLETADO: validación final
    {
      id: 'default-7',
      from: 'firmado',
      to: 'completado',
      allowed_roles: ['admin', 'super_admin'],
      conditions: [],
      require_note: false,
    },
    // Cancelaciones desde cualquier estado activo
    {
      id: 'default-8',
      from: 'borrador',
      to: 'cancelado',
      allowed_roles: ['vendedor', 'gestor', 'admin', 'super_admin'],
      conditions: [],
      require_note: true,
    },
    {
      id: 'default-9',
      from: 'enviado',
      to: 'cancelado',
      allowed_roles: ['admin', 'super_admin'],
      conditions: [],
      require_note: true,
    },
  ],
  state_access: [
    // BORRADOR: vendedor puede editar, todos ven (excepto financiero)
    { state: 'borrador', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['vendedor', 'gestor', 'admin', 'super_admin'] },
    // EN_AUDITORIA: auditor revisa, vendedor solo ve
    { state: 'en_auditoria', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['auditor', 'admin', 'super_admin'] },
    // RECHAZADO: vendedor puede ver y volver a borrador
    { state: 'rechazado', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['vendedor', 'gestor', 'admin', 'super_admin'] },
    // APROBADO: vendedor prepara envío
    { state: 'aprobado_para_templates', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['vendedor', 'gestor', 'admin', 'super_admin'] },
    // ENVIADO: esperando firma
    { state: 'enviado', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['admin', 'super_admin'] },
    // FIRMADO: pendiente validación final
    { state: 'firmado', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: ['admin', 'super_admin'] },
    // COMPLETADO: solo lectura
    { state: 'completado', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: [] },
    // CANCELADO: solo lectura
    { state: 'cancelado', visible_to: ['vendedor', 'gestor', 'supervisor', 'auditor', 'admin', 'super_admin'], editable_by: [] },
  ],
};
