
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Database } from '@/integrations/supabase/types';

type Sale = Database['public']['Tables']['sales']['Row'] & {
  clients: Database['public']['Tables']['clients']['Row'] | null;
  plans: Database['public']['Tables']['plans']['Row'] | null;
  profiles: Database['public']['Tables']['profiles']['Row'] | null;
  documents: Database['public']['Tables']['documents']['Row'][];
};

export const useSignatureByToken = (token: string) => {
  return useQuery({
    queryKey: ['signature', token],
    queryFn: async () => {
      if (!token) throw new Error('Token is required');


      const { data: sale, error } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email, phone, dni, client_type, razon_social, ruc),
          plans:plan_id(name, price, description),
          profiles:salesperson_id(first_name, last_name, email),
          documents:documents(*)
        `)
        .eq('signature_token', token)
        .gt('signature_expires_at', new Date().toISOString())
        .single();

      if (error) {
        console.error('Error fetching signature data:', error);
        throw error;
      }
      
      return sale as any;
    },
    enabled: !!token,
    retry: 2,
  });
};

export const useCreateSignature = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      saleId, 
      documentId, 
      signatureData 
    }: { 
      saleId: string; 
      documentId: string; 
      signatureData: string; 
    }) => {
      const userAgent = navigator.userAgent;
      
      const { data, error } = await supabase
        .from('signatures')
        .insert({
          sale_id: saleId,
          document_id: documentId,
          signature_data: signatureData,
          user_agent: userAgent,
          status: 'firmado',
          signed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Documento firmado",
        description: "Su firma ha sido registrada exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo registrar la firma.",
        variant: "destructive",
      });
    },
  });
};

export const useCompleteSignature = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string) => {
      const { data, error } = await supabase
        .from('sales')
        .update({
          status: 'firmado',
          signature_token: null,
        })
        .eq('id', saleId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signature'] });
      toast({
        title: "Proceso completado",
        description: "Todos los documentos han sido firmados correctamente.",
      });
    },
  });
};

export const useSignature = () => {
  const { toast } = useToast();

  const submitSignature = useMutation({
    mutationFn: async ({ 
      token, 
      signature, 
      deviceInfo 
    }: { 
      token: string; 
      signature: string; 
      deviceInfo: any; 
    }) => {
      
      // Get sale by token first
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id')
        .eq('signature_token', token)
        .single();

      if (saleError || !sale) {
        throw new Error('Token inválido o expirado');
      }

      // Create signature record
      const { data, error } = await supabase
        .from('signatures')
        .insert({
          sale_id: sale.id,
          signature_data: signature,
          user_agent: deviceInfo.userAgent,
          status: 'firmado',
        })
        .select()
        .single();

      if (error) throw error;
      
      return { success: true, data };
    },
    onSuccess: () => {
      toast({
        title: "Firma enviada",
        description: "Su firma ha sido enviada exitosamente.",
      });
    },
    onError: (error: any) => {
      console.error('Error submitting signature:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar la firma. Inténtelo nuevamente.",
        variant: "destructive",
      });
    },
  });

  return {
    submitSignature,
    isSubmitting: submitSignature.isPending,
  };
};
