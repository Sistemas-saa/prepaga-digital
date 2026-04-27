import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Filter, Lock, MessageSquare, SendHorizonal } from 'lucide-react';
import { useSimpleAuthContext } from '@/components/SimpleAuthProvider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { IncidentComment, getIncidentActorName, useAddComment } from '@/hooks/useIncidents';

interface Props {
  incidentId: string;
  comments: IncidentComment[];
}

export const IncidentComments = ({ incidentId, comments }: Props) => {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [visibility, setVisibility] = useState<'all' | 'public' | 'internal'>('all');
  const addComment = useAddComment();
  const { userRole } = useSimpleAuthContext();

  const canAddInternal = ['super_admin', 'admin', 'gestor'].includes(userRole || '');

  const visibleComments = useMemo(() => {
    const ordered = [...comments].sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );

    if (visibility === 'public') {
      return ordered.filter((comment) => !comment.is_internal);
    }

    if (visibility === 'internal') {
      return ordered.filter((comment) => comment.is_internal);
    }

    return ordered;
  }, [comments, visibility]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await addComment.mutateAsync({ incidentId, content, isInternal });
    setContent('');
    setIsInternal(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Comentarios ({comments.length})</h3>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={visibility} onValueChange={(value) => setVisibility(value as 'all' | 'public' | 'internal')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="public">Solo visibles</SelectItem>
              <SelectItem value="internal">Solo internos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visibleComments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No hay comentarios para esta vista.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleComments.map((comment) => (
            <div
              key={comment.id}
              className={`min-w-0 rounded-2xl border p-4 ${
                comment.is_internal
                  ? 'border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-50'
                  : 'border-border/60 bg-muted/20'
              }`}
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                    {getIncidentActorName(comment.author_profile, comment.author_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
                  </p>
                </div>

                {comment.is_internal && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 px-2 py-1 text-xs">
                    <Lock className="h-3 w-3" />
                    Nota interna
                  </span>
                )}
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="incident-comment">Agregar comentario</Label>
          <Textarea
            id="incident-comment"
            rows={4}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Escribe una actualización clara para el equipo o el usuario."
          />
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {canAddInternal ? (
            <div className="flex items-center gap-2">
              <Switch id="incident-comment-internal" checked={isInternal} onCheckedChange={setIsInternal} />
              <Label htmlFor="incident-comment-internal" className="cursor-pointer text-xs text-muted-foreground">
                Guardar como nota interna
              </Label>
            </div>
          ) : (
            <div />
          )}

          <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || addComment.isPending}>
            {addComment.isPending ? 'Enviando...' : <><SendHorizonal className="mr-2 h-3.5 w-3.5" />Comentar</>}
          </Button>
        </div>
      </div>
    </div>
  );
};
