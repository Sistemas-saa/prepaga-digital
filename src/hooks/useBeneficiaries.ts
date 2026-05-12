
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';

type Beneficiary = Database['public']['Tables']['beneficiaries']['Row'];
type BeneficiaryInsert = Database['public']['Tables']['beneficiaries']['Insert'];
type BeneficiaryUpdate = Database['public']['Tables']['beneficiaries']['Update'];

// Recalculates sales.total_amount = titular_amount (base plan price) + sum(adherentes amounts)
async function recalculateSaleTotalAmount(saleId: string) {
  // Fetch sale's titular_amount (base price for the primary/plan)
  const { data: sale } = await supabase
    .from('sales')
    .select('titular_amount')
    .eq('id', saleId)
    .single();

  // Fetch all beneficiaries
  const { data: beneficiaries } = await supabase
    .from('beneficiaries')
    .select('amount, is_primary')
    .eq('sale_id', saleId);

  const hasPrimary = (beneficiaries || []).some((b: any) => b.is_primary);

  if (hasPrimary) {
    // If a primary beneficiary exists, use ALL beneficiary amounts (primary + adherentes)
    const totalAmount = (beneficiaries || []).reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
    // Sync titular_amount with primary beneficiary's amount — but only if > 0.
    // If primary has amount=0 (común al crearlo y olvidar el monto), NO pisar titular_amount
    // (preserva el valor existente cargado en SaleBasicTab o desde el plan).
    const primaryAmount = Number((beneficiaries || []).find((b: any) => b.is_primary)?.amount || 0);
    const updatePayload: { titular_amount?: number; total_amount: number } = {
      total_amount: totalAmount,
    };
    if (primaryAmount > 0) {
      updatePayload.titular_amount = primaryAmount;
    }
    await supabase.from('sales').update(updatePayload).eq('id', saleId);
  } else {
    // No primary: use titular_amount as base + sum of adherentes
    const titularBase = Number((sale as any)?.titular_amount || 0);
    const adherentesSum = (beneficiaries || []).reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
    const totalAmount = titularBase + adherentesSum;
    await supabase.from('sales').update({ total_amount: totalAmount }).eq('id', saleId);
  }
}

const invalidateBeneficiaryRelatedQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  saleId: string,
) => {
  queryClient.invalidateQueries({ queryKey: ['beneficiaries', saleId] });
  queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
  queryClient.invalidateQueries({ queryKey: ['sales-list'] });
  queryClient.invalidateQueries({ queryKey: ['sales'] });
};

export const useBeneficiaries = (saleId: string) => {
  return useQuery({
    queryKey: ['beneficiaries', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!saleId,
  });
};

export const useCreateBeneficiary = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (beneficiary: BeneficiaryInsert) => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .insert(beneficiary)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      recalculateSaleTotalAmount(data.sale_id).then(() => {
        invalidateBeneficiaryRelatedQueries(queryClient, data.sale_id);
      });
      toast({
        title: "Beneficiario creado",
        description: "El beneficiario ha sido agregado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el beneficiario.",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateBeneficiary = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: BeneficiaryUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('beneficiaries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      recalculateSaleTotalAmount(data.sale_id).then(() => {
        invalidateBeneficiaryRelatedQueries(queryClient, data.sale_id);
      });
      toast({
        title: "Beneficiario actualizado",
        description: "Los cambios han sido guardados exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el beneficiario.",
        variant: "destructive",
      });
    },
  });
};

export const useDeleteBeneficiary = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: beneficiary } = await supabase
        .from('beneficiaries')
        .select('sale_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('beneficiaries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return beneficiary?.sale_id;
    },
    onSuccess: (saleId) => {
      if (saleId) {
        recalculateSaleTotalAmount(saleId).then(() => {
          invalidateBeneficiaryRelatedQueries(queryClient, saleId);
        });
      }
      toast({
        title: "Beneficiario eliminado",
        description: "El beneficiario ha sido eliminado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el beneficiario.",
        variant: "destructive",
      });
    },
  });
};
