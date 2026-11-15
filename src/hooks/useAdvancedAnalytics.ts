import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { excludeIncorporationSales } from '@/lib/saleFilters';

const ADMIN_ROLES = ['super_admin', 'admin', 'supervisor', 'gestor', 'auditor'];

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AnalyticsFilters {
  companyId?: string;
  planId?: string;
  salespersonId?: string;
}

export interface AnalyticsData {
  salesTrend: Array<{ name: string; ventas: number; ingresos: number }>;
  conversionFunnel: Array<{ name: string; value: number; fill: string }>;
  performanceByUser: Array<{
    name: string;
    odeName: string;
    ventas: number;
    conversion: number;
    revenue: number;
    userId: string;
  }>;
  topPlans: Array<{ name: string; count: number; revenue: number }>;
  companyComparison: Array<{ name: string; ventas: number; ingresos: number }>;
  timeToClose: Array<{ period: string; avgDays: number }>;
  kpis: {
    conversionRate: number;
    avgTicket: number;
    customerLifetime: number;
    churnRate: number;
    monthlyRecurring: number;
    totalSales: number;
    completedSales: number;
    totalRevenue: number;
  };
}

function buildPeriods(from: Date, to: Date): Array<{ start: Date; end: Date; name: string }> {
  const periods: Array<{ start: Date; end: Date; name: string }> = [];
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 31) {
    // Weekly buckets for short ranges
    let current = new Date(from);
    let weekNum = 1;
    while (current < to) {
      const weekEnd = new Date(Math.min(current.getTime() + 6 * 24 * 60 * 60 * 1000, to.getTime()));
      periods.push({
        start: new Date(current),
        end: weekEnd,
        name: `Sem ${weekNum}`,
      });
      current = new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000);
      weekNum++;
    }
  } else {
    // Monthly buckets
    let current = startOfMonth(from);
    const endLimit = endOfMonth(to);
    while (current <= endLimit) {
      const monthEnd = endOfMonth(current);
      periods.push({
        start: new Date(current),
        end: monthEnd > to ? to : monthEnd,
        name: format(current, 'MMM yyyy', { locale: es }),
      });
      current = startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    }
  }

  return periods;
}

export const useAdvancedAnalytics = (dateRange: DateRange, filters: AnalyticsFilters) => {
  const { user, userRole } = useSimpleAuthContext();
  const isAdminRole = ADMIN_ROLES.includes(userRole || '');

  return useQuery({
    queryKey: ['advanced-analytics', dateRange.from.toISOString(), dateRange.to.toISOString(), filters, user?.id, userRole],
    queryFn: async (): Promise<AnalyticsData> => {
      const periods = buildPeriods(dateRange.from, dateRange.to);

      // Build sales query with filters
      let salesQuery = supabase
        .from('sales')
        .select(`
          *,
          clients(first_name, last_name),
          plans(name, price),
          companies(name)
        `)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      // Las operaciones de incorporación de adherente no cuentan como ventas.
      salesQuery = excludeIncorporationSales(salesQuery);

      // Role-based scoping: vendedores only see their own sales
      if (!isAdminRole && user?.id) {
        salesQuery = salesQuery.eq('salesperson_id', user.id);
      }

      // Apply filters
      if (filters.companyId) {
        salesQuery = salesQuery.eq('company_id', filters.companyId);
      }
      if (filters.planId) {
        salesQuery = salesQuery.eq('plan_id', filters.planId);
      }
      if (filters.salespersonId) {
        salesQuery = salesQuery.eq('salesperson_id', filters.salespersonId);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // Fetch profiles for real names
      const salespersonIds = [...new Set((salesData || []).map(s => s.salesperson_id).filter(Boolean))];
      let profilesMap: Record<string, string> = {};

      if (salespersonIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', salespersonIds as string[]);

        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Sales trend
      const salesTrend = periods.map(period => {
        const periodSales = salesData?.filter(sale =>
          isWithinInterval(new Date(sale.created_at!), { start: period.start, end: period.end })
        ) || [];

        return {
          name: period.name,
          ventas: periodSales.length,
          ingresos: periodSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0),
        };
      });

      // Conversion funnel
      const statusCounts = salesData?.reduce((acc, sale) => {
        const status = sale.status || 'borrador';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const totalSalesCount = salesData?.length || 0;
      const conversionFunnel = [
        { name: 'Borradores', value: statusCounts['borrador'] || 0, fill: '#1e3a5f' },
        { name: 'En revisión', value: (statusCounts['en_revision'] || 0) + (statusCounts['en_auditoria'] || 0), fill: '#334155' },
        { name: 'Enviados', value: statusCounts['enviado'] || 0, fill: '#475569' },
        { name: 'Firmados', value: (statusCounts['firmado'] || 0) + (statusCounts['firmado_parcial'] || 0), fill: '#64748b' },
        { name: 'Completados', value: statusCounts['completado'] || 0, fill: '#3b82f6' },
      ];

      // Performance by user with real names
      const userPerformance: Record<string, { totalSales: number; completedSales: number; revenue: number }> =
        salesData?.reduce((acc, sale) => {
          const userId = sale.salesperson_id;
          if (userId) {
            if (!acc[userId]) {
              acc[userId] = { totalSales: 0, completedSales: 0, revenue: 0 };
            }
            acc[userId].totalSales++;
            if (sale.status === 'completado') {
              acc[userId].completedSales++;
              acc[userId].revenue += sale.total_amount || 0;
            }
          }
          return acc;
        }, {} as Record<string, { totalSales: number; completedSales: number; revenue: number }>) ?? {};

      const performanceByUser = Object.entries(userPerformance)
        .map(([userId, data]) => ({
          userId,
          name: profilesMap[userId] || `ID: ${userId.slice(0, 8)}`,
          odeName: profilesMap[userId] || userId,
          ventas: data.totalSales,
          conversion: data.totalSales > 0 ? Math.round((data.completedSales / data.totalSales) * 100) : 0,
          revenue: data.revenue,
        }))
        .sort((a, b) => b.ventas - a.ventas)
        .slice(0, 10);

      // Top plans
      const planPerformance: Record<string, { count: number; revenue: number }> =
        salesData?.reduce((acc, sale) => {
          if (sale.plans) {
            const planName = (sale.plans as any).name;
            if (!acc[planName]) {
              acc[planName] = { count: 0, revenue: 0 };
            }
            acc[planName].count++;
            acc[planName].revenue += sale.total_amount || 0;
          }
          return acc;
        }, {} as Record<string, { count: number; revenue: number }>) ?? {};

      const topPlans = Object.entries(planPerformance)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      // Company comparison
      const companyPerformance: Record<string, { ventas: number; ingresos: number }> =
        salesData?.reduce((acc, sale) => {
          if (sale.companies) {
            const companyName = (sale.companies as any).name;
            if (!acc[companyName]) {
              acc[companyName] = { ventas: 0, ingresos: 0 };
            }
            acc[companyName].ventas++;
            acc[companyName].ingresos += sale.total_amount || 0;
          }
          return acc;
        }, {} as Record<string, { ventas: number; ingresos: number }>) ?? {};

      const companyComparison = Object.entries(companyPerformance)
        .map(([name, data]) => ({ name, ventas: data.ventas, ingresos: data.ingresos }))
        .sort((a, b) => b.ingresos - a.ingresos);

      // Time to close
      const timeToClose = periods.map(period => {
        const periodCompleted = salesData?.filter(sale =>
          sale.status === 'completado' &&
          isWithinInterval(new Date(sale.created_at!), { start: period.start, end: period.end })
        ) || [];

        const avgDays = periodCompleted.length > 0
          ? Math.round(periodCompleted.reduce((sum, sale) => {
            const created = new Date(sale.created_at!);
            const updated = new Date(sale.updated_at || sale.created_at!);
            return sum + Math.max(1, Math.round((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
          }, 0) / periodCompleted.length)
          : 0;

        return { period: period.name, avgDays };
      });

      // KPIs
      const totalSales = salesData?.length || 0;
      const completedSales = salesData?.filter(s => s.status === 'completado').length || 0;
      const canceledSales = salesData?.filter(s => s.status === 'cancelado').length || 0;
      const totalRevenue = salesData?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;

      const kpis = {
        conversionRate: totalSales > 0 ? Math.round((completedSales / totalSales) * 100) : 0,
        avgTicket: completedSales > 0 ? Math.round(totalRevenue / completedSales) : 0,
        customerLifetime: completedSales > 0 ? Math.round(totalRevenue / Math.max(1, completedSales)) : 0,
        churnRate: totalSales > 0 ? Math.round((canceledSales / totalSales) * 100) : 0,
        monthlyRecurring: Math.round(totalRevenue / Math.max(1, periods.length)),
        totalSales,
        completedSales,
        totalRevenue,
      };

      return {
        salesTrend,
        conversionFunnel,
        performanceByUser,
        topPlans,
        companyComparison,
        timeToClose,
        kpis,
      };
    },
    retry: 1,
    
    enabled: !!user,
  });
};

// Hook for comparison period data
export const useComparisonAnalytics = (dateRange: DateRange, filters: AnalyticsFilters, enabled: boolean) => {
  // Calculate previous period of same length
  const diffMs = dateRange.to.getTime() - dateRange.from.getTime();
  const prevFrom = new Date(dateRange.from.getTime() - diffMs);
  const prevTo = new Date(dateRange.from.getTime() - 1); // day before current start

  const prevRange: DateRange = { from: prevFrom, to: prevTo };

  const result = useAdvancedAnalytics(prevRange, filters);

  return {
    ...result,
    isEnabled: enabled,
    previousRange: prevRange,
  };
};

// Presets for date range
export const DATE_RANGE_PRESETS = [
  { label: '7 días', value: '7d', getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: '30 días', value: '30d', getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: '3 meses', value: '3m', getRange: () => ({ from: subMonths(new Date(), 3), to: new Date() }) },
  { label: '6 meses', value: '6m', getRange: () => ({ from: subMonths(new Date(), 6), to: new Date() }) },
  { label: '12 meses', value: '12m', getRange: () => ({ from: subMonths(new Date(), 12), to: new Date() }) },
  { label: 'Año actual', value: 'ytd', getRange: () => ({ from: startOfYear(new Date()), to: new Date() }) },
] as const;
