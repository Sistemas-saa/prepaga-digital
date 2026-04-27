
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { validateSaleTransition } from '@/lib/workflowValidator';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { generateUUID } from '@/lib/utils';
import { getSignatureLinkUrl } from '@/lib/appUrls';

const ADMIN_ROLES = ['super_admin', 'admin', 'supervisor', 'gestor', 'auditor'];

type Sale = Database['public']['Tables']['sales']['Row'];
type SaleInsert = Database['public']['Tables']['sales']['Insert'];
type SaleUpdate = Database['public']['Tables']['sales']['Update'];

// Extended Sale type with new token revocation properties
type ExtendedSale = Sale & {
  token_revoked?: boolean;
  token_revoked_at?: string;
  token_revoked_by?: string;
  clients?: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    dni?: string;
  };
  plans?: {
    name: string;
    price: number;
    description?: string;
    coverage_details?: any;
  };
  salesperson?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  companies?: {
    name: string;
  };
  templates?: {
    name: string;
    description?: string;
  };
  template_responses?: Array<{ id: string }>;
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
  };
};

interface SalesListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  enabled?: boolean;
}

interface PaginatedSalesResult {
  sales: ExtendedSale[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const invalidateSalesCaches = (queryClient: ReturnType<typeof useQueryClient>, saleId?: string) => {
  queryClient.invalidateQueries({ queryKey: ['sales'] });
  queryClient.invalidateQueries({ queryKey: ['sales-list'] });
  queryClient.invalidateQueries({ queryKey: ['sales-lookup'] });
  if (saleId) {
    queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
  }
};

export const useSales = () => {
  const { user, userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');

  return useQuery({
    queryKey: ['sales', user?.id, userRole],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email, phone, dni),
          plans:plan_id(name, price, description, coverage_details),
          companies:company_id(name),
          templates:template_id(name, description),
          documents(id),
          sale_documents(id)
        `)
        .order('created_at', { ascending: false });

      // Vendedores only see their own sales
      if (!isAdminRole && user?.id) {
        query = query.eq('salesperson_id', user.id);
      }

      const { data: salesData, error: salesError } = await query;
      if (salesError) throw salesError;

      const salespersonIds = [...new Set(salesData?.map(s => s.salesperson_id).filter(Boolean))];
      const profilesPromise = salespersonIds.length > 0
        ? supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', salespersonIds)
        : Promise.resolve({ data: [], error: null } as const);

      const [{ data: profiles, error: profilesError }] = await Promise.all([profilesPromise]);

      if (profilesError) throw profilesError;

      const profilesMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, any>);

      return (salesData || []).map(sale => ({
        ...sale,
        salesperson: sale.salesperson_id ? profilesMap[sale.salesperson_id] : null,
        profiles: sale.salesperson_id ? profilesMap[sale.salesperson_id] : null
      })) as unknown as ExtendedSale[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

export function useSalesList(enabled?: boolean): UseQueryResult<ExtendedSale[]>;
export function useSalesList(params: SalesListParams): UseQueryResult<PaginatedSalesResult>;
export function useSalesList(paramsOrEnabled: SalesListParams | boolean = {}) {
  const { user, userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');
  const params = typeof paramsOrEnabled === 'boolean'
    ? { enabled: paramsOrEnabled }
    : paramsOrEnabled;
  const {
    page,
    pageSize = 25,
    search = '',
    status,
    enabled = true,
  } = params;
  const isPaginated = typeof page === 'number';

  return useQuery({
    queryKey: ['sales-list', user?.id, userRole, page ?? 'all', pageSize, search, status ?? 'all'],
    queryFn: async () => {
      let salesQuery = supabase
        .from('sales')
        .select(`
          id,
          contract_number,
          status,
          total_amount,
          created_at,
          signature_expires_at,
          salesperson_id,
          company_id,
          clients:client_id(first_name, last_name, email),
          plans:plan_id(name)
        `)
        .order('created_at', { ascending: false });
      let countQuery = supabase
        .from('sales')
        .select('id', { count: 'exact', head: true });

      if (!isAdminRole && user?.id) {
        salesQuery = salesQuery.eq('salesperson_id', user.id);
        countQuery = countQuery.eq('salesperson_id', user.id);
      }

      if (status && status !== 'todos') {
        salesQuery = salesQuery.eq('status', status as any);
        countQuery = countQuery.eq('status', status as any);
      }

      if (search.trim()) {
        const term = search.trim();
        const pattern = `%${term}%`;
        salesQuery = salesQuery.ilike('contract_number', pattern);
        countQuery = countQuery.ilike('contract_number', pattern);
      }

      if (isPaginated) {
        const from = Math.max(((page || 1) - 1) * pageSize, 0);
        const to = from + pageSize - 1;
        salesQuery = salesQuery.range(from, to);
      }

      const countPromise = isPaginated
        ? countQuery
        : Promise.resolve({ count: 0, error: null } as const);

      const [{ data, error }, { count, error: countError }] = await Promise.all([
        salesQuery,
        countPromise,
      ]);

      if (error) throw error;
      if (countError) throw countError;

      if (!isPaginated) {
        return data as unknown as ExtendedSale[];
      }

      return {
        sales: (data || []) as unknown as ExtendedSale[],
        total: count || 0,
        page: page || 1,
        pageSize,
        totalPages: Math.max(Math.ceil((count || 0) / pageSize), 1),
      } as PaginatedSalesResult;
    },
    enabled: !!user && enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: isPaginated ? (previous) => previous : undefined,
  });
};

export const useSalesLookup = (enabled = true) => {
  const { user, userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');

  return useQuery({
    queryKey: ['sales-lookup', user?.id, userRole],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          id,
          contract_number,
          clients:client_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (!isAdminRole && user?.id) {
        query = query.eq('salesperson_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ExtendedSale[];
    },
    enabled: !!user && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

export const useCreateSale = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleData: SaleInsert) => {
      const { data, error } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateSalesCaches(queryClient);
      toast({
        title: "Venta creada",
        description: "La venta ha sido creada exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la venta.",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateSale = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: SaleUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateSalesCaches(queryClient, data.id);
      toast({
        title: "Venta actualizada",
        description: "Los cambios han sido guardados exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la venta.",
        variant: "destructive",
      });
    },
  });
};

export const useDeleteSale = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSalesCaches(queryClient);
      toast({
        title: "Venta eliminada",
        description: "La venta ha sido eliminada exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la venta.",
        variant: "destructive",
      });
    },
  });
};

export const useGenerateQuestionnaireLink = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string) => {
      // First get the sale to check if it has a template
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email),
          templates:template_id(name, question_count:template_questions(count))
        `)
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;
      
      if (!sale.template_id) {
        throw new Error('Esta venta no tiene un cuestionario asociado. Asigne un template primero.');
      }

      // Check if token is revoked
      const saleWithTokenInfo = sale as ExtendedSale;
      const tokenRevoked = saleWithTokenInfo.token_revoked === true;

      // Generate or reuse existing token (only if not revoked)
      let token = sale.signature_token;
      let expiresAtString = sale.signature_expires_at;

      if (!token || !expiresAtString || new Date(expiresAtString) < new Date() || tokenRevoked) {
        // Validate workflow transition before updating status
        if (sale.company_id) {
          const { data: currentUser } = await supabase.auth.getUser();
          const { data: userRoleData } = await supabase.rpc('get_user_role', { _user_id: currentUser?.user?.id || '' });
          const check = await validateSaleTransition(sale.company_id, sale, 'enviado', (userRoleData as any) || 'vendedor');
          if (!check.allowed) throw new Error(check.reasons.join(', '));
        }

        token = generateUUID();
        const expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + 7); // Expires in 7 days
        expiresAtString = expiresAtDate.toISOString();

        const { error: updateError } = await supabase
          .from('sales')
          .update({
            signature_token: token,
            signature_expires_at: expiresAtString,
            status: 'enviado'
          } as any) // Using 'as any' to bypass type checking for new fields
          .eq('id', saleId);

        if (updateError) throw updateError;
      }

      const questionnaireUrl = `${window.location.origin}/questionnaire/${token}`;
      
      return { sale: saleWithTokenInfo, questionnaireUrl, token };
    },
    onSuccess: (data) => {
      invalidateSalesCaches(queryClient, data.sale.id);
      
      // Copy to clipboard
      navigator.clipboard.writeText(data.questionnaireUrl);
      
      toast({
        title: "Enlace del cuestionario generado",
        description: "El enlace ha sido copiado al portapapeles y está listo para enviar al cliente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo generar el enlace del cuestionario.",
        variant: "destructive",
      });
    },
  });
};

export const useGenerateSignatureLink = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string) => {
      // Check if questionnaire needs to be completed first and validate token status
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email, phone),
          plans:plan_id(name, price),
          templates:template_id(name),
          template_responses(id)
        `)
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;

      // Fetch salesperson profile separately
      let salesperson = null;
      if (sale.salesperson_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', sale.salesperson_id)
          .single();
        salesperson = profile;
      }

      const saleWithTokenInfo = { ...sale, salesperson, profiles: salesperson } as unknown as ExtendedSale;

      // If there's a template but no responses, require questionnaire completion
      if (sale.template_id && (!sale.template_responses || sale.template_responses.length === 0)) {
        throw new Error('El cliente debe completar el cuestionario antes de firmar. Genere y envíe primero el enlace del cuestionario.');
      }

      // Check if current token is revoked or expired
      const tokenRevoked = saleWithTokenInfo.token_revoked === true;
      const needsNewToken = !sale.signature_token || 
                           tokenRevoked || 
                           (sale.signature_expires_at && new Date(sale.signature_expires_at) < new Date());

      let token = sale.signature_token;
      let expiresAt = sale.signature_expires_at;
      let updatedSale = saleWithTokenInfo;

      if (needsNewToken) {
        // Validate workflow transition before updating status
        if (sale.company_id) {
          const { data: currentUser } = await supabase.auth.getUser();
          const { data: userRoleData } = await supabase.rpc('get_user_role', { _user_id: currentUser?.user?.id || '' });
          const check = await validateSaleTransition(sale.company_id, sale, 'enviado', (userRoleData as any) || 'vendedor');
          if (!check.allowed) throw new Error(check.reasons.join(', '));
        }

        token = generateUUID();
        const expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + 7); // Expires in 7 days
        expiresAt = expiresAtDate.toISOString();

        const { data: newSale, error } = await supabase
          .from('sales')
          .update({
            signature_token: token,
            signature_expires_at: expiresAt,
            status: 'enviado'
          } as any) // Using 'as any' to bypass type checking for new fields
          .eq('id', saleId)
          .select(`
            *,
            clients:client_id(first_name, last_name, email, phone),
            plans:plan_id(name, price)
          `)
          .single();

        if (error) throw error;
        updatedSale = { ...newSale, salesperson, profiles: salesperson } as unknown as ExtendedSale;
      }
      
      const signatureUrl = getSignatureLinkUrl(token);
      
      return { sale: updatedSale, signatureUrl };
    },
    onSuccess: (data) => {
      invalidateSalesCaches(queryClient, data.sale.id);
      
      // Copy to clipboard
      navigator.clipboard.writeText(data.signatureUrl);
      
      toast({
        title: "Enlace de firma generado",
        description: "El enlace ha sido copiado al portapapeles. Envíelo al cliente para que complete la firma.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo generar el enlace de firma.",
        variant: "destructive",
      });
    },
  });
};

export const useRevokeSignatureToken = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason: string }) => {
      // Validate workflow transition before revoking
      const { data: saleForValidation } = await supabase.from('sales').select('*, template_responses(id)').eq('id', saleId).single();
      if (saleForValidation?.company_id) {
        const { data: currentUser } = await supabase.auth.getUser();
        const { data: userRoleData } = await supabase.rpc('get_user_role', { _user_id: currentUser?.user?.id || '' });
        const check = await validateSaleTransition(saleForValidation.company_id, saleForValidation, 'cancelado', (userRoleData as any) || 'vendedor');
        if (!check.allowed) throw new Error(check.reasons.join(', '));
      }

      // Update sales table directly with token revocation info
      const { data, error } = await supabase
        .from('sales')
        .update({
          status: 'cancelado'
        } as any) // Using 'as any' to bypass type checking for new fields
        .eq('id', saleId)
        .select()
        .single();

      if (error) throw error;
      
      return { saleId, reason };
    },
    onSuccess: (_, variables) => {
      invalidateSalesCaches(queryClient, variables.saleId);
      
      toast({
        title: "Token revocado",
        description: "El token de firma ha sido revocado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo revocar el token de firma.",
        variant: "destructive",
      });
    },
  });
};

// Nueva función para validar el estado de una venta antes de generar enlaces
export const useValidateSaleForSignature = () => {
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { data: sale, error } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id(first_name, last_name, email),
          plans:plan_id(name, price),
          templates:template_id(name),
          template_responses(id)
        `)
        .eq('id', saleId)
        .single();

      if (error) throw error;

      const saleWithTokenInfo = sale as ExtendedSale;
      const tokenRevoked = saleWithTokenInfo.token_revoked === true;
      const tokenExpired = sale.signature_expires_at && new Date(sale.signature_expires_at) < new Date();

      const validation = {
        hasClient: !!sale.client_id,
        hasPlan: !!sale.plan_id,
        hasTemplate: !!sale.template_id,
        hasQuestionnaireResponses: sale.template_responses && sale.template_responses.length > 0,
        readyForQuestionnaire: !!sale.client_id && !!sale.plan_id && !!sale.template_id,
        readyForSignature: !!sale.client_id && !!sale.plan_id && (!sale.template_id || (sale.template_responses && sale.template_responses.length > 0)),
        tokenIsValid: sale.signature_token && !tokenRevoked && !tokenExpired,
        tokenRevoked,
        tokenExpired
      };

      return { sale: saleWithTokenInfo, validation };
    }
  });
};
