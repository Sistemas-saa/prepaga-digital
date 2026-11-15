import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Eye, 
  Download, 
  FileText, 
  Users,
  RefreshCw,
  Smartphone,
  Monitor,
  Printer,
  Paperclip,
  ExternalLink,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from 'dompurify';
import { 
  createEnhancedTemplateContext, 
  interpolateEnhancedTemplate,
  generateBeneficiariesTable,
} from "@/lib/enhancedTemplateEngine";
import { resolveStorageImages } from "@/lib/resolveStorageImages";

interface TemplateAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
}

interface LiveTemplatePreviewProps {
  content: string;
  templateId?: string;
  sampleData?: {
    client?: any;
    plan?: any;
    company?: any;
    sale?: any;
    beneficiaries?: any[];
    signatureLink?: any;
    responses?: Record<string, any>;
    companySettings?: any;
  };
  className?: string;
  onDownloadPDF?: () => void;
  isGeneratingPDF?: boolean;
}

// Sample data for preview
const defaultSampleData = {
  client: {
    first_name: 'Juan',
    last_name: 'Pérez García',
    email: 'juan.perez@email.com',
    phone: '+54 11 1234-5678',
    dni: '4.567.890',
    address: 'Av. Corrientes 1234, Piso 5',
    city: 'Buenos Aires',
    province: 'Buenos Aires',
    postal_code: 'C1043AAZ',
    birth_date: '1985-03-15',
  },
  plan: {
    name: 'Plan Familiar Premium',
    price: 15000,
    description: 'Cobertura completa para toda la familia',
    coverage_details: 'Consultas médicas, internación, emergencias 24hs',
  },
  company: {
    name: 'Prepaga Digital S.A.',
    email: 'contacto@prepagadigital.com',
    phone: '+54 11 5555-1234',
    address: 'Av. del Libertador 5000, CABA',
    logo_url: '',
    primary_color: '#3B82F6',
  },
  sale: {
    id: 'abc123',
    sale_date: new Date().toISOString(),
    total_amount: 45000,
    status: 'pendiente',
    contract_number: '2026-000001',
    request_number: 'SOL-2026-0001',
    adherents_count: 3,
    notes: 'Cliente VIP',
    immediate_coverage: true,
    sale_type: 'venta_nueva',
  },
  beneficiaries: [
    {
      first_name: 'Juan',
      last_name: 'Pérez García',
      document_number: '30.123.456',
      birth_date: '1985-03-15',
      relationship: 'Titular',
      amount: 20000,
      email: 'juan.perez@email.com',
      phone: '+54 11 1234-5678',
      gender: 'Masculino',
    },
    {
      first_name: 'María',
      last_name: 'González',
      document_number: '32.456.789',
      birth_date: '1988-07-22',
      relationship: 'Cónyuge',
      amount: 15000,
      email: 'maria.gonzalez@email.com',
      gender: 'Femenino',
    },
    {
      first_name: 'Lucas',
      last_name: 'Pérez González',
      document_number: '45.789.012',
      birth_date: '2015-11-10',
      relationship: 'Hijo/a',
      amount: 10000,
      gender: 'Masculino',
    },
  ],
  signatureLink: {
    token: 'abc123xyz',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pendiente',
  },
  responses: {} as Record<string, any>,
  companySettings: undefined as any,
};

export const LiveTemplatePreview: React.FC<LiveTemplatePreviewProps> = ({
  content,
  templateId,
  sampleData = defaultSampleData,
  className = "",
  onDownloadPDF,
  isGeneratingPDF = false,
}) => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile' | 'print'>('desktop');
  const [showRaw, setShowRaw] = useState(false);
  const [annexes, setAnnexes] = useState<TemplateAttachment[]>([]);
  const [annexesLoading, setAnnexesLoading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [resolvedHtml, setResolvedHtml] = useState<string>("");

  // Fetch annexes for this template
  useEffect(() => {
    if (!templateId) return;
    setAnnexesLoading(true);
    supabase
      .from("template_attachments" as any)
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setAnnexes((data as unknown as TemplateAttachment[]) || []);
        setAnnexesLoading(false);
      });
  }, [templateId]);

  const loadSignedUrl = async (annex: TemplateAttachment) => {
    if (signedUrls[annex.id]) return;
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(annex.file_url, 3600);
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [annex.id]: data.signedUrl }));
    }
  };

  const openAnnex = async (annex: TemplateAttachment) => {
    if (signedUrls[annex.id]) {
      window.open(signedUrls[annex.id], '_blank');
      return;
    }
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(annex.file_url, 3600);
    if (data?.signedUrl) {
      setSignedUrls(prev => ({ ...prev, [annex.id]: data.signedUrl }));
      window.open(data.signedUrl, '_blank');
    }
  };

  // Auto-load signed URLs for PDF annexes
  useEffect(() => {
    if (annexes.length === 0) return;
    annexes.forEach(annex => {
      const isPDF = annex.file_type === 'application/pdf' || annex.file_name?.endsWith('.pdf');
      if (isPDF && !signedUrls[annex.id]) {
        loadSignedUrl(annex);
      }
    });
  }, [annexes]);

  // Create context and interpolate content
  const { processedContent, context } = useMemo(() => {
    const data = { ...defaultSampleData, ...sampleData };
    
    const ctx = createEnhancedTemplateContext(
      data.client,
      data.plan,
      data.company,
      data.sale,
      data.beneficiaries,
      data.signatureLink,
      data.responses,
      data.companySettings
    );

    let processed = interpolateEnhancedTemplate(content, ctx);
    
    // Replace beneficiaries table placeholder
    if (processed.includes('{{tabla_beneficiarios}}')) {
      const table = generateBeneficiariesTable(ctx.beneficiarios);
      processed = processed.replace(/\{\{tabla_beneficiarios\}\}/gi, table);
    }

    return { processedContent: processed, context: ctx };
  }, [content, sampleData]);

  // Resolve storage image URLs in processedContent
  useEffect(() => {
    if (!processedContent) {
      setResolvedHtml("");
      return;
    }
    let cancelled = false;
    resolveStorageImages(processedContent).then((html) => {
      if (!cancelled) setResolvedHtml(html);
    });
    return () => { cancelled = true; };
  }, [processedContent]);

  const viewportClasses = {
    desktop: 'w-full',
    mobile: 'max-w-[375px] mx-auto border-x',
    print: 'w-full bg-white shadow-lg',
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Vista Previa en Vivo
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'desktop' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('desktop')}
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'mobile' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('mobile')}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'print' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('print')}
              >
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </div>
            {onDownloadPDF && (
              <Button
                size="sm"
                className="h-7"
                onClick={onDownloadPDF}
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                PDF
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Documento
            </TabsTrigger>
            <TabsTrigger value="data" className="text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Datos de Prueba
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              HTML
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview">
            <ScrollArea className="h-[500px] border rounded-lg">
              <div className={`p-6 ${viewportClasses[viewMode]}`}>
                {(resolvedHtml || processedContent) ? (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(resolvedHtml || processedContent, {
                        ADD_ATTR: ['data-storage-path'],
                      })
                    }}
                  />
                ) : annexes.length > 0 ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Paperclip className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Anexos adjuntos ({annexes.length})</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Este template no tiene contenido del diseñador. Los siguientes anexos se enviarán directamente al cliente.
                    </p>
                    <div className="space-y-4">
                      {annexes.map((annex) => {
                        const isPDF = annex.file_type === 'application/pdf' || annex.file_name?.endsWith('.pdf');
                        const url = signedUrls[annex.id];
                        return (
                          <div key={annex.id} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between bg-muted/50 px-3 py-2 border-b">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                                <span className="text-sm font-medium">{annex.file_name}</span>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => openAnnex(annex)}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                Abrir
                              </Button>
                            </div>
                            {isPDF && url ? (
                              <iframe
                                src={`${url}#toolbar=1&navpanes=0`}
                                className="w-full h-[500px] bg-muted/30"
                                title={annex.file_name}
                              />
                            ) : isPDF && !url ? (
                              <div className="flex flex-col items-center justify-center py-8 gap-2">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                <Button variant="ghost" size="sm" onClick={() => loadSignedUrl(annex)}>
                                  Cargar vista previa del PDF
                                </Button>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                <p>Archivo: {annex.file_type || 'desconocido'}{annex.file_size ? ` • ${(annex.file_size / 1024).toFixed(1)} KB` : ''}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : annexesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>El contenido del template aparecerá aquí</p>
                    <p className="text-xs mt-1">Escribe en el editor para ver la vista previa</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="data">
            <ScrollArea className="h-[500px] border rounded-lg p-4">
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline">Cliente</Badge>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Nombre:</span> {context.cliente.nombreCompleto}</div>
                    <div><span className="text-muted-foreground">{context.cliente.documentoLabel}:</span> {context.cliente.documento || context.cliente.ci || context.cliente.dni}</div>
                    <div><span className="text-muted-foreground">Email:</span> {context.cliente.email}</div>
                    <div><span className="text-muted-foreground">Teléfono:</span> {context.cliente.telefono}</div>
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline">Plan</Badge>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Nombre:</span> {context.plan.nombre}</div>
                    <div><span className="text-muted-foreground">Precio:</span> {context.plan.precioFormateado}</div>
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline">Beneficiarios</Badge>
                    <span className="text-xs text-muted-foreground">({context.beneficiarios.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {context.beneficiarios.map((b, i) => (
                      <div key={i} className="text-xs bg-muted/50 rounded p-2">
                        <div className="font-medium">{b.nombreCompleto}</div>
                        <div className="text-muted-foreground">
                          {b.parentesco} • {b.edad} años • {b.montoFormateado}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Badge variant="outline">Venta</Badge>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Contrato:</span> {context.venta.numeroContrato}</div>
                    <div><span className="text-muted-foreground">Total:</span> {context.venta.totalFormateado}</div>
                    <div><span className="text-muted-foreground">Fecha:</span> {context.venta.fechaFormateada}</div>
                    <div><span className="text-muted-foreground">Estado:</span> {context.venta.estado}</div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw">
            <ScrollArea className="h-[500px] border rounded-lg">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                {processedContent || 'Sin contenido'}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
