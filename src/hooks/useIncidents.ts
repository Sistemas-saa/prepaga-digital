import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { generateUUID } from '@/lib/utils';

export type IncidentStatus =
  | 'nuevo'
  | 'analisis'
  | 'pendiente_aprobacion'
  | 'pendiente_desarrollo'
  | 'desarrollo'
  | 'estabilizacion'
  | 'resuelto';

export type IncidentPriority = 'baja' | 'media' | 'alta' | 'critica';
export type IncidentScope = 'all' | 'mine' | 'reported' | 'unassigned' | 'approval';
type IncidentInsert = Database['public']['Tables']['incidents']['Insert'];
type IncidentUpdate = Database['public']['Tables']['incidents']['Update'];

export interface IncidentActor {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export interface IncidentAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
}

export interface IncidentComment {
  id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  author_id: string | null;
  author_profile?: IncidentActor | null;
}

export interface IncidentRecord {
  id: string;
  title: string;
  description: string;
  module: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  reported_by: string | null;
  assigned_to: string | null;
  company_id?: string | null;
  analysis_notes?: string | null;
  estimated_hours?: number | null;
  development_started_at?: string | null;
  development_ended_at?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  incident_attachments?: IncidentAttachment[];
  incident_comments?: IncidentComment[];
  reported_by_profile?: IncidentActor | null;
  assigned_to_profile?: IncidentActor | null;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  scope?: IncidentScope;
  search?: string;
}

export const INCIDENT_MODULES = [
  'Dashboard',
  'Ventas',
  'Clientes',
  'Planes',
  'Documentos',
  'Templates',
  'Firma Digital',
  'Analítica',
  'Usuarios',
  'Empresas',
  'Auditoría',
  'Configuración',
  'Adherentes',
  'Pagos',
  'Reportes',
  'Otro',
];

export const STATUS_FLOW: Record<IncidentStatus, IncidentStatus | null> = {
  nuevo: 'analisis',
  analisis: 'pendiente_aprobacion',
  pendiente_aprobacion: 'pendiente_desarrollo',
  pendiente_desarrollo: 'desarrollo',
  desarrollo: 'estabilizacion',
  estabilizacion: 'resuelto',
  resuelto: null,
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  nuevo: 'Nuevo',
  analisis: 'Análisis',
  pendiente_aprobacion: 'Pend. Aprobación',
  pendiente_desarrollo: 'Pend. Desarrollo',
  desarrollo: 'En Desarrollo',
  estabilizacion: 'Estabilización',
  resuelto: 'Resuelto',
};

export const PRIORITY_LABELS: Record<IncidentPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
};

export const SCOPE_LABELS: Record<IncidentScope, string> = {
  all: 'Todas',
  mine: 'Asignadas a mí',
  reported: 'Reportadas por mí',
  unassigned: 'Sin asignar',
  approval: 'Pendientes de mi aprobación',
};

const buildActorLabel = (actor: IncidentActor | null | undefined, fallbackId?: string | null) => {
  const fullName = [actor?.first_name?.trim(), actor?.last_name?.trim()].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (actor?.email?.trim()) return actor.email.trim();
  if (fallbackId) return fallbackId.slice(0, 8);
  return 'Usuario';
};

const normalizeSearch = (value?: string) => value?.trim().toLowerCase() || '';

const parseIncidentDescription = (description: string) => {
  const sections = {
    summary: '',
    reproduce: '',
    expected: '',
    actual: '',
    impact: '',
  };

  const raw = description.trim();
  if (!raw) return sections;

  const patterns = [
    { key: 'summary', labels: ['resumen', 'summary'] },
    { key: 'reproduce', labels: ['pasos', 'steps', 'reproducir'] },
    { key: 'expected', labels: ['esperado', 'expected'] },
    { key: 'actual', labels: ['actual', 'resultado actual'] },
    { key: 'impact', labels: ['impacto', 'impact'] },
  ] as const;

  for (const pattern of patterns) {
    const matchedLine = raw
      .split('\n')
      .map((line) => line.trim())
      .find((line) => pattern.labels.some((label) => line.toLowerCase().startsWith(`${label}:`)));

    if (matchedLine) {
      sections[pattern.key] = matchedLine.split(':').slice(1).join(':').trim();
    }
  }

  if (!Object.values(sections).some(Boolean)) {
    sections.summary = raw;
  }

  return sections;
};

const canTransitionTo = (currentStatus: IncidentStatus, nextStatus: IncidentStatus) => {
  if (currentStatus === nextStatus) return true;
  return STATUS_FLOW[currentStatus] === nextStatus;
};

const validateTransitionPayload = (
  currentStatus: IncidentStatus,
  nextStatus: IncidentStatus,
  updates: Record<string, unknown>,
) => {
  if (!canTransitionTo(currentStatus, nextStatus)) {
    throw new Error(`No se puede pasar de ${STATUS_LABELS[currentStatus]} a ${STATUS_LABELS[nextStatus]}.`);
  }

  if (nextStatus === 'pendiente_aprobacion') {
    if (!String(updates.analysis_notes || '').trim()) {
      throw new Error('Las notas de análisis son obligatorias.');
    }

    if (!Number(updates.estimated_hours || 0)) {
      throw new Error('El tiempo estimado debe ser mayor a 0.');
    }
  }

  if (nextStatus === 'resuelto' && !String(updates.resolution_notes || '').trim()) {
    throw new Error('La confirmación de resolución es obligatoria.');
  }
};

const sanitizeIncidentUpdate = (
  values: { id: string; currentStatus?: IncidentStatus } & Record<string, unknown>,
) => {
  const { id, currentStatus, ...rest } = values;
  const allowedKeys = new Set([
    'status',
    'analysis_notes',
    'estimated_hours',
    'development_started_at',
    'development_ended_at',
    'resolution_notes',
    'resolved_at',
    'assigned_to',
    'priority',
    'title',
    'description',
    'module',
  ]);

  const updates = Object.fromEntries(
    Object.entries(rest).filter(([key, value]) => allowedKeys.has(key) && value !== undefined),
  );

  if (currentStatus && typeof updates.status === 'string') {
    validateTransitionPayload(currentStatus, updates.status as IncidentStatus, updates);
  }

  return { id, updates };
};

const fetchActors = async (ids: string[]) => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, IncidentActor>();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', uniqueIds);

  if (error) throw error;

  return new Map(
    ((data as IncidentActor[] | null) || []).map((profile) => [profile.id, profile]),
  );
};

const enrichIncidents = async (incidents: IncidentRecord[]) => {
  const actorIds = incidents.flatMap((incident) => [
    incident.reported_by || '',
    incident.assigned_to || '',
    ...(incident.incident_comments || []).map((comment) => comment.author_id || ''),
  ]);

  const actors = await fetchActors(actorIds);

  return incidents.map((incident) => ({
    ...incident,
    reported_by_profile: incident.reported_by ? actors.get(incident.reported_by) || null : null,
    assigned_to_profile: incident.assigned_to ? actors.get(incident.assigned_to) || null : null,
    incident_comments: (incident.incident_comments || []).map((comment) => ({
      ...comment,
      author_profile: comment.author_id ? actors.get(comment.author_id) || null : null,
    })),
  }));
};

const isRlsForbiddenError = (error: { code?: string; status?: number; message?: string } | null | undefined) =>
  error?.code === '42501' ||
  error?.status === 401 ||
  error?.status === 403 ||
  error?.message?.toLowerCase().includes('permission denied') ||
  error?.message?.toLowerCase().includes('forbidden');

const fetchIncidentRelations = async (incidentId: string) => {
  const [attachmentsResult, commentsResult] = await Promise.all([
    supabase
      .from('incident_attachments')
      .select('id, file_name, file_url, file_type, file_size, created_at')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('incident_comments')
      .select('id, content, is_internal, created_at, author_id')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true }),
  ]);

  if (attachmentsResult.error && !isRlsForbiddenError(attachmentsResult.error)) {
    throw attachmentsResult.error;
  }
  if (commentsResult.error && !isRlsForbiddenError(commentsResult.error)) {
    throw commentsResult.error;
  }

  // Resolve signed URLs for private incidents bucket
  const rawAttachments = (attachmentsResult.data as IncidentAttachment[] | null) || [];
  const attachmentsWithSignedUrls = await Promise.all(
    rawAttachments.map(async (att) => {
      // If file_url is already a full URL (legacy public data), keep it
      if (att.file_url.startsWith('http')) return att;
      // Generate signed URL (valid 1 hour)
      const { data } = await supabase.storage
        .from('incidents')
        .createSignedUrl(att.file_url, 3600);
      return { ...att, file_url: data?.signedUrl || att.file_url };
    }),
  );

  return {
    incident_attachments: attachmentsWithSignedUrls,
    incident_comments: (commentsResult.data as IncidentComment[] | null) || [],
  };
};

const applyIncidentFilters = (
  incidents: IncidentRecord[],
  filters: IncidentFilters | undefined,
  userId: string | undefined,
) => {
  const search = normalizeSearch(filters?.search);

  return incidents.filter((incident) => {
    if (filters?.status && incident.status !== filters.status) return false;
    if (filters?.priority && incident.priority !== filters.priority) return false;

    if (filters?.scope === 'mine' && incident.assigned_to !== userId) return false;
    if (filters?.scope === 'reported' && incident.reported_by !== userId) return false;
    if (filters?.scope === 'unassigned' && incident.assigned_to) return false;
    if (
      filters?.scope === 'approval' &&
      !(incident.status === 'pendiente_aprobacion' && incident.reported_by === userId)
    ) {
      return false;
    }

    if (!search) return true;

    const haystack = [
      incident.title,
      incident.module,
      incident.description,
      buildActorLabel(incident.reported_by_profile, incident.reported_by),
      buildActorLabel(incident.assigned_to_profile, incident.assigned_to),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });
};

const sortIncidents = (incidents: IncidentRecord[]) =>
  [...incidents].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );

const useIncidentsRealtime = (incidentId?: string) => {
  const queryClient = useQueryClient();
  const { user } = useSimpleAuthContext();

  useEffect(() => {
    if (!user) return undefined;

    const channel = supabase
      .channel(incidentId ? `incidents-${incidentId}` : 'incidents-module')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
        const changedId = (payload.new as { id?: string } | null)?.id || (payload.old as { id?: string } | null)?.id;
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        if (changedId) {
          queryClient.invalidateQueries({ queryKey: ['incident', changedId] });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_comments' }, (payload) => {
        const changedId =
          (payload.new as { incident_id?: string } | null)?.incident_id ||
          (payload.old as { incident_id?: string } | null)?.incident_id;
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        if (changedId) {
          queryClient.invalidateQueries({ queryKey: ['incident', changedId] });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_attachments' }, (payload) => {
        const changedId =
          (payload.new as { incident_id?: string } | null)?.incident_id ||
          (payload.old as { incident_id?: string } | null)?.incident_id;
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        if (changedId) {
          queryClient.invalidateQueries({ queryKey: ['incident', changedId] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [incidentId, queryClient, user]);
};

export const useIncidents = (filters?: IncidentFilters) => {
  const { user } = useSimpleAuthContext();
  useIncidentsRealtime();

  return useQuery({
    queryKey: ['incidents', filters, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const enriched = await enrichIncidents((data as unknown as IncidentRecord[]) || []);
      return sortIncidents(applyIncidentFilters(enriched, filters, user?.id));
    },
    enabled: !!user,
  });
};

export const useIncident = (id: string) => {
  useIncidentsRealtime(id);

  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      const incident = data as unknown as IncidentRecord;
      const relations = await fetchIncidentRelations(id);
      const [enriched] = await enrichIncidents([{ ...incident, ...relations }]);
      return enriched;
    },
    enabled: !!id,
  });
};

export const useCreateIncident = () => {
  const queryClient = useQueryClient();
  const { user, profile } = useSimpleAuthContext();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      module: string;
      priority: IncidentPriority;
      company_id?: string;
    }) => {
      const companyId = data.company_id || profile?.company_id;
      if (!user?.id || !companyId) {
        throw new Error('No se pudo identificar tu usuario o empresa. Vuelve a iniciar sesión.');
      }

      const payload: IncidentInsert = {
        ...data,
        company_id: companyId,
        title: data.title.trim(),
        description: data.description.trim(),
        reported_by: user.id,
        status: 'nuevo' as IncidentStatus,
      };

      const { data: incident, error } = await supabase
        .from('incidents')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return incident as unknown as IncidentRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incidencia creada correctamente');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Error al crear incidencia');
    },
  });
};

export const useUpdateIncident = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: { id: string; currentStatus?: IncidentStatus } & Record<string, unknown>) => {
      const { id, updates } = sanitizeIncidentUpdate(values);

      if (Object.keys(updates).length === 0) {
        throw new Error('No hay cambios válidos para actualizar.');
      }

      const { data, error } = await supabase
        .from('incidents')
        .update(updates as IncidentUpdate)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as IncidentRecord;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident', data.id] });
      toast.success('Incidencia actualizada');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Error al actualizar la incidencia');
    },
  });
};

export const useAddComment = () => {
  const queryClient = useQueryClient();
  const { user } = useSimpleAuthContext();

  return useMutation({
    mutationFn: async ({
      incidentId,
      content,
      isInternal = false,
    }: {
      incidentId: string;
      content: string;
      isInternal?: boolean;
    }) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error('El comentario no puede estar vacío.');
      }

      const { data, error } = await supabase
        .from('incident_comments')
        .insert({
          incident_id: incidentId,
          content: trimmedContent,
          is_internal: isInternal,
          author_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['incident', vars.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Comentario agregado');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Error al agregar comentario');
    },
  });
};

export const useUploadAttachment = () => {
  const queryClient = useQueryClient();
  const { user } = useSimpleAuthContext();

  return useMutation({
    mutationFn: async ({ incidentId, file }: { incidentId: string; file: File }) => {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `incidents/${incidentId}/${Date.now()}-${generateUUID()}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('incidents')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      // Store the storage path (not public URL) since bucket is private
      const { data, error } = await supabase
        .from('incident_attachments')
        .insert({
          incident_id: incidentId,
          file_name: file.name,
          file_url: path,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as IncidentAttachment;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['incident', vars.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Archivo adjuntado');
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Error al subir archivo');
    },
  });
};

export const getIncidentActorName = (
  actor: IncidentActor | null | undefined,
  fallbackId?: string | null,
) => buildActorLabel(actor, fallbackId);

export const getIncidentDescriptionSections = parseIncidentDescription;
