import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { validateSaleTransition } from '@/lib/workflowValidator';
import type { AppRole } from '@/types/roles';

type SaleStatus = Database['public']['Enums']['sale_status'];

const ROLE_PRIORITY: string[] = ['super_admin', 'admin', 'supervisor', 'auditor', 'financiero', 'gestor', 'vendedor'];

const resolveEffectiveRoleForUser = async (userId?: string | null, fallback: string = 'auditor'): Promise<string> => {
  if (!userId) return fallback;

  const checks = await Promise.all(
    ROLE_PRIORITY.map((role) => supabase.rpc('has_role', { _user_id: userId, _role: role as any }))
  );

  for (let i = 0; i < ROLE_PRIORITY.length; i += 1) {
    if (checks[i]?.data) {
      return ROLE_PRIORITY[i];
    }
  }

  return fallback;
};

export const useAuditProcesses = () => {
  return useQuery({
    queryKey: ['audit-processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_processes')
        .select(`
          *,
          sales:sale_id(
            *,
            clients:client_id(first_name, last_name, email, client_type, razon_social, ruc, dni),
            plans:plan_id(name, price)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

export const useCreateAuditProcess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ saleId, auditorId, notes }: { saleId: string; auditorId: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('audit_processes')
        .insert({
          sale_id: saleId,
          auditor_id: auditorId,
          status: 'pending',
          notes: notes || ''
        })
        .select()
        .single();

      if (error) throw error;

      // Validate workflow transition before updating status
      const { data: sale } = await supabase.from('sales').select('*, template_responses(id)').eq('id', saleId).single();
      if (sale?.company_id) {
        const auditorRole = await resolveEffectiveRoleForUser(auditorId, 'auditor') as AppRole;
        const check = await validateSaleTransition(sale.company_id, sale, 'en_auditoria', auditorRole);
        if (!check.allowed) throw new Error(check.reasons.join(', '));
      }

      // Update sale status to en_auditoria
      await supabase
        .from('sales')
        .update({ status: 'en_auditoria' as SaleStatus })
        .eq('id', saleId);

      // Create process trace
      await supabase
        .from('process_traces')
        .insert({
          sale_id: saleId,
          action: 'audit_started',
          user_id: auditorId,
          details: { audit_process_id: data.id }
        });

      return { process: data, saleId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['audit-processes'] });
      queryClient.invalidateQueries({ queryKey: ['sale', result.saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Proceso de auditoría iniciado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al iniciar proceso de auditoría');
    },
  });
};

export const useUpdateAuditProcess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ processId, status, notes }: { processId: string; status: string; notes?: string }) => {
      // First get the audit process to find sale_id
      const { data: auditProcess, error: fetchError } = await supabase
        .from('audit_processes')
        .select('sale_id')
        .eq('id', processId)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('audit_processes')
        .update({ 
          status,
          notes: notes || '',
          completed_at: status === 'approved' || status === 'rejected' ? new Date().toISOString() : null
        })
        .eq('id', processId)
        .select()
        .single();

      if (error) throw error;

      // Update sale status based on audit result
      let saleStatus: SaleStatus = 'enviado';

      if (status === 'approved') {
        saleStatus = 'aprobado_para_templates' as SaleStatus;
      } else if (status === 'rejected') {
        saleStatus = 'rechazado' as SaleStatus;
      }

      // Validate workflow transition
      const { data: saleData } = await supabase.from('sales').select('*, template_responses(id)').eq('id', auditProcess.sale_id).single();
      if (saleData?.company_id) {
        const { data: currentUser } = await supabase.auth.getUser();
        const currentRole = await resolveEffectiveRoleForUser(currentUser?.user?.id, 'auditor') as AppRole;
        const check = await validateSaleTransition(saleData.company_id, saleData, saleStatus, currentRole);
        if (!check.allowed) throw new Error(check.reasons.join(', '));
      }

      await supabase
        .from('sales')
        .update({ status: saleStatus })
        .eq('id', auditProcess.sale_id);

      // Create process trace
      await supabase
        .from('process_traces')
        .insert({
          sale_id: auditProcess.sale_id,
          action: `audit_${status}`,
          details: { notes }
        });

      return { process: data, saleId: auditProcess.sale_id };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['audit-processes'] });
      queryClient.invalidateQueries({ queryKey: ['sale', result.saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Proceso de auditoría actualizado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al actualizar proceso de auditoría');
    },
  });
};
