export type CommissionGroupType = 'INDIVIDUAL' | 'GRUPAL';
export type CommissionCalcMode = 'percent' | 'fixed';
export type CommissionBase = 'plan_price' | 'sale_total_amount' | 'per_adherent' | 'net_of_fee_and_tax';
export type CommissionPeriodStatus = 'borrador' | 'cerrada' | 'pagada' | 'anulada';

export interface CommissionSettings {
  company_id: string;
  accrual_event: 'firma_completa' | 'venta_completada';
  liquidation_prefix: string;
  next_liquidation_number: number;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionPlanSetting {
  id: string;
  company_id: string;
  plan_id: string;
  group_type: CommissionGroupType;
  is_active: boolean;
  plans?: { id: string; name: string } | null;
}

export interface CommissionRule {
  id: string;
  company_id: string;
  salesperson_id: string | null;
  plan_id: string | null;
  sale_type: string | null;
  group_type: CommissionGroupType | null;
  calc_mode: CommissionCalcMode;
  percent: number | null;
  fixed_amount: number | null;
  base: CommissionBase;
  valid_from: string;
  valid_to: string | null;
  priority: number;
  specificity?: number;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  salesperson?: { id: string; first_name: string | null; last_name: string | null } | null;
  plan?: { id: string; name: string } | null;
}

export type CommissionRuleInput = Omit<CommissionRule, 'id' | 'specificity' | 'created_by' | 'created_at' | 'updated_at' | 'salesperson' | 'plan'>;

export interface CommissionPeriod {
  id: string;
  company_id: string;
  liquidation_number: string;
  period_start: string;
  period_end: string;
  status: CommissionPeriodStatus;
  concept: string;
  salesperson_id: string;
  salesperson_name: string;
  total_amount: number;
  currency_code: string;
  closed_at: string | null;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
  salesperson?: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface CommissionItem {
  id: string;
  period_id: string;
  company_id: string;
  salesperson_id: string;
  sale_id: string;
  item_number: number;
  group_type: CommissionGroupType | null;
  sale_date: string;
  client_display_id: string | null;
  client_sequence: number | null;
  client_name: string;
  plan_name: string;
  percent: number | null;
  base_amount: number;
  commission_amount: number;
  concept: string;
  rule_id: string | null;
  rule_snapshot: Record<string, unknown> | null;
  /** Snapshot del `sales.sale_type` al liquidar. NULL en ítems anteriores al backfill. */
  sale_type: string | null;
  is_settled: boolean;
}

export interface CommissionPreviewItem {
  sale_id: string;
  sale_date: string;
  client_display_id: string | null;
  client_sequence: number | null;
  client_name: string;
  plan_name: string;
  group_type: CommissionGroupType | null;
  rule_id: string | null;
  percent: number | null;
  base_amount: number | null;
  commission_amount: number | null;
  has_rule: boolean;
  sale_type: string | null;
  error_code?: string | null;
  calc_mode?: CommissionCalcMode | null;
  base_type?: CommissionBase | null;
}

export interface CommissionPreviewParams {
  companyId: string;
  salespersonId: string;
  periodStart: string;
  periodEnd: string;
}

export interface CommissionProfileOption {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

export interface CommissionSalespersonConfig {
  id?: string;
  company_id?: string;
  salesperson_id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  default_percent: number | null;
  default_base: CommissionBase;
}

export const commissionPersonName = (profile?: CommissionProfileOption | null) =>
  profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Sin nombre';

export type CommissionAdjustmentConcept = 'viatico' | 'recupero' | 'bonificacion' | 'adicional' | 'descuento' | 'otro';

export interface CommissionAdjustment {
  id: string;
  period_id: string;
  company_id: string;
  item_id: string | null;
  concept: CommissionAdjustmentConcept;
  calc_mode: 'amount' | 'percent';
  base_amount: number | null;
  percent: number | null;
  /** Siempre >= 0: el signo va aparte, en `sign`. */
  amount: number;
  sign: 1 | -1;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface CommissionAdjustmentInput {
  periodId: string;
  concept: CommissionAdjustmentConcept;
  calcMode: 'amount' | 'percent';
  amount?: number;
  baseAmount?: number;
  percent?: number;
  /** Sólo se envía para `otro`; el resto lo fija el concepto. */
  sign?: 1 | -1;
  notes?: string;
}

/** Fila de la vista `commission_period_payable`. */
export interface CommissionPayable {
  period_id: string;
  total_items: number;
  items_count: number;
  viatico: number;
  recupero: number;
  bonificacion: number;
  adicional: number;
  descuento: number;
  otro: number;
  total_adjustments: number;
  total_a_cobrar: number;
}

/** Fila de la RPC `commission_export_rows`. */
export interface CommissionExportRow {
  period_id: string;
  item_id: string;
  sale_id: string;
  item_number: number;
  group_type: CommissionGroupType | null;
  sale_date: string;
  client_name: string;
  client_display_id: string | null;
  plan_name: string;
  report_code: string | null;
  sale_type: string | null;
  contract_number: string | null;
  lives: number | null;
  base_type: string | null;
  calc_mode: CommissionCalcMode | null;
  percent: number | null;
  base_amount: number;
  commission_amount: number;
  gross_amount: number | null;
  admin_fee: number | null;
  tax_divisor: number | null;
  sale_total_amount: number | null;
}
