
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, Download, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';

interface DocumentsManagerProps {
  saleId: string;
}

export const DocumentsManager: React.FC<DocumentsManagerProps> = ({ saleId }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewDocument, setPreviewDocument] = useState<any>(null);

  // Fetch PDF branding images for HTML fallback rendering
  const { data: pdfBranding } = useQuery({
    queryKey: ['pdf-branding-settings', saleId],
    queryFn: async () => {
      // Get company_id from the sale, then fetch branding from company_settings
      const { data: sale } = await supabase.from('sales').select('company_id').eq('id', saleId).single();
      if (!sale?.company_id) return null;
      const { data } = await supabase
        .from('company_settings')
        .select('pdf_header_image_url, pdf_footer_image_url')
        .eq('company_id', sale.company_id)
        .single();
      return data || null;
    },
    enabled: !!saleId,
  });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['sale-detail-documents', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, document_type, created_at, file_url, content, is_final, signed_pdf_url, status, beneficiary_id')
        .eq('sale_id', saleId)
        .neq('document_type', 'firma')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!saleId,
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (document: {
      sale_id: string;
      name: string;
      document_type: string;
      content: string;
      file_url: string;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .insert(document as any)
        .select('id, name, document_type, created_at, file_url')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-detail-documents', saleId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Documento creado',
        description: 'El documento se ha creado exitosamente.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'No se pudo crear el documento.',
        variant: 'destructive',
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-detail-documents', saleId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Documento eliminado',
        description: 'El documento se ha eliminado exitosamente.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el documento.',
        variant: 'destructive',
      });
    },
  });

  const isCreating = createDocumentMutation.isPending;
  const isDeleting = deleteDocumentMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !file) return;

    createDocumentMutation.mutate({
      sale_id: saleId,
      name,
      document_type: file.type,
      content: '',
      file_url: '',
    });

    setName('');
    setFile(null);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este documento?')) {
      deleteDocumentMutation.mutate(id);
    }
  };

  const openHtmlContentWindow = (htmlContent: string, title: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Error', description: 'No se pudo abrir la ventana. Verifica que los pop-ups estén habilitados.', variant: 'destructive' });
      return;
    }
    const headerImg = pdfBranding?.pdf_header_image_url || '';
    const footerImg = pdfBranding?.pdf_footer_image_url || '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        @page { size: A4; margin: 28mm 15mm 25mm 15mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; }
        h1,h2,h3 { margin: 8px 0; }
        .page-header { position: fixed; top: -28mm; left: 0; right: 0; height: 24mm; display: flex; align-items: center; justify-content: center; padding: 2mm 0; }
        .page-header img { max-width: 100%; max-height: 22mm; height: auto; object-fit: contain; }
        .page-footer { position: fixed; bottom: -22mm; left: 0; right: 0; height: 18mm; display: flex; align-items: center; justify-content: center; }
        .page-footer img { max-width: 100%; max-height: 16mm; height: auto; object-fit: contain; }
      </style></head>
      <body>
        ${headerImg ? `<div class="page-header"><img src="${headerImg}" alt="Header" /></div>` : ''}
        ${footerImg ? `<div class="page-footer"><img src="${footerImg}" alt="Footer" /></div>` : ''}
        ${htmlContent}
      </body></html>
    `);
    printWindow.document.close();
  };

  const handleDownload = async (document: { id: string; file_url: string | null; name: string; content?: string | null; signed_pdf_url?: string | null; document_type?: string | null }) => {
    // Tier 1: signed PDF via edge function
    if (document.signed_pdf_url) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          const res = await supabase.functions.invoke('get-document-download-url', {
            body: { document_id: document.id, kind: 'signed' },
          });
          if (res.data?.url) {
            window.open(res.data.url, '_blank', 'noopener,noreferrer');
            return;
          }
        }
      } catch {}
    }

    // Tier 2: file_url from storage
    if (document.file_url) {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.file_url, 3600);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }

    // Tier 3: HTML content (skip firma docs — su content es JSON, no HTML)
    if (document.content && document.document_type !== 'firma') {
      openHtmlContentWindow(document.content, document.name);
      return;
    }

    // Firma electrónica: mostrar info
    if (document.document_type === 'firma' && document.content) {
      try {
        const sig = JSON.parse(document.content);
        const fecha = sig.accepted_at ? new Date(sig.accepted_at).toLocaleString('es-PY') : 'Sin fecha';
        toast({ title: 'Firma electrónica registrada', description: `Aceptada el ${fecha}` });
      } catch {
        toast({ title: 'Firma electrónica', description: 'Registro de firma sin datos adicionales.' });
      }
      return;
    }

    toast({
      title: 'Documento sin archivo',
      description: 'Este documento no tiene un archivo descargable asociado.',
      variant: 'destructive',
    });
  };

  if (isLoading) {
    return <div>Cargando documentos...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Documentos</CardTitle>
            <CardDescription>
              Gestiona los documentos de esta venta
            </CardDescription>
          </div>
          <Button onClick={() => setShowForm(true)} disabled={showForm}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Documento
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="border p-4 rounded-lg bg-muted/50">
            <h3 className="font-semibold mb-4">Nuevo Documento</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nombre del Documento</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del documento"
                  required
                />
              </div>
              <div>
                <Label htmlFor="file">Archivo</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isCreating}>
                  Subir Documento
                </Button>
              </div>
            </form>
          </div>
        )}

        {documents && documents.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>{document.name}</TableCell>
                  <TableCell>{document.document_type}</TableCell>
                  <TableCell>{new Date(document.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={async () => {
                        // Prioridad 1: PDF firmado en Storage
                        if (document.signed_pdf_url) {
                          const [bucket, ...rest] = document.signed_pdf_url.split(':');
                          const path = rest.join(':');
                          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                            return;
                          }
                        }
                        // Prioridad 2: archivo en Storage (anexos, etc.)
                        if (document.file_url) {
                          const { data } = await supabase.storage.from('documents').createSignedUrl(document.file_url, 3600);
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                            return;
                          }
                        }
                        // Prioridad 3: contenido HTML
                        if (document.content) {
                          const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${document.name}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 24px;font-size:13px;line-height:1.6;color:#111}h1,h2,h3{margin:16px 0 8px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px 10px}img{max-width:100%}</style></head><body>${document.content}</body></html>`;
                          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                          return;
                        }
                        toast({ title: 'Sin contenido', description: 'Este documento no tiene contenido disponible.', variant: 'destructive' });
                      }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(document)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(document.id)} disabled={isDeleting}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-center py-4">
            No hay documentos subidos
          </p>
        )}
      </CardContent>
      <DocumentPreviewDialog
        open={!!previewDocument}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
        document={previewDocument}
      />
    </Card>
  );
};
