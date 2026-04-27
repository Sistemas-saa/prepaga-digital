import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ListFilter,
  Plus,
  Search,
  Tag,
  User,
  UserRoundCheck,
} from 'lucide-react';
import { IncidentPriorityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IncidentPriority,
  IncidentRecord,
  IncidentScope,
  IncidentStatus,
  PRIORITY_LABELS,
  SCOPE_LABELS,
  STATUS_LABELS,
  getIncidentActorName,
  useIncidents,
} from '@/hooks/useIncidents';

const KPI_ORDER: IncidentStatus[] = [
  'nuevo',
  'analisis',
  'pendiente_aprobacion',
  'pendiente_desarrollo',
  'desarrollo',
  'estabilizacion',
  'resuelto',
];

const getEmptyStateMessage = (hasFilters: boolean) =>
  hasFilters ? 'No encontramos incidencias con esos filtros.' : 'Todavía no hay incidencias registradas.';

export default function Incidents() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<IncidentPriority | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<IncidentScope>('all');

  const filters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
      scope: scopeFilter,
      search,
    }),
    [priorityFilter, scopeFilter, search, statusFilter],
  );

  const { data: incidents = [], isLoading } = useIncidents(filters);

  const counts = useMemo(
    () =>
      KPI_ORDER.reduce<Record<IncidentStatus, number>>((accumulator, status) => {
        accumulator[status] = incidents.filter((incident) => incident.status === status).length;
        return accumulator;
      }, {} as Record<IncidentStatus, number>),
    [incidents],
  );

  const hasFilters = statusFilter !== 'all' || priorityFilter !== 'all' || scopeFilter !== 'all' || !!search.trim();

  const highlights = useMemo(() => {
    const unassigned = incidents.filter((incident) => !incident.assigned_to).length;
    const critical = incidents.filter((incident) => incident.priority === 'critica').length;
    const pendingApproval = incidents.filter((incident) => incident.status === 'pendiente_aprobacion').length;

    return { unassigned, critical, pendingApproval };
  }, [incidents]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary">
            <ListFilter className="h-3.5 w-3.5" />
            Centro de seguimiento de incidencias
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Incidencias</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Gestiona reportes, análisis, desarrollo y confirmación de resolución desde una sola vista.
            </p>
          </div>
        </div>

        <Button onClick={() => navigate('/incidents/new')} className="w-full sm:w-auto sm:min-w-44">
          <Plus className="mr-2 h-4 w-4" />
          Nueva incidencia
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total visible</p>
              <p className="mt-2 text-3xl font-semibold">{incidents.length}</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sin asignar</p>
              <p className="mt-2 text-3xl font-semibold">{highlights.unassigned}</p>
            </div>
            <UserRoundCheck className="h-5 w-5 text-sky-400" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Críticas</p>
              <p className="mt-2 text-3xl font-semibold">{highlights.critical}</p>
            </div>
            <AlertCircle className="h-5 w-5 text-red-400" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pend. aprobación</p>
              <p className="mt-2 text-3xl font-semibold">{highlights.pendingApproval}</p>
            </div>
            <Clock3 className="h-5 w-5 text-amber-400" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {KPI_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter((current) => (current === status ? 'all' : status))}
            className={`rounded-2xl border p-4 text-left transition-all ${
              statusFilter === status
                ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                : 'border-border bg-card/70 hover:border-primary/30 hover:bg-card'
            }`}
          >
            <p className="text-3xl font-semibold">{counts[status]}</p>
            <div className="mt-2">
              <IncidentStatusBadge status={status} />
            </div>
          </button>
        ))}
      </div>

      <Card className="border-border/70">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_180px_220px_140px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, módulo, descripción o responsable..."
              className="pl-9"
            />
          </div>

          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as IncidentPriority | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as IncidentScope)}>
            <SelectTrigger>
              <SelectValue placeholder="Vista" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            disabled={!hasFilters}
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setPriorityFilter('all');
              setScopeFilter('all');
            }}
          >
            Limpiar filtros
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">Cargando incidencias...</CardContent>
        </Card>
      ) : incidents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-medium">{getEmptyStateMessage(hasFilters)}</p>
              <p className="text-sm text-muted-foreground">
                {hasFilters
                  ? 'Prueba cambiando filtros o limpiando la búsqueda.'
                  : 'Puedes abrir la primera incidencia y empezar a seguirla desde aquí.'}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/incidents/new')}>
              Crear incidencia
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <IncidentListItem
              key={incident.id}
              incident={incident}
              onOpen={() => navigate(`/incidents/${incident.id}`)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

const IncidentListItem = ({
  incident,
  onOpen,
}: {
  incident: IncidentRecord;
  onOpen: () => void;
}) => {
  const reporter = getIncidentActorName(incident.reported_by_profile, incident.reported_by);
  const assignee = incident.assigned_to
    ? getIncidentActorName(incident.assigned_to_profile, incident.assigned_to)
    : 'Sin asignar';

  return (
    <Card
      className="cursor-pointer border-border/70 transition-all hover:border-primary/30 hover:shadow-lg"
      onClick={onOpen}
    >
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <IncidentStatusBadge status={incident.status} />
              <IncidentPriorityBadge priority={incident.priority} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" />
                {incident.module}
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold leading-tight">{incident.title}</h3>
              <p className="line-clamp-2 text-sm text-muted-foreground">{incident.description}</p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Reportó: {reporter}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRoundCheck className="h-3.5 w-3.5" />
                Responsable: {assignee}
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {incident.incident_comments?.length || 0} comentarios
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div>{incident.id.slice(0, 8)}</div>
            <div className="mt-2 inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {formatDistanceToNow(new Date(incident.updated_at), { addSuffix: true, locale: es })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
