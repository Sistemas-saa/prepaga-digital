
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter, MoreHorizontal, FileText, Eye, Edit, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { useSalesList, useDeleteSale, type SalesListFilters } from '@/hooks/useSales';
import { useSalesFilterOptions } from '@/hooks/useSalesFilterOptions';
import { SalesFiltersPanel } from '@/components/sales/SalesFiltersPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { formatDateOnly } from '@/lib/dateOnly';
import { getVigencia, VIGENCIA_LABELS, type EstadoVigencia } from '@/lib/vigencia';
import RequireAuth from '@/components/RequireAuth';
import { useEffect, useState } from 'react';
import { useStateTransition } from '@/hooks/useStateTransition';
import { ALL_SALE_STATUSES, SALE_STATUS_LABELS, type SaleStatus } from '@/types/workflow';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { useSaleProgressConfig } from '@/hooks/useSaleProgressConfig';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const Sales = () => {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [filters, setFilters] = useState<SalesListFilters>({});
  // La busqueda ahora se resuelve en el servidor: sin debounce, cada tecla es un query.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { plans, salespersons, isAdminRole } = useSalesFilterOptions();
  const { data: salesPage, isLoading } = useSalesList({
    page,
    pageSize: 25,
    status: statusFilter,
    search: debouncedSearch,
    ...filters,
  });
  const queryClient = useQueryClient();
  const deleteSale = useDeleteSale();
  const { canViewState, canEditState } = useStateTransition();
  const { profile } = useSimpleAuthContext();
  const { getProgress } = useSaleProgressConfig();
  const sales = salesPage?.sales || [];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch, filters]);

  // Fetch document counts per sale
  const saleIds = sales.map(s => s.id);
  const { data: documentCountsData } = useQuery({
    queryKey: ['sales-document-counts', saleIds],
    queryFn: async () => {
      if (saleIds.length === 0) return {};
      const { data } = await supabase
        .from('documents')
        .select('sale_id')
        .in('sale_id', saleIds)
        .neq('document_type', 'firma');
      const map: Record<string, number> = {};
      (data || []).forEach(doc => {
        map[doc.sale_id] = (map[doc.sale_id] || 0) + 1;
      });
      return map;
    },
    enabled: saleIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });


  const visibleSales = sales.filter((sale) =>
    canViewState((sale.status || 'borrador') as SaleStatus)
  );

  // El filtrado real (busqueda, estado y el resto de los filtros) lo hace el
  // servidor en useSalesList: hacerlo aca, sobre la pagina de 25 ya traida,
  // devolveria paginas semivacias y un total que no coincide con las filas.
  // Lo unico que queda en memoria es el control de permisos por estado.
  const filteredSales = visibleSales;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'firmado':
      case 'completado':
        return 'default';
      case 'enviado':
      case 'en_auditoria':
      case 'pendiente':
        return 'secondary';
      case 'borrador':
        return 'outline';
      case 'cancelado':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      firmado: 'Firmado',
      completado: 'Completado',
      enviado: 'Enviado',
      borrador: 'Borrador',
      cancelado: 'Cancelado',
      en_auditoria: 'En Auditoría',
      pendiente: 'Pendiente',
      rechazado: 'Rechazado',
      aprobado_para_templates: 'Aprobado',
    };
    return map[status] || status;
  };

  const getProgressColor = (progress: number): string => {
    if (progress >= 95) return 'bg-green-500';
    if (progress >= 60) return 'bg-blue-500';
    if (progress >= 30) return 'bg-yellow-500';
    return 'bg-muted-foreground/50';
  };

  // `created_at` es timestamptz: se formatea con el reloj del navegador.
  // Las fechas date-only (contract_end_date) van por `formatDateOnly`, que las
  // parte en componentes en vez de pasarlas por new Date() — bug conocido #1.
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-PY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getVigenciaBadgeClass = (estado: EstadoVigencia): string => {
    switch (estado) {
      case 'vigente':
        return 'bg-green-600 hover:bg-green-600/90 text-white border-transparent';
      case 'por_vencer':
        return 'bg-amber-500 hover:bg-amber-500/90 text-white border-transparent';
      case 'vencido':
        return 'bg-destructive hover:bg-destructive/90 text-destructive-foreground border-transparent';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <RequireAuth>
        <Layout title="Ventas" description="Gestión de ventas">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </Layout>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <Layout title="Administra todos tus contratos y documentos" description="">
        <div className="space-y-6">
          {/* Header con búsqueda y filtros */}
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número de contrato o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SalesFiltersPanel
                value={filters}
                onChange={setFilters}
                plans={plans}
                salespersons={salespersons}
                showSalesperson={isAdminRole}
              />

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {ALL_SALE_STATUSES
                    .filter((state) => canViewState(state))
                    .map((state) => (
                      <SelectItem key={state} value={state}>
                        {SALE_STATUS_LABELS[state]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link to="/sales/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Contrato
                </Link>
              </Button>
            </div>
          </div>

          {/* Tabla de contratos */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">CONTRATO</TableHead>
                      <TableHead className="font-semibold">CLIENTE</TableHead>
                      <TableHead className="font-semibold">ESTADO</TableHead>
                      <TableHead className="font-semibold">VIGENCIA</TableHead>
                      <TableHead className="font-semibold">MONTO</TableHead>
                      <TableHead className="font-semibold">PROGRESO</TableHead>
                      <TableHead className="font-semibold">DOCUMENTOS</TableHead>
                      <TableHead className="font-semibold">FECHA</TableHead>
                      <TableHead className="font-semibold text-center">ACCIONES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.length > 0 ? (
                      filteredSales.map((sale) => (
                        <TableRow key={sale.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium text-primary">
                                {sale.contract_number || `CON-${sale.id?.slice(-4)}`}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {sale.plans?.name || 'Sin plan'}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {sale.clients?.first_name} {sale.clients?.last_name}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {sale.clients?.email}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            {(() => {
                              const displayStatus = sale.all_signatures_completed ? 'completado' : (sale.status || 'borrador');
                              return (
                                <Badge variant={getStatusBadgeVariant(displayStatus)} className={displayStatus === 'completado' ? 'bg-green-600' : ''}>
                                  {getStatusText(displayStatus)}
                                </Badge>
                              );
                            })()}
                          </TableCell>

                          <TableCell>
                            {(() => {
                              const vigencia = getVigencia(sale);
                              if (vigencia.estado === 'sin_definir') {
                                return <span className="text-muted-foreground">—</span>;
                              }
                              return (
                                <div className="space-y-1">
                                  <Badge className={getVigenciaBadgeClass(vigencia.estado)}>
                                    {VIGENCIA_LABELS[vigencia.estado]}
                                  </Badge>
                                  <div className="text-sm text-muted-foreground">
                                    {vigencia.label}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>

                          <TableCell>
                            <div className="font-semibold">
                              {formatCurrency(sale.total_amount || 0)}
                            </div>
                            <div className="text-sm text-muted-foreground">PYG</div>
                          </TableCell>

                          <TableCell>
                            {(() => {
                              // Hybrid: if all signatures completed, show 100% regardless of status
                              const progress = sale.all_signatures_completed
                                ? 100
                                : getProgress(sale.status || 'borrador');
                              return (
                                <div className="space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span>{progress}%</span>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                      className={`${getProgressColor(progress)} h-2 rounded-full transition-all`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{documentCountsData?.[sale.id] || 0}</span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {formatDate(sale.created_at)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Vence: {sale.contract_end_date ? formatDateOnly(sale.contract_end_date) : 'No definido'}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={`/sales/${sale.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Ver Detalles
                                  </Link>
                                </DropdownMenuItem>
                                {canEditState((sale.status || 'borrador') as SaleStatus) ? (
                                  <DropdownMenuItem asChild>
                                    <Link to={`/sales/${sale.id}/edit`}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      Editar
                                    </Link>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem disabled>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edición bloqueada por estado/rol
                                  </DropdownMenuItem>
                                )}
                                {sale.salesperson_id === profile?.id && ['borrador', 'rechazado'].includes(sale.status || '') && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Eliminar
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar esta venta?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Esta acción no se puede deshacer. Se eliminará la venta y todos sus datos asociados.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteSale.mutate(sale.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Eliminar
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12">
                          <div className="space-y-4">
                            <p className="text-muted-foreground">
                              {searchTerm || statusFilter !== 'todos'
                                ? 'No se encontraron contratos con los filtros aplicados'
                                : 'No hay contratos registrados'
                              }
                            </p>
                            <Button asChild>
                              <Link to="/sales/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Crear Primer Contrato
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {salesPage && salesPage.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Página {salesPage.page} de {salesPage.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={salesPage.page <= 1}
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={salesPage.page >= salesPage.totalPages}
                      onClick={() => setPage((prev) => Math.min(prev + 1, salesPage.totalPages))}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Layout>
    </RequireAuth>
  );
};

export default Sales;
