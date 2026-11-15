import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';

const ADMIN_ROLES = ['super_admin', 'admin', 'supervisor', 'gestor', 'auditor'];

/**
 * Opciones para los selects del panel de filtros de /sales.
 *
 * Comparte los `queryKey` con `useAnalyticsFilters` a propósito: son exactamente
 * las mismas dos listas, así que moverse entre Analytics y Ventas no vuelve a
 * pegarle a la base.
 *
 * Los vendedores sólo ven sus propias ventas (`useSalesList` filtra por
 * `salesperson_id`), así que para ellos el filtro de vendedor no tiene sentido y
 * ni siquiera se consulta.
 */
export const useSalesFilterOptions = () => {
  const { userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');

  const { data: plans } = useQuery({
    queryKey: ['analytics-filter-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: salespersons } = useQuery({
    queryKey: ['analytics-filter-salespersons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .order('first_name');
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre',
      }));
    },
    enabled: isAdminRole,
    staleTime: 5 * 60 * 1000,
  });

  return {
    plans: plans || [],
    salespersons: salespersons || [],
    isAdminRole,
  };
};
