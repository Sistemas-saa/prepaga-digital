import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  Minus,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { INCIDENT_MODULES, IncidentPriority, useCreateIncident, useUploadAttachment } from '@/hooks/useIncidents';

const schema = z.object({
  title: z.string().min(5, 'Mínimo 5 caracteres'),
  module: z.string().min(1, 'Selecciona el módulo'),
  priority: z.enum(['baja', 'media', 'alta', 'critica']),
  summary: z.string().min(10, 'Describe brevemente el problema'),
  reproduce: z.string().min(5, 'Indica cómo se reproduce'),
  expected: z.string().min(5, 'Indica qué debería pasar'),
  actual: z.string().min(5, 'Indica qué está pasando'),
  impact: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const PRIORITY_OPTIONS = [
  { value: 'baja', label: 'Baja', icon: <ArrowDown className="h-3.5 w-3.5 text-slate-400" /> },
  { value: 'media', label: 'Media', icon: <Minus className="h-3.5 w-3.5 text-sky-400" /> },
  { value: 'alta', label: 'Alta', icon: <ArrowUp className="h-3.5 w-3.5 text-orange-400" /> },
  { value: 'critica', label: 'Crítica', icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> },
];

interface Props {
  onSuccess?: (id: string) => void;
  onCancel?: () => void;
}

const buildDescription = (values: FormData) =>
  [
    `Resumen: ${values.summary.trim()}`,
    `Pasos: ${values.reproduce.trim()}`,
    `Esperado: ${values.expected.trim()}`,
    `Actual: ${values.actual.trim()}`,
    values.impact?.trim() ? `Impacto: ${values.impact.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');

export const IncidentForm = ({ onSuccess, onCancel }: Props) => {
  const { profile } = useSimpleAuthContext();
  const createIncident = useCreateIncident();
  const uploadAttachment = useUploadAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 'media',
      summary: '',
      reproduce: '',
      expected: '',
      actual: '',
      impact: '',
    },
  });

  const summary = watch('summary');
  const reproduce = watch('reproduce');
  const expected = watch('expected');
  const actual = watch('actual');
  const impact = watch('impact');

  const descriptionPreview = useMemo(
    () =>
      buildDescription({
        title: '',
        module: '',
        priority: 'media',
        summary,
        reproduce,
        expected,
        actual,
        impact,
      }),
    [actual, expected, impact, reproduce, summary],
  );

  const appendFiles = (files: File[]) => {
    const accepted: File[] = [];

    files.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} supera 10MB.`);
        return;
      }
      accepted.push(file);
    });

    if (accepted.length > 0) {
      setPendingFiles((current) => [...current, ...accepted]);
    }
  };

  const handleFileAdd = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const onSubmit = async (data: FormData) => {
    const incident = await createIncident.mutateAsync({
      title: data.title,
      module: data.module,
      priority: data.priority as IncidentPriority,
      description: buildDescription(data),
      company_id: profile?.company_id || undefined,
    });

    const uploadResults = await Promise.allSettled(
      pendingFiles.map((file) => uploadAttachment.mutateAsync({ incidentId: incident.id, file })),
    );

    const failedUploads = uploadResults.filter((result) => result.status === 'rejected').length;

    if (failedUploads > 0) {
      toast.warning(`La incidencia se creó, pero ${failedUploads} archivo(s) no se pudieron subir.`);
    }

    onSuccess?.(incident.id);
  };

  const isLoading = createIncident.isPending || uploadAttachment.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full min-w-0 space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_220px_220px]">
        <div className="min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1">
          <Label htmlFor="title">Título de la incidencia</Label>
          <Input
            id="title"
            placeholder="Ej: Error al generar PDF en ventas"
            className="[overflow-wrap:anywhere]"
            {...register('title')}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label>Módulo afectado</Label>
          <Select onValueChange={(value) => setValue('module', value, { shouldValidate: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar módulo" />
            </SelectTrigger>
            <SelectContent>
              {INCIDENT_MODULES.map((moduleName) => (
                <SelectItem key={moduleName} value={moduleName}>
                  {moduleName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.module && <p className="text-xs text-destructive">{errors.module.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label>Prioridad</Label>
          <Select
            defaultValue="media"
            onValueChange={(value) => setValue('priority', value as IncidentPriority, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((priority) => (
                <SelectItem key={priority.value} value={priority.value}>
                  <span className="flex items-center gap-2">
                    {priority.icon}
                    {priority.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="summary">1. Resumen del problema</Label>
          <Textarea
            id="summary"
            rows={4}
            className="min-h-28 resize-y [overflow-wrap:anywhere]"
            placeholder="Describe en una frase qué está fallando y en qué contexto."
            {...register('summary')}
          />
          {errors.summary && <p className="text-xs text-destructive">{errors.summary.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="reproduce">2. Pasos para reproducir</Label>
          <Textarea
            id="reproduce"
            rows={4}
            className="min-h-28 resize-y [overflow-wrap:anywhere]"
            placeholder="Ej: Abrir venta, ir a Templates, presionar Enviar para firma..."
            {...register('reproduce')}
          />
          {errors.reproduce && <p className="text-xs text-destructive">{errors.reproduce.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expected">3. Resultado esperado</Label>
          <Textarea
            id="expected"
            rows={4}
            className="min-h-28 resize-y [overflow-wrap:anywhere]"
            placeholder="Qué debería pasar si el flujo estuviera correcto."
            {...register('expected')}
          />
          {errors.expected && <p className="text-xs text-destructive">{errors.expected.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="actual">4. Resultado actual</Label>
          <Textarea
            id="actual"
            rows={4}
            className="min-h-28 resize-y [overflow-wrap:anywhere]"
            placeholder="Qué pasó realmente, incluyendo mensajes de error o comportamiento observado."
            {...register('actual')}
          />
          {errors.actual && <p className="text-xs text-destructive">{errors.actual.message}</p>}
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="impact">5. Impacto</Label>
        <Textarea
          id="impact"
          rows={3}
          className="min-h-24 resize-y [overflow-wrap:anywhere]"
          placeholder="Opcional: a quién afecta, si bloquea ventas, auditoría o firma, y urgencia operativa."
          {...register('impact')}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label>Capturas y archivos adjuntos</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="w-full sm:w-auto">
              <Paperclip className="mr-1 h-3.5 w-3.5" />
              Adjuntar
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileAdd}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              appendFiles(Array.from(event.dataTransfer.files || []));
            }}
            className={`flex w-full min-w-0 flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors sm:px-5 sm:py-8 ${
              isDragging
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
            }`}
          >
            <Upload className="h-5 w-5" />
            <span className="max-w-full text-sm font-medium [overflow-wrap:anywhere]">
              Arrastra archivos o haz clic para adjuntar
            </span>
            <span className="max-w-full text-xs [overflow-wrap:anywhere]">
              PNG, JPG, PDF, DOC, DOCX, TXT - máximo 10MB por archivo
            </span>
          </button>

          {pendingFiles.length > 0 && (
            <div className="grid min-w-0 gap-2 md:grid-cols-2">
              {pendingFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeFile(index)} className="rounded-full p-1 hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Vista previa de la descripción</h3>
          </div>
          <pre className="mt-3 max-w-full whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {descriptionPreview || 'Aún no hay suficiente información.'}
          </pre>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
          {isLoading ? (uploadAttachment.isPending ? 'Subiendo adjuntos...' : 'Creando incidencia...') : 'Crear incidencia'}
        </Button>
      </div>
    </form>
  );
};
