
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { excludeIncorporationSales } from '@/lib/saleFilters';

const ADMIN_ROLES = ['super_admin', 'admin', 'supervisor', 'gestor'];

export const useDashboardStats = () => {
  const { user, userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');

  return useQuery({
    queryKey: ['dashboard-stats', user?.id, userRole],
    queryFn: async () => {
      try {
        const currentDate = new Date();
        const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        const salespersonFilter = !isAdminRole && user?.id
          ? { salesperson_id: user.id }
          : null;

        const buildSalesCountQuery = (status?: string, dateFrom?: string, dateTo?: string) => {
          let query = supabase
            .from('sales')
            .select('id', { count: 'exact', head: true });

          // Las incorporaciones de adherente no son ventas: no se cuentan.
          query = excludeIncorporationSales(query);

          if (salespersonFilter) {
            query = query.eq('salesperson_id', salespersonFilter.salesperson_id);
          }
          if (status) {
            query = query.eq('status', status as any);
          }
          if (dateFrom) {
            query = query.gte('created_at', dateFrom);
          }
          if (dateTo) {
            query = query.lt('created_at', dateTo);
          }

          return query;
        };

        let salesRevenueQuery = excludeIncorporationSales(supabase
          .from('sales')
          .select('total_amount'));

        let recentSalesQuery = excludeIncorporationSales(supabase
          .from('sales')
          .select(`
            id,
            total_amount,
            status,
            created_at,
            clients:client_id(first_name, last_name, client_type, razon_social, ruc, dni),
            plans:plan_id(name),
            companies:company_id(name)
          `)
          .order('created_at', { ascending: false })
          .limit(5));

        let recentClientsQuery = supabase
          .from('clients')
          .select('id, first_name, last_name, email, created_at')
          .order('created_at', { ascending: false })
          .limit(5);

        if (salespersonFilter) {
          salesRevenueQuery = salesRevenueQuery.eq('salesperson_id', salespersonFilter.salesperson_id);
          recentSalesQuery = recentSalesQuery.eq('salesperson_id', salespersonFilter.salesperson_id);
        }

        const clientCountQuery = isAdminRole
          ? supabase.from('clients').select('id', { count: 'exact', head: true })
          : excludeIncorporationSales(supabase
              .from('sales')
              .select('client_id')
              .eq('salesperson_id', user!.id)
              .not('client_id', 'is', null));

        const [
          usersResult,
          companiesResult,
          totalSalesResult,
          completedSalesResult,
          signedSalesResult,
          draftSalesResult,
          sentSalesResult,
          cancelledSalesResult,
          revenueResult,
          recentSalesResult,
          recentClientsResult,
          clientCountResult,
          signedDocsResult,
          completedLinksResult,
          pendingLinksResult,
          currentMonthSalesResult,
          lastMonthSalesResult,
          currentMonthClientsResult,
          lastMonthClientsResult,
          currentMonthDocsResult,
          lastMonthDocsResult,
        ] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('companies').select('id', { count: 'exact', head: true }),
          buildSalesCountQuery(),
          buildSalesCountQuery('completado'),
          buildSalesCountQuery('firmado'),
          buildSalesCountQuery('borrador'),
          buildSalesCountQuery('enviado'),
          buildSalesCountQuery('cancelado'),
          salesRevenueQuery,
          recentSalesQuery,
          recentClientsQuery,
          clientCountQuery,
          supabase.from('documents').select('id', { count: 'exact', head: true }).not('signed_at', 'is', null),
          supabase.from('signature_links').select('id', { count: 'exact', head: true }).eq('status', 'completado'),
          supabase.from('signature_links').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
          buildSalesCountQuery(undefined, currentMonthStart.toISOString()),
          buildSalesCountQuery(undefined, lastMonthStart.toISOString(), currentMonthStart.toISOString()),
          isAdminRole
            ? supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', currentMonthStart.toISOString())
            : Promise.resolve({ count: 0, error: null } as const),
          isAdminRole
            ? supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', lastMonthStart.toISOString()).lt('created_at', currentMonthStart.toISOString())
            : Promise.resolve({ count: 0, error: null } as const),
          supabase.from('documents').select('id', { count: 'exact', head: true }).not('signed_at', 'is', null).gte('signed_at', currentMonthStart.toISOString()),
          supabase.from('documents').select('id', { count: 'exact', head: true }).not('signed_at', 'is', null).gte('signed_at', lastMonthStart.toISOString()).lt('signed_at', currentMonthStart.toISOString()),
        ]);

        const results = [
          usersResult,
          companiesResult,
          totalSalesResult,
          completedSalesResult,
          signedSalesResult,
          draftSalesResult,
          sentSalesResult,
          cancelledSalesResult,
          revenueResult,
          recentSalesResult,
          recentClientsResult,
          clientCountResult,
          signedDocsResult,
          completedLinksResult,
          pendingLinksResult,
          currentMonthSalesResult,
          lastMonthSalesResult,
          currentMonthClientsResult,
          lastMonthClientsResult,
          currentMonthDocsResult,
          lastMonthDocsResult,
        ];

        const firstError = results.find((result) => 'error' in result && result.error)?.error;
        if (firstError) throw firstError;

        const totalSales = totalSalesResult.count || 0;
        const completedSales = (completedSalesResult.count || 0) + (signedSalesResult.count || 0);
        const pendingSales = (draftSalesResult.count || 0) + (sentSalesResult.count || 0);
        const canceledSales = cancelledSalesResult.count || 0;
        const totalRevenue = revenueResult.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
        const totalClients = isAdminRole
          ? clientCountResult.count || 0
          : [...new Set((clientCountResult.data || []).map((sale) => sale.client_id).filter(Boolean))].length;
        const signedDocuments = Math.max(signedDocsResult.count || 0, completedLinksResult.count || 0);
        const pendingSignatures = pendingLinksResult.count || 0;
        const recentSales = recentSalesResult.data || [];
        const recentClients = recentClientsResult.data || [];

        const salesByStatus = {
          completado: completedSalesResult.count || 0,
          firmado: signedSalesResult.count || 0,
          borrador: draftSalesResult.count || 0,
          enviado: sentSalesResult.count || 0,
          cancelado: canceledSales,
        };

        const currentMonthSales = currentMonthSalesResult.count || 0;
        const lastMonthSales = lastMonthSalesResult.count || 0;
        const salesGrowth = lastMonthSales > 0
          ? Math.round(((currentMonthSales - lastMonthSales) / lastMonthSales) * 100)
          : 0;

        const currentMonthClients = currentMonthClientsResult.count || 0;
        const lastMonthClients = lastMonthClientsResult.count || 0;
        const clientsGrowth = lastMonthClients > 0
          ? Math.round(((currentMonthClients - lastMonthClients) / lastMonthClients) * 100)
          : 0;

        const currentMonthDocs = currentMonthDocsResult.count || 0;
        const lastMonthDocs = lastMonthDocsResult.count || 0;
        const documentsGrowth = lastMonthDocs > 0
          ? Math.round(((currentMonthDocs - lastMonthDocs) / lastMonthDocs) * 100)
          : 0;

        return {
          usersCount: usersResult.count || 0,
          companiesCount: companiesResult.count || 0,
          totalClients,
          totalSales,
          totalRevenue,
          completedSales,
          pendingSales,
          canceledSales,
          signedDocuments,
          pendingSignatures,
          recentSales,
          recentClients,
          salesByStatus,
          salesGrowth,
          clientsGrowth,
          documentsGrowth,
        };
      } catch (error) {
        console.error('Dashboard stats error:', error);
        throw error;
      }
    },
    enabled: !!user,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};
