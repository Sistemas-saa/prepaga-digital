import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type {
  CommissionAdjustment,
  CommissionAdjustmentInput,
  CommissionBase,
  CommissionExportRow,
  CommissionItem,
  CommissionPayable,
  CommissionPeriod,
  CommissionPlanSetting,
  CommissionPreviewItem,
  CommissionPreviewParams,
  CommissionProfileOption,
  CommissionRule,
  CommissionRuleInput,
  CommissionSettings,
  CommissionSalespersonConfig,
} from '@/types/commissions';

// Los tipos generados ya incluyen las tablas y RPC commission_*, asi que estos
// helpers son solo azucar sintactico: el nombre de tabla/funcion se infiere como
// literal y TypeScript valida las columnas de verdad. Antes se casteaba a 'plans'
// y a 'get_user_company_id', lo que ocultaba errores reales de columnas.
type CommissionTable = Extract<keyof Database['public']['Tables'], `commission_${string}`>;
type CommissionRpc = Extract<keyof Database['public']['Functions'], `commission_${string}`>;

const commissionFrom = <T extends CommissionTable>(table: T) => supabase.from(table);
const commissionRpc = async <T>(name: CommissionRpc, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw error;
  return data as unknown as T;
};

const queryKeys = {
  settings: (companyId?: string | null) => ['commissions', companyId, 'settings'] as const,
  rules: (companyId?: string | null) => ['commissions', companyId, 'rules'] as const,
  periods: (companyId?: string | null) => ['commissions', companyId, 'periods'] as const,
  period: (companyId: string | null | undefined, periodId: string) => ['commissions', companyId, 'period', periodId] as const,
  items: (companyId: string | null | undefined, periodId: string) => ['commissions', companyId, 'items', periodId] as const,
  catalog: (companyId?: string | null) => ['commissions', companyId, 'catalog'] as const,
  salespeople: (companyId?: string | null) => ['commissions', companyId, 'salespeople'] as const,
  adjustments: (companyId: string | null | undefined, periodId: string) => ['commissions', companyId, 'adjustments', periodId] as const,
  payable: (companyId: string | null | undefined, periodId: string) => ['commissions', companyId, 'payable', periodId] as const,
  preview: (params?: CommissionPreviewParams | null) => ['commissions', params?.companyId, 'preview', params] as const,
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Error inesperado';

export const useCommissionSettings = () => {
  const { profile } = useSimpleAuthContext();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: queryKeys.settings(companyId),
    enabled: Boolean(companyId),
    retry: false,
    queryFn: async (): Promise<CommissionSettings | null> => {
      const { data, error } = await commissionFrom('commission_settings')
        .select('*').eq('company_id', companyId!).maybeSingle();
      if (error) throw error;
      return data as unknown as CommissionSettings | null;
    },
  });
};

export const useSaveCommissionSettings = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<CommissionSettings, 'accrual_event' | 'liquidation_prefix' | 'is_enabled'>) => {
      if (!profile?.company_id) throw new Error('No se encontró la empresa del usuario.');
      const prefix = input.liquidation_prefix.trim();
      if (!prefix) throw new Error('El prefijo de liquidación es obligatorio.');
      const { data, error } = await commissionFrom('commission_settings').upsert({ company_id: profile.company_id, accrual_event: input.accrual_event, liquidation_prefix: prefix, is_enabled: input.is_enabled } as never, { onConflict: 'company_id' }).select().single();
      if (error) throw error;
      return data as unknown as CommissionSettings;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.settings(profile?.company_id) }); toast.success('Configuración de comisiones guardada'); },
    onError: (error) => toast.error(messageOf(error)),
  });
};

export const useCommissionCatalog = () => {
  const { profile } = useSimpleAuthContext();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: queryKeys.catalog(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const [salespeople, plans, planSettings] = await Promise.all([
        commissionRpc<CommissionSalespersonConfig[]>('commission_list_salespeople', { p_company_id: companyId! }),
        supabase.from('plans').select('id,name').eq('company_id', companyId!).eq('is_active', true).order('name'),
        commissionFrom('commission_plan_settings').select('*,plans:plan_id(id,name)').eq('company_id', companyId!).eq('is_active', true),
      ]);
      const error = plans.error || planSettings.error;
      if (error) throw error;
      return {
        profiles: salespeople.map(({ salesperson_id, display_name, email }) => ({ id: salesperson_id, display_name, email })) as CommissionProfileOption[],
        plans: (plans.data || []) as Array<{ id: string; name: string }>,
        planSettings: (planSettings.data || []) as unknown as CommissionPlanSetting[],
      };
    },
  });
};

export const useCommissionRules = () => {
  const { profile } = useSimpleAuthContext();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: queryKeys.rules(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CommissionRule[]> => {
      const { data, error } = await commissionFrom('commission_rules').select(`
        *, salesperson:salesperson_id(id,first_name,last_name),
        plan:plan_id(id,name)
      `).eq('company_id', companyId!).order('priority', { ascending: false }).order('valid_from', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CommissionRule[];
    },
  });
};

export const useCommissionSalespeople = () => {
  const { profile } = useSimpleAuthContext();
  return useQuery({
    queryKey: queryKeys.salespeople(profile?.company_id), enabled: Boolean(profile?.company_id),
    queryFn: async (): Promise<CommissionSalespersonConfig[]> => {
      return commissionRpc<CommissionSalespersonConfig[]>('commission_list_salespeople', { p_company_id: profile!.company_id! });
    },
  });
};

export const useSaveCommissionSalesperson = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { salesperson_id: string; is_active: boolean; default_percent?: number | null; default_base?: CommissionBase }) => {
      if (!profile?.company_id) throw new Error('Empresa no disponible');
      const { data, error } = await commissionFrom('commission_salespeople').upsert({ ...input, company_id: profile.company_id } as never, { onConflict: 'company_id,salesperson_id' }).select().single();
      if (error) throw error;
      return data as unknown as CommissionSalespersonConfig;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.salespeople(profile?.company_id) }); toast.success('Vendedor configurado'); },
    onError: (error) => toast.error(`No se pudo configurar: ${messageOf(error)}`),
  });
};

export const useSaveCommissionRule = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CommissionRuleInput & { id?: string }) => {
      if (!profile?.company_id) throw new Error('Empresa no disponible');
      const payload = { ...input, company_id: profile.company_id };
      const query = id
        ? commissionFrom('commission_rules').update(payload as never).eq('id', id)
        : commissionFrom('commission_rules').insert(payload as never);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as unknown as CommissionRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rules(profile?.company_id) });
      toast.success('Regla guardada');
    },
    onError: (error) => toast.error(`No se pudo guardar: ${messageOf(error)}`),
  });
};

export const useDeactivateCommissionRule = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await commissionFrom('commission_rules').update({ is_active: false } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rules(profile?.company_id) });
      toast.success('Regla desactivada');
    },
    onError: (error) => toast.error(`No se pudo desactivar: ${messageOf(error)}`),
  });
};

export const useCommissionPreview = (params: CommissionPreviewParams | null) => useQuery({
  queryKey: queryKeys.preview(params),
  enabled: Boolean(params?.companyId && params.salespersonId && params.periodStart && params.periodEnd),
  queryFn: async () => {
    const rows = await commissionRpc<Array<Omit<CommissionPreviewItem, 'has_rule'>>>('commission_preview', {
      p_company_id: params!.companyId,
      p_salesperson_id: params!.salespersonId,
      p_from: params!.periodStart,
      p_to: params!.periodEnd,
    });
    return rows.map((row) => ({ ...row, has_rule: !row.error_code }));
  },
});

export const useGenerateCommissionPeriod = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CommissionPreviewParams) => commissionRpc<string>('commission_generate_period', {
      p_company_id: params.companyId,
      p_salesperson_id: params.salespersonId,
      p_from: params.periodStart,
      p_to: params.periodEnd,
    }),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periods(profile?.company_id) });
      queryClient.removeQueries({ queryKey: ['commissions', params.companyId, 'preview'] });
      toast.success('Liquidación generada en borrador');
    },
    onError: (error) => toast.error(`No se pudo generar: ${messageOf(error)}`),
  });
};

export const useCommissionPeriods = () => {
  const { profile } = useSimpleAuthContext();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: queryKeys.periods(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<CommissionPeriod[]> => {
      const { data, error } = await commissionFrom('commission_periods')
        .select('*')
        .eq('company_id', companyId!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CommissionPeriod[];
    },
  });
};

export const useCommissionPeriod = (periodId: string) => {
  const { profile } = useSimpleAuthContext();
  return useQuery({
    queryKey: queryKeys.period(profile?.company_id, periodId),
    enabled: Boolean(profile?.company_id && periodId),
    queryFn: async (): Promise<CommissionPeriod> => {
      const { data, error } = await commissionFrom('commission_periods')
        .select('*').eq('id', periodId).single();
      if (error) throw error;
      return data as unknown as CommissionPeriod;
    },
  });
};

export const useCommissionItems = (periodId: string) => {
  const { profile } = useSimpleAuthContext();
  return useQuery({
    queryKey: queryKeys.items(profile?.company_id, periodId),
    enabled: Boolean(profile?.company_id && periodId),
    queryFn: async (): Promise<CommissionItem[]> => {
      const { data, error } = await commissionFrom('commission_items')
        .select('*').eq('period_id', periodId).order('item_number');
      if (error) throw error;
      return (data || []) as unknown as CommissionItem[];
    },
  });
};

const usePeriodAction = (rpcName: 'commission_close_period' | 'commission_pay_period' | 'commission_annul_period') => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ periodId, reason }: { periodId: string; reason?: string }) => commissionRpc<void>(rpcName, {
      p_period_id: periodId,
      ...(reason ? { p_reason: reason } : {}),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periods(profile?.company_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.period(profile?.company_id, variables.periodId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.items(profile?.company_id, variables.periodId) });
      const actionMessage = rpcName === 'commission_close_period'
        ? 'Liquidación cerrada'
        : rpcName === 'commission_pay_period' ? 'Liquidación marcada como pagada' : 'Liquidación anulada';
      toast.success(actionMessage);
    },
    onError: (error) => toast.error(`No se pudo completar la acción: ${messageOf(error)}`),
  });
};

export const useCloseCommissionPeriod = () => usePeriodAction('commission_close_period');
export const usePayCommissionPeriod = () => usePeriodAction('commission_pay_period');
export const useAnnulCommissionPeriod = () => usePeriodAction('commission_annul_period');

export const downloadCommissionPdf = async (periodId: string) => {
  const { data, error } = await supabase.functions.invoke('generate-commission-pdf', { body: { period_id: periodId } });
  if (error) throw error;
  if (!(data instanceof Blob)) throw new Error('El generador no devolvió un PDF válido');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `liquidacion-${periodId.slice(0, 8)}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

// ---------------------------------------------------------------------------
// Ajustes de la liquidación (viático, recupero, bonificación, ...) y reporte
// ---------------------------------------------------------------------------

const adjustmentsFrom = () => supabase.from('commission_period_adjustments');
const payableFrom = () => supabase.from('commission_period_payable');

export const useCommissionAdjustments = (periodId: string) => {
  const { profile } = useSimpleAuthContext();
  return useQuery({
    queryKey: queryKeys.adjustments(profile?.company_id, periodId),
    enabled: Boolean(profile?.company_id && periodId),
    retry: false,
    queryFn: async (): Promise<CommissionAdjustment[]> => {
      const { data, error } = await adjustmentsFrom().select('*').eq('period_id', periodId).order('created_at');
      if (error) throw error;
      return (data || []) as unknown as CommissionAdjustment[];
    },
  });
};

export const useCommissionPayable = (periodId: string) => {
  const { profile } = useSimpleAuthContext();
  return useQuery({
    queryKey: queryKeys.payable(profile?.company_id, periodId),
    enabled: Boolean(profile?.company_id && periodId),
    retry: false,
    queryFn: async (): Promise<CommissionPayable | null> => {
      const { data, error } = await payableFrom().select('*').eq('period_id', periodId).maybeSingle();
      if (error) throw error;
      return data as unknown as CommissionPayable | null;
    },
  });
};

const useInvalidateAdjustments = () => {
  const { profile } = useSimpleAuthContext();
  const queryClient = useQueryClient();
  return (periodId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.adjustments(profile?.company_id, periodId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.payable(profile?.company_id, periodId) });
  };
};

export const useAddCommissionAdjustment = () => {
  const invalidate = useInvalidateAdjustments();
  return useMutation({
    mutationFn: (input: CommissionAdjustmentInput) => commissionRpc<CommissionAdjustment>('commission_add_adjustment', {
      p_period_id: input.periodId,
      p_concept: input.concept,
      p_calc_mode: input.calcMode,
      p_amount: input.calcMode === 'amount' ? input.amount ?? null : null,
      p_base_amount: input.calcMode === 'percent' ? input.baseAmount ?? null : null,
      p_percent: input.calcMode === 'percent' ? input.percent ?? null : null,
      p_sign: input.concept === 'otro' ? input.sign ?? null : null,
      p_notes: input.notes?.trim() || null,
    }),
    onSuccess: (_, input) => { invalidate(input.periodId); toast.success('Ajuste agregado'); },
    onError: (error) => toast.error(`No se pudo agregar el ajuste: ${messageOf(error)}`),
  });
};

export const useDeleteCommissionAdjustment = () => {
  const invalidate = useInvalidateAdjustments();
  return useMutation({
    mutationFn: async ({ adjustmentId }: { adjustmentId: string; periodId: string }) => {
      await commissionRpc<void>('commission_delete_adjustment', { p_adjustment_id: adjustmentId });
    },
    onSuccess: (_, variables) => { invalidate(variables.periodId); toast.success('Ajuste eliminado'); },
    onError: (error) => toast.error(`No se pudo eliminar el ajuste: ${messageOf(error)}`),
  });
};

export const useSuggestMaternityAdjustments = () => {
  const invalidate = useInvalidateAdjustments();
  return useMutation({
    mutationFn: (periodId: string) => commissionRpc<number>('commission_suggest_maternity_adjustments', { p_period_id: periodId }),
    onSuccess: (count, periodId) => {
      invalidate(periodId);
      toast.success(count > 0 ? `Se agregaron ${count} adicional(es) por maternidad` : 'No hay ventas con maternidad sin ajuste');
    },
    onError: (error) => toast.error(`No se pudo sugerir: ${messageOf(error)}`),
  });
};

const EXPORT_PAGE_SIZE = 1000; // max_rows de PostgREST: pedir más corta en silencio

/**
 * Trae TODAS las filas de una consulta paginando de a 1000. Sin esto, un período
 * grande o un resumen de varios vendedores se exportaría truncado y el Excel
 * dejaría de coincidir con `commission_period_payable`.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await page(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data || []) as T[];
    all.push(...chunk);
    if (chunk.length < EXPORT_PAGE_SIZE) return all;
  }
}

/**
 * Arma y descarga el `.xlsx` de una o varias liquidaciones. Se importa
 * exceljs recién acá para que no engorde el bundle de las demás pantallas.
 */
export const downloadCommissionXlsx = async (periodIds: string[]) => {
  if (!periodIds.length) throw new Error('No hay liquidaciones para exportar.');
  const [{ data: periods, error: periodsError }, rows, adjustments, { buildLiquidacionWorkbook, liquidacionFileName }] = await Promise.all([
    commissionFrom('commission_periods').select('*').in('id', periodIds),
    fetchAllPages<CommissionExportRow>((from, to) => supabase.rpc('commission_export_rows', { p_period_ids: periodIds }).range(from, to)),
    fetchAllPages<CommissionAdjustment>((from, to) => adjustmentsFrom().select('*').in('period_id', periodIds).order('created_at').order('id').range(from, to)),
    import('@/lib/commissions/exportLiquidacionXlsx'),
  ]);
  if (periodsError) throw periodsError;
  const ordered = periodIds
    .map((id) => (periods || []).find((period) => period.id === id))
    .filter(Boolean) as unknown as CommissionPeriod[];
  if (!ordered.length) throw new Error('No se encontraron las liquidaciones pedidas o no tienes acceso.');
  const buffer = await buildLiquidacionWorkbook({
    periods: ordered,
    rows,
    adjustments,
  });
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = liquidacionFileName(ordered);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
