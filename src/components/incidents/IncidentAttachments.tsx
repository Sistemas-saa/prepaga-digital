import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Eye, FileText, ImageIcon, Loader2, Paperclip, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { IncidentAttachment, useUploadAttachment } from '@/hooks/useIncidents';
import { supabase } from '@/integrations/supabase/client';

// Extract storage path from legacy storage URLs and keep raw paths untouched.
function extractStoragePath(fileUrl: string): string {
  const marker = '/object/public/incidents/';
  const idx = fileUrl.indexOf(marker);
  if (idx !== -1) return fileUrl.slice(idx + marker.length);
  const signedMarker = '/object/sign/incidents/';
  const signedIdx = fileUrl.indexOf(signedMarker);
  if (signedIdx !== -1) {
    const signedPath = fileUrl.slice(signedIdx + signedMarker.length);
    return signedPath.split('?')[0] || signedPath;
  }
  return fileUrl;
}

interface Props {
  incidentId: string;
  attachments: IncidentAttachment[];
  canUpload?: boolean;
}

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const isImage = (type?: string | null, name?: string) =>
  Boolean(type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(name || ''));

export const IncidentAttachments = ({ incidentId, attachments, canUpload = true }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAttachment();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<IncidentAttachment | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Generate signed URLs for all attachments (bucket is private)
  useEffect(() => {
    if (attachments.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        attachments.map(async (att) => {
          if (att.file_url.startsWith('http')) {
            return [att.id, att.file_url] as const;
          }
          const path = extractStoragePath(att.file_url);
          const { data } = await supabase.storage
            .from('incidents')
            .createSignedUrl(path, 3600);
          return [att.id, data?.signedUrl ?? ''] as const;
        }),
      );
      if (!cancelled) setSignedUrls(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [attachments]);

  const orderedAttachments = useMemo(
    () =>
      [...attachments].sort(
        (left, right) =>
          new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
      ),
    [attachments],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;

    const entries = Array.from(files);

    for (const file of entries) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} supera 10MB.`);
        continue;
      }

      await upload.mutateAsync({ incidentId, file });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Adjuntos ({attachments.length})</h3>
        </div>

        {canUpload && (
          <>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  Adjuntar archivos
                </>
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </>
        )}
      </div>

      {canUpload && (
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
            void handleFiles(event.dataTransfer.files);
          }}
          className={`flex w-full min-w-0 flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
          }`}
        >
          <Upload className="h-5 w-5" />
          <span className="text-sm font-medium">Arrastra archivos aquí o haz clic para subirlos</span>
          <span className="text-xs">Los adjuntos quedan asociados a esta incidencia.</span>
        </button>
      )}

      {orderedAttachments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Esta incidencia todavía no tiene archivos adjuntos.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orderedAttachments.map((attachment) => {
            const image = isImage(attachment.file_type, attachment.file_name);
            const displayUrl = signedUrls[attachment.id] ?? '';

            return (
              <div key={attachment.id} className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
                {image ? (
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => setSelectedAttachment(attachment)}
                  >
                    <img
                      src={displayUrl}
                      alt={attachment.file_name}
                      className="h-40 w-full object-cover transition-opacity hover:opacity-90"
                    />
                  </button>
                ) : (
                  <div className="flex h-40 items-center justify-center bg-background/40">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}

                <div className="space-y-3 p-4">
                  <div className="flex min-w-0 items-start gap-2">
                    {image ? (
                      <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{attachment.file_name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(attachment.file_size)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedAttachment(attachment)}
                    >
                      <Eye className="mr-2 h-3.5 w-3.5" />
                      Ver
                    </Button>
                    <Button asChild size="sm" className="flex-1" disabled={!displayUrl}>
                      <a href={displayUrl} target="_blank" rel="noreferrer">
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Abrir
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedAttachment && (
        <ImageLightbox
          open={!!selectedAttachment}
          onOpenChange={(open) => {
            if (!open) setSelectedAttachment(null);
          }}
          src={signedUrls[selectedAttachment.id] ?? ''}
          alt={selectedAttachment.file_name}
          fileName={selectedAttachment.file_name}
          fileType={selectedAttachment.file_type || undefined}
        />
      )}
    </div>
  );
};
