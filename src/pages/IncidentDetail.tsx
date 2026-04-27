import { ReactNode, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  PlayCircle,
  Send,
  StopCircle,
  Tag,
  ThumbsDown,
  ThumbsUp,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { IncidentAttachments } from '@/components/incidents/IncidentAttachments';
import { IncidentComments } from '@/components/incidents/IncidentComments';
import { IncidentPriorityBadge, IncidentStatusBadge } from '@/components/incidents/IncidentStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import {
  IncidentStatus,
  STATUS_LABELS,
  getIncidentActorName,
  getIncidentDescriptionSections,
  useIncident,
  useUpdateIncident,
} from '@/hooks/useIncidents';

const STEPPER_STEPS: IncidentStatus[] = [
  'nuevo',
  'analisis',
  'pendiente_desarrollo',
  'desarrollo',
  'estabilizacion',
  'resuelto',
];

const STEPPER_LABELS: Record<IncidentStatus, string> = {
  nuevo: 'Nuevo',
  analisis: 'Análisis',
  pendiente_aprobacion: 'Pend. Aprobación',
  pendiente_desarrollo: 'Pend. Desarrollo',
  desarrollo: 'En desarrollo',
  estabilizacion: 'Estabilización',
  resuelto: 'Resuelto',
};

const getStepperIndex = (status: IncidentStatus) => {
  if (status === 'pendiente_aprobacion') return 1;
  return STEPPER_STEPS.indexOf(status);
};

const formatDateTime = (value?: string | null) =>
  value ? format(new Date(value), "d MMM yyyy HH:mm", { locale: es }) : 'Sin registro';

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useSimpleAuthContext();
  const { data: incident, isLoading } = useIncident(id || '');
  const updateIncident = useUpdateIncident();

  const [analysisNotes, setAnalysisNotes] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [finishNotes, setFinishNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const canManage = ['super_admin', 'admin', 'gestor'].includes(userRole || '');
  const isReporter = incident?.reported_by === user?.id;
  const currentStepIdx = incident ? getStepperIndex(incident.status) : 0;

  const descriptionSections = useMemo(
    () => getIncidentDescriptionSections(incident?.description || ''),
    [incident?.description],
  );

  const nextAction = useMemo(() => {
    if (!incident) return null;

    switch (incident.status) {
      case 'nuevo':
        return {
          title: 'Tomar para análisis',
          description: 'El equipo TI debe revisar la incidencia, asignarla y preparar el análisis técnico.',
        };
      case 'analisis':
        return {
          title: 'Completar análisis',
          description: 'Agregar causa raíz, propuesta de solución y tiempo estimado antes de enviarla a aprobación.',
        };
      case 'pendiente_aprobacion':
        return {
          title: isReporter ? 'Aprobar o rechazar análisis' : 'Esperando respuesta del reportador',
          description: isReporter
            ? 'Revisa la propuesta técnica y confirma si se puede avanzar a desarrollo.'
            : 'La incidencia ya está analizada. Falta aprobación del usuario que la reportó.',
        };
      case 'pendiente_desarrollo':
        return {
          title: 'Iniciar desarrollo',
          description: 'El análisis fue aprobado. El equipo TI debe confirmar el inicio del trabajo.',
        };
      case 'desarrollo':
        return {
          title: 'Finalizar desarrollo',
          description: 'Registrar el trabajo realizado y mover la incidencia a estabilización.',
        };
      case 'estabilizacion':
        return {
          title: isReporter ? 'Confirmar resolución' : 'Esperando validación del usuario',
          description: isReporter
            ? 'Valida el resultado final y deja constancia de la resolución.'
            : 'La corrección está lista y pendiente de validación por el reportador.',
        };
      case 'resuelto':
        return {
          title: 'Incidencia cerrada',
          description: 'La resolución fue confirmada y el ciclo quedó completo.',
        };
      default:
        return null;
    }
  }, [incident, isReporter]);

  const timelineItems = useMemo(() => {
    if (!incident) return [];

    return [
      { label: 'Creada', value: incident.created_at, icon: Calendar },
      { label: 'Inicio de desarrollo', value: incident.development_started_at, icon: PlayCircle },
      { label: 'Fin de desarrollo', value: incident.development_ended_at, icon: StopCircle },
      { label: 'Resuelta', value: incident.resolved_at, icon: CheckCircle2 },
      { label: 'Última actualización', value: incident.updated_at, icon: Clock },
    ].filter((item) => item.value);
  }, [incident]);

  const runUpdate = async (updates: Record<string, unknown>) => {
    if (!incident) return;
    await updateIncident.mutateAsync({
      id: incident.id,
      currentStatus: incident.status,
      ...updates,
    });
  };

  const handleSubmitAnalysis = async () => {
    if (!incident) return;
    if (!analysisNotes.trim()) {
      toast.error('Escribe las notas del análisis');
      return;
    }

    if (!estimatedHours || Number(estimatedHours) <= 0) {
      toast.error('Ingresa un tiempo estimado válido');
      return;
    }

    await runUpdate({
      analysis_notes: analysisNotes.trim(),
      estimated_hours: Number(estimatedHours),
      status: 'pendiente_aprobacion',
    });
  };

  const handleApproveAnalysis = async () => {
    if (!incident) return;
    await runUpdate({ status: 'pendiente_desarrollo' });
  };

  const handleRejectAnalysis = async () => {
    if (!incident) return;
    await updateIncident.mutateAsync({
      id: incident.id,
      analysis_notes: null,
      estimated_hours: null,
      status: 'analisis',
    });
    toast.info('El análisis volvió a revisión.');
  };

  const handleStartDevelopment = async () => {
    if (!incident) return;
    await runUpdate({
      status: 'desarrollo',
      development_started_at: new Date().toISOString(),
    });
  };

  const handleFinishDevelopment = async () => {
    if (!incident) return;
    await runUpdate({
      status: 'estabilizacion',
      development_ended_at: new Date().toISOString(),
      resolution_notes: finishNotes.trim() || incident.resolution_notes || null,
    });
  };

  const handleConfirmResolved = async () => {
    if (!incident) return;
    if (!resolutionNotes.trim()) {
      toast.error('Describe la validación final antes de cerrar la incidencia');
      return;
    }

    await runUpdate({
      status: 'resuelto',
      resolution_notes: resolutionNotes.trim(),
      resolved_at: new Date().toISOString(),
    });
  };

  const handleAssignToMe = async () => {
    if (!incident || !user) return;
    await updateIncident.mutateAsync({ id: incident.id, assigned_to: user.id });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!incident) {
    return <div className="p-6 text-center text-muted-foreground">Incidencia no encontrada</div>;
  }

  const reporter = getIncidentActorName(incident.reported_by_profile, incident.reported_by);
  const assignee = incident.assigned_to
    ? getIncidentActorName(incident.assigned_to_profile, incident.assigned_to)
    : 'Sin asignar';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/incidents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <IncidentStatusBadge status={incident.status} />
              <IncidentPriorityBadge priority={incident.priority} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" />
                {incident.module}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                {incident.title}
              </h1>
              <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                ID {incident.id.slice(0, 8)} · Reportó {reporter} · Responsable {assignee}
              </p>
            </div>
          </div>
        </div>

        {incident.status !== 'resuelto' && (
          <div className="w-full min-w-0 rounded-2xl border border-primary/20 bg-primary/10 p-4 xl:w-[320px] xl:min-w-80">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Próximo paso</p>
            <h2 className="mt-2 text-lg font-semibold">{nextAction?.title}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {nextAction?.description}
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-4 md:grid-cols-6">
            {STEPPER_STEPS.map((step, index) => (
              <div key={step} className="flex items-center gap-3 md:flex-col md:items-start">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                    index < currentStepIdx
                      ? 'border-primary bg-primary text-primary-foreground'
                      : index === currentStepIdx
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                  }`}
                >
                  {index < currentStepIdx ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{STEPPER_LABELS[step]}</p>
                  {step === 'analisis' && incident.status === 'pendiente_aprobacion' && (
                    <p className="text-xs text-amber-500">Pendiente de aprobación</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen del problema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
                {descriptionSections.summary || incident.description}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock title="Pasos para reproducir" content={descriptionSections.reproduce} fallback="No especificado" />
                <InfoBlock title="Resultado esperado" content={descriptionSections.expected} fallback="No especificado" />
                <InfoBlock title="Resultado actual" content={descriptionSections.actual} fallback="No especificado" />
                <InfoBlock title="Impacto" content={descriptionSections.impact} fallback="No especificado" />
              </div>
            </CardContent>
          </Card>

          {canManage && incident.status === 'analisis' && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-blue-700 dark:text-blue-400">
                  <FileText className="h-4 w-4" />
                  Completar análisis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="analysis_notes">Notas del análisis</Label>
                  <Textarea
                    id="analysis_notes"
                    value={analysisNotes}
                    onChange={(event) => setAnalysisNotes(event.target.value)}
                    placeholder="Causa raíz, alcance de la corrección y plan de trabajo."
                    rows={5}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="estimated_hours">Tiempo estimado (horas)</Label>
                  <Input
                    id="estimated_hours"
                    type="number"
                    min="0.5"
                    step="0.5"
                    className="max-w-40"
                    value={estimatedHours}
                    onChange={(event) => setEstimatedHours(event.target.value)}
                    placeholder="Ej: 3"
                  />
                </div>

                <Button onClick={handleSubmitAnalysis} disabled={updateIncident.isPending} className="w-full">
                  {updateIncident.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar análisis a aprobación
                </Button>
              </CardContent>
            </Card>
          )}

          {incident.analysis_notes && (
            <Card className={incident.status === 'pendiente_aprobacion' ? 'border-amber-300 dark:border-amber-700' : ''}>
              <CardHeader>
                <CardTitle className="text-base">
                  {incident.status === 'pendiente_aprobacion' ? 'Análisis pendiente de aprobación' : 'Análisis técnico'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{incident.analysis_notes}</p>
                {incident.estimated_hours && (
                  <p className="text-sm text-muted-foreground">
                    Tiempo estimado: <strong className="text-foreground">{incident.estimated_hours}h</strong>
                  </p>
                )}

                {incident.status === 'pendiente_aprobacion' && isReporter && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Button
                      className="bg-green-600 text-white hover:bg-green-700"
                      disabled={updateIncident.isPending}
                      onClick={handleApproveAnalysis}
                    >
                      <ThumbsUp className="mr-2 h-4 w-4" />
                      Aprobar análisis
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      disabled={updateIncident.isPending}
                      onClick={handleRejectAnalysis}
                    >
                      <ThumbsDown className="mr-2 h-4 w-4" />
                      Rechazar análisis
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {incident.status === 'pendiente_desarrollo' && (
            <StatusActionCard
              title="Pendiente de inicio de desarrollo"
              description="El análisis fue aprobado. El siguiente paso es confirmar el inicio del trabajo."
              actionLabel="Iniciar desarrollo"
              onAction={canManage ? handleStartDevelopment : undefined}
              actionIcon={<PlayCircle className="mr-2 h-4 w-4" />}
              loading={updateIncident.isPending}
            />
          )}

          {incident.status === 'desarrollo' && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="text-base text-orange-700 dark:text-orange-400">En desarrollo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  El trabajo está en curso. Registra un cierre claro antes de pasarlo a estabilización.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="finish_notes">Notas de finalización</Label>
                  <Textarea
                    id="finish_notes"
                    value={finishNotes}
                    onChange={(event) => setFinishNotes(event.target.value)}
                    placeholder="Qué se corrigió, qué se validó y si queda algo pendiente."
                    rows={4}
                  />
                </div>
                {canManage && (
                  <Button className="w-full bg-orange-600 text-white hover:bg-orange-700" onClick={handleFinishDevelopment}>
                    {updateIncident.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <StopCircle className="mr-2 h-4 w-4" />
                    )}
                    Finalizar desarrollo
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {incident.status === 'estabilizacion' && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="text-base text-purple-700 dark:text-purple-400">
                  Desarrollo finalizado, pendiente de validación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {incident.resolution_notes && (
                  <p className="rounded-xl border border-border/60 bg-muted/30 p-4 whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {incident.resolution_notes}
                  </p>
                )}

                {isReporter ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="resolution_notes">Confirmación de resolución</Label>
                      <Textarea
                        id="resolution_notes"
                        value={resolutionNotes}
                        onChange={(event) => setResolutionNotes(event.target.value)}
                        placeholder="Confirma que el problema quedó resuelto o explica qué observas."
                        rows={4}
                      />
                    </div>

                    <Button className="w-full bg-green-600 text-white hover:bg-green-700" onClick={handleConfirmResolved}>
                      {updateIncident.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <BadgeCheck className="mr-2 h-4 w-4" />
                      )}
                      Confirmar resolución
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Esperando confirmación del usuario que reportó la incidencia.</p>
                )}
              </CardContent>
            </Card>
          )}

          {incident.status === 'resuelto' && incident.resolution_notes && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="text-base text-green-700 dark:text-green-400">Resolución confirmada</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{incident.resolution_notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-5">
              <IncidentAttachments
                incidentId={incident.id}
                attachments={incident.incident_attachments || []}
                canUpload={incident.status !== 'resuelto'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <IncidentComments incidentId={incident.id} comments={incident.incident_comments || []} />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {incident.status !== 'resuelto' && (canManage || isReporter) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acciones rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canManage && !incident.assigned_to && (
                  <Button variant="outline" className="w-full" onClick={handleAssignToMe}>
                    Tomar incidencia
                  </Button>
                )}

                {canManage && incident.status === 'nuevo' && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      updateIncident.mutateAsync({
                        id: incident.id,
                        currentStatus: incident.status,
                        status: 'analisis',
                      })
                    }
                  >
                    Tomar para análisis
                  </Button>
                )}

                <p className="rounded-xl border border-border/60 bg-muted/30 p-3 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {nextAction?.description}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <DetailLine label="Estado" value={STATUS_LABELS[incident.status]} />
              <DetailLine label="Reportado por" value={reporter} icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} />
              <DetailLine label="Asignado a" value={assignee} icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} />
              <DetailLine label="Creado" value={formatDateTime(incident.created_at)} icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />} />
              <DetailLine label="Tiempo estimado" value={incident.estimated_hours ? `${incident.estimated_hours}h` : 'Sin estimación'} icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hitos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {timelineItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full border border-border bg-muted/30 p-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(item.value)}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const InfoBlock = ({
  title,
  content,
  fallback,
}: {
  title: string;
  content?: string;
  fallback: string;
}) => (
  <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/20 p-4">
    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
      {content || fallback}
    </p>
  </div>
);

const DetailLine = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) => (
  <div className="min-w-0">
    <p className="mb-1 text-xs text-muted-foreground">{label}</p>
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="break-words [overflow-wrap:anywhere]">{value}</span>
    </div>
  </div>
);

const StatusActionCard = ({
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  loading,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  loading?: boolean;
}) => (
  <Card className="border-sky-200 dark:border-sky-800">
    <CardHeader>
      <CardTitle className="text-base text-sky-700 dark:text-sky-400">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
      {onAction ? (
        <Button className="w-full bg-sky-600 text-white hover:bg-sky-700" onClick={onAction}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : actionIcon}
          {actionLabel}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Esperando acción del responsable.</p>
      )}
    </CardContent>
  </Card>
);
