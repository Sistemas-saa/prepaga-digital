
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';
import { canMutateBeneficiaries } from '@/lib/saleUtils';

type Beneficiary = Database['public']['Tables']['beneficiaries']['Row'];
type BeneficiaryInsert = Database['public']['Tables']['beneficiaries']['Insert'];
type BeneficiaryUpdate = Database['public']['Tables']['beneficiaries']['Update'];

/**
 * `sales.total_amount` lo calcula EXCLUSIVAMENTE la base.
 *
 * El trigger `trg_recalculate_sale_total` sobre `beneficiaries` llama a
 * `recalculate_sale_total_amount(sale_id)`, que es la única fuente de verdad
 * (ver migración 20260818000001_fix_total_amount_single_source.sql).
 *
 * Antes este archivo recalculaba el total por su cuenta con una tercera fórmula.
 * Convivía con la del trigger, que ignoraba `titular_amount`, y el resultado
 * final dependía del orden entre ambas escrituras: en test había ventas a las
 * que les faltaba exactamente el monto del titular. No reintroducir el cálculo
 * acá — el trigger corre dentro de la misma sentencia, así que cuando la
 * mutación vuelve el total ya está actualizado y sólo hace falta invalidar.
 */
/**
 * Rechaza la mutación si el contrato ya está firmado.
 *
 * Se hace acá, en el hook, y no sólo en la UI: hasta ahora el bloqueo era una
 * prop `disabled` que apenas ocultaba botones, así que cualquier camino que no
 * pasara por ese componente escribía igual. La base tiene además su propio
 * trigger de respaldo; esta capa existe para dar un mensaje claro en vez de un
 * error de Postgres.
 */
async function assertBeneficiariesMutables(saleId: string) {
  const { data: sale } = await supabase
    .from('sales')
    .select('status')
    .eq('id', saleId)
    .maybeSingle();

  if (!canMutateBeneficiaries(sale)) {
    throw new Error(
      'El contrato ya está firmado: los adherentes no se pueden modificar. ' +
        'Para sumar a alguien usá una Incorporación de Adherente.',
    );
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
      await assertBeneficiariesMutables(beneficiary.sale_id);

      const { data, error } = await supabase
        .from('beneficiaries')
        .insert(beneficiary)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateBeneficiaryRelatedQueries(queryClient, data.sale_id);
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
      const { data: actual } = await supabase
        .from('beneficiaries')
        .select('sale_id')
        .eq('id', id)
        .maybeSingle();
      if (actual?.sale_id) await assertBeneficiariesMutables(actual.sale_id);

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
      invalidateBeneficiaryRelatedQueries(queryClient, data.sale_id);
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
        .maybeSingle();

      if (beneficiary?.sale_id) await assertBeneficiariesMutables(beneficiary.sale_id);

      const { error } = await supabase
        .from('beneficiaries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return beneficiary?.sale_id;
    },
    onSuccess: (saleId) => {
      if (saleId) {
        invalidateBeneficiaryRelatedQueries(queryClient, saleId);
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
