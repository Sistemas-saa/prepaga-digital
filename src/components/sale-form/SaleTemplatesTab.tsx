import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, FileSignature, Plus, Trash2, Lock, Send, Loader2, Eye, FileText, User, ChevronDown, ChevronUp, Paperclip, ExternalLink, RefreshCw } from 'lucide-react';
import { PrintVersionsPanel } from '@/components/documents/PrintVersionsPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplates } from '@/hooks/useTemplates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveStorageImages } from '@/lib/resolveStorageImages';
import { generateUUID } from '@/lib/utils';
import { toast } from 'sonner';
import { useBeneficiaries } from '@/hooks/useBeneficiaries';
import { validateSaleTransition } from '@/lib/workflowValidator';
import { DocumentPreviewDialog } from '@/components/documents/DocumentPreviewDialog';
import { useRolePermissions } from '@/hooks/useRolePermissions';

interface SaleTemplatesTabProps {
  saleId?: string;
  auditStatus?: string;
  saleStatus?: string;
  disabled?: boolean;
}

const normalizeAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const isDDJJTemplate = (template: { name?: string; template_type?: string; document_type?: string }): boolean => {
  const norm = normalizeAccents(template.name || '');
  return norm.includes('declaracion') ||
    norm.includes('ddjj') ||
    template.template_type === 'ddjj_salud' ||
    template.document_type === 'ddjj_salud';
};

/** Determine document type badge from name */
const getTemplateTypeBadge = (name: string) => {
  const norm = normalizeAccents(name);
  if (norm.includes('ddjj') || norm.includes('declaracion')) {
    return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">DDJJ</Badge>;
  }
  if (norm.includes('contrato')) {
    return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px]">Contrato</Badge>;
  }
  return <Badge variant="outline" className="text-gray-600 border-gray-300 bg-gray-50 text-[10px]">Anexo</Badge>;
};

const getDocStatusBadge = (status: string) => {
  switch (status) {
    case 'firmado':
      return <Badge className="bg-green-600 text-[10px]">Firmado</Badge>;
    case 'pendiente':
      return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
};

const isAnexoPlanName = (value?: string | null) => {
  const lower = (value || '').toLowerCase();
  return lower.includes('anexo plan') || (lower.includes('anexo') && lower.includes('plan'));
};

const normalizeResponsePlaceholder = (value?: string | null): string => {
  if (!value) return '';
  let normalized = value.trim();
  if (normalized.startsWith('{{') && normalized.endsWith('}}')) {
    normalized = normalized.slice(2, -2).trim();
  }
  if (normalized.startsWith('respuestas.')) {
    normalized = normalized.replace(/^respuestas\./, '');
  }
  return normalized;
};

// Formatea el valor de una respuesta para el documento. Las preguntas tipo 'date'
// se guardan como YYYY-MM-DD (input date) y se muestran como dd/MM/yyyy, igual que
// el resto de los contratos. Parseo por split (no new Date()) para evitar el
// corrimiento de un día por timezone (bug conocido #1).
const formatResponseValue = (value: any, questionType?: string | null): any => {
  if (questionType === 'date' && typeof value === 'string') {
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return value;
};

const insertDocumentsWithFallback = async (documents: Record<string, any>[]) => {
  if (documents.length === 0) return;

  const { error } = await supabase.from('documents').insert(documents as any);
  if (!error) return;

  console.error('[DocGen] Bulk document insert failed, retrying sequentially:', error);

  for (const document of documents) {
    const { error: singleError } = await supabase.from('documents').insert(document as any);
    if (singleError) {
      console.error(`[DocGen] Error inserting "${document.name}":`, singleError);
      throw singleError;
    }
  }
};

/**
 * Borra los documentos generados desde plantilla que todavía NO están finalizados,
 * para que regenerar/reenviar sea idempotente. NUNCA borra documentos con is_final = true
 * (esos ya tienen firma y/o PDF sellado).
 *
 * Filtros de seguridad (defensa en profundidad) aplicados a TODOS los deletes:
 *  - generated_from_template = true  → solo documentos que este flujo puede recrear
 *  - status <> 'firmado'             → nunca borra un documento ya firmado
 *  - document_type <> 'firma'        → nunca borra los documentos de firma
 *  - signed_pdf_url IS NULL          → nunca borra un documento con PDF sellado (PAdES)
 *  - signature_data IS NULL          → nunca borra un documento con datos de firma
 *  - signed_at IS NULL               → nunca borra un documento con fecha de firma
 *
 * ⚠️ Las guardas `signature_data` / `signed_at` NO son redundantes: son load-bearing.
 * Cierran la ventana de carrera del sellado PAdES. `finalize-signature-link` sella las
 * DDJJ de adherente aunque tengan is_final false/null, y `pades-sign-document` recién al
 * final setea `signed_pdf_url` y `status = 'firmado'`. Entre que el adherente firma y que
 * PAdES termina, el documento queda is_final=false / status='pendiente' /
 * signed_pdf_url=null → sin estas dos guardas sería borrable y se perdería evidencia de
 * una firma REAL. No quitarlas.
 */
const deleteUnsignedGeneratedDocuments = async (saleId: string) => {
  const baseDelete = () =>
    supabase
      .from('documents')
      .delete()
      .eq('sale_id', saleId)
      .eq('generated_from_template', true)
      .neq('status', 'firmado' as any)
      // Endurecimiento respecto del código original: los documentos de tipo 'firma'
      // y los que ya tienen PDF sellado quedan siempre fuera del borrado.
      .neq('document_type', 'firma')
      .is('signed_pdf_url', null)
      // Load-bearing (ver comentario del bloque de arriba): cierran la ventana en la que
      // un documento ya firmado todavía no fue sellado por PAdES.
      .is('signature_data', null)
      .is('signed_at', null);

  // 1) Documentos generados que todavía no están finalizados.
  const notFinalResult = await baseDelete().is('is_final', false);

  // 2) Anexos: se insertan con is_final = true por diseño, así que el filtro anterior
  //    no los alcanza. Siguen protegidos por status / signed_pdf_url.
  const annexResult = await baseDelete().eq('document_type', 'anexo');

  return { notFinalResult, annexResult };
};

const buildSignatureLinkPayload = ({
  saleId,
  recipientType,
  recipientEmail,
  recipientPhone,
  beneficiaryId,
  expirationDays = 1,
}: {
  saleId: string;
  recipientType: string;
  recipientEmail?: string;
  recipientPhone?: string;
  beneficiaryId?: string;
  expirationDays?: number;
}) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  return {
    sale_id: saleId,
    token: generateUUID(),
    recipient_type: recipientType,
    recipient_email: recipientEmail || '',
    recipient_phone: recipientPhone || null,
    recipient_id: beneficiaryId || null,
    expires_at: expiresAt.toISOString(),
    status: 'pendiente',
  };
};

const SaleTemplatesTab: React.FC<SaleTemplatesTabProps> = ({ saleId, auditStatus, saleStatus, disabled }) => {
  const navigate = useNavigate();
  const { templates } = useTemplates();
  const queryClient = useQueryClient();
  const { isAdmin, isSuperAdmin, role } = useRolePermissions();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerandoPdf, setRegenerandoPdf] = useState<string | null>(null);
  const [showDocuments, setShowDocuments] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [needsRegeneration, setNeedsRegeneration] = useState(false);
  const { data: beneficiaries } = useBeneficiaries(saleId || '');
  const [annexSignedUrls, setAnnexSignedUrls] = useState<Record<string, string>>({});
  const [expandedAnnexes, setExpandedAnnexes] = useState<Record<string, boolean>>({});
  const regenerateActionRef = useRef<HTMLDivElement | null>(null);
  // Guarda síncrona contra doble clic (el estado `sending` sólo frena tras el re-render)
  const sendingRef = useRef(false);

  const isPrivilegedRole = isAdmin || isSuperAdmin;
  const canViewPrintVersions = isAdmin || isSuperAdmin || role === 'supervisor';

  const isApproved = auditStatus === 'aprobado' || auditStatus === 'aprobado_para_templates';
  const isSaleLockedStatus = saleStatus === 'completado' || saleStatus === 'cancelado';
  const canManageTemplates = !disabled && !isSaleLockedStatus;
  // Regenerate & download buttons are always available regardless of lock state
  const canRegenerateDownload = !!saleId;

  // Fetch associated templates (no content — large base64 images; content is fetched on-demand at generation)
  const { data: saleTemplates, isLoading } = useQuery({
    queryKey: ['sale-templates', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data, error } = await supabase
        .from('sale_templates')
        .select('*, templates:template_id(id, name, description)')
        .eq('sale_id', saleId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!saleId,
  });

  // Fetch annexes for all associated template IDs
  const templateIds = saleTemplates?.map((st: any) => st.templates?.id || st.template_id).filter(Boolean) || [];
  const { data: templateAnnexes } = useQuery({
    queryKey: ['sale-template-annexes', templateIds],
    queryFn: async () => {
      if (templateIds.length === 0) return [];
      const { data, error } = await supabase
        .from('template_attachments' as any)
        .select('*')
        .in('template_id', templateIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: templateIds.length > 0,
  });

  // Load signed URL for an annex
  const loadAnnexSignedUrl = async (annex: any) => {
    if (annexSignedUrls[annex.id]) return annexSignedUrls[annex.id];
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(annex.file_url, 3600);
    if (data?.signedUrl) {
      setAnnexSignedUrls(prev => ({ ...prev, [annex.id]: data.signedUrl }));
      return data.signedUrl;
    }
    return null;
  };

  // Auto-load signed URLs for PDF annexes
  useEffect(() => {
    if (!templateAnnexes?.length) return;
    templateAnnexes.forEach((annex: any) => {
      const isPDF = annex.file_type === 'application/pdf' || annex.file_name?.endsWith('.pdf');
      if (isPDF && !annexSignedUrls[annex.id]) {
        loadAnnexSignedUrl(annex);
      }
    });
  }, [templateAnnexes]);

  // Fetch generated documents for this sale
  const { data: generatedDocs } = useQuery({
    queryKey: ['sale-generated-documents', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data, error } = await supabase
          .from('documents')
          .select('id, name, document_type, status, beneficiary_id, content, file_url, requires_signature, generated_from_template, is_final, created_at')
          .eq('sale_id', saleId)
          .neq('document_type', 'firma')
          .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
      },
      enabled: !!saleId,
    });

    const handleRegenerarPdf = async (documentId: string) => {
      setRegenerandoPdf(documentId);
      try {
        const { error: baseErr } = await supabase.functions.invoke('generate-base-pdf', {
          body: { document_id: documentId },
        });
        if (baseErr) throw new Error(`Error generando PDF base: ${baseErr.message}`);

        const { error: padesErr } = await supabase.functions.invoke('pades-sign-document', {
          body: { document_id: documentId },
        });
        if (padesErr) throw new Error(`Error aplicando firma: ${padesErr.message}`);

        toast.success('PDF regenerado correctamente');
        queryClient.invalidateQueries({ queryKey: ['sale-generated-documents', saleId] });
      } catch (err: any) {
        toast.error(err.message || 'Error al regenerar el PDF');
      } finally {
        setRegenerandoPdf(null);
      }
    };

  const addTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      if (!saleId) throw new Error('No sale ID');
      const { error } = await supabase
        .from('sale_templates')
        .insert({ sale_id: saleId, template_id: templateId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-templates', saleId] });
      setSelectedTemplateId('');
      if (generatedDocs?.length) {
        setNeedsRegeneration(true);
        setTimeout(() => regenerateActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
      toast.success('Template asociado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sale_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-templates', saleId] });
      if (generatedDocs?.length) {
        setNeedsRegeneration(true);
        setTimeout(() => regenerateActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
      toast.success('Template removido');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSendDocuments = async () => {
    if (!saleId || !saleTemplates?.length) return;
    // Guarda anti-doble-clic: el estado `sending` recién frena en el siguiente render,
    // así que dos clics muy rápidos podían entrar los dos. El ref frena de inmediato.
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      setSending(true);

      const templateIds = saleTemplates.map((st: any) => st.templates?.id || st.template_id).filter(Boolean);
      const [
        saleResult,
        beneficiariesResult,
        templateContentsResult,
        templateResponsesResult,
        attachmentsResult,
      ] = await Promise.all([
        supabase
          .from('sales')
          .select(`
            *,
            clients:client_id(*),
            plans:plan_id(*),
            companies:company_id(*)
          `)
          .eq('id', saleId)
          .single(),
        supabase
          .from('beneficiaries')
          .select('*')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: true }),
        supabase
          .from('templates')
          .select('*')
          .in('id', templateIds),
        supabase
          .from('template_responses')
          .select('*, template_questions:question_id(placeholder_name, question_type)')
          .eq('sale_id', saleId),
        supabase
          .from('template_attachments' as any)
          .select('*')
          .in('template_id', templateIds)
          .order('sort_order', { ascending: true }),
      ]);

      if (saleResult.error) throw saleResult.error;
      if (beneficiariesResult.error) throw beneficiariesResult.error;
      if (templateContentsResult.error) throw templateContentsResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;

      // NOTA DE ORDEN (importante): el borrado de idempotencia NO se hace acá.
      // Se hace lo más tarde posible, justo antes del insert, cuando el array de
      // documentos ya está construido en memoria y TODAS las validaciones pasaron.
      // Si se borrara acá, cualquier throw posterior (render de plantillas, validación
      // de adherentes sin DDJJ, etc.) dejaría la venta SIN documentos.

      const sale = saleResult.data;
      const client = sale?.clients as any;
      const plan = sale?.plans as any;
      const company = sale?.companies as any;
      const effectiveBeneficiaries = beneficiariesResult.data || beneficiaries || [];
      const templateContents = templateContentsResult.data || [];
      const templateResponses = templateResponsesResult.data || [];
      const allAttachments = (attachmentsResult.data as any[]) || [];

      if (company?.logo_url && company.logo_url.includes('.supabase.co/storage/v1/')) {
        const pathMatch = company.logo_url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
        if (pathMatch) {
          const logoBucket = pathMatch[1];
          const logoPath = decodeURIComponent(pathMatch[2]);
          const { data: logoData } = await supabase.storage
            .from(logoBucket)
            .createSignedUrl(logoPath, 3600);
          if (logoData?.signedUrl) {
            company.logo_url = logoData.signedUrl;
          }
        }
      }

      // Build responses map keyed by placeholder_name
      const responsesMap: Record<string, any> = {};
      (templateResponses || []).forEach((tr: any) => {
        const placeholderName = tr.template_questions?.placeholder_name;
        const normalizedPlaceholder = normalizeResponsePlaceholder(placeholderName);
        if (tr.response_value !== null && tr.response_value !== undefined) {
          const formatted = formatResponseValue(tr.response_value, tr.template_questions?.question_type);
          if (normalizedPlaceholder) {
            responsesMap[normalizedPlaceholder] = formatted;
          }
          if (tr.question_id) {
            responsesMap[tr.question_id] = formatted;
          }
        }
      });

      // Fallback: If DDJJ responses are not populated from template_responses,
      // build them directly from beneficiary health data (primary beneficiary / titular)
      const primaryBen = (effectiveBeneficiaries || []).find((b: any) => b.is_primary);
      if (primaryBen && !responsesMap['ddjj_peso']) {
        const healthDetail = primaryBen.preexisting_conditions_detail || '';
        const detailLines = healthDetail.split('; ');
        
        // Extract structured data from preexisting_conditions_detail
        for (const line of detailLines) {
          if (line.startsWith('Peso:')) {
            responsesMap['ddjj_peso'] = line.replace('Peso:', '').replace('kg', '').trim();
          } else if (line.startsWith('Estatura:')) {
            responsesMap['ddjj_altura'] = line.replace('Estatura:', '').replace('cm', '').trim();
          } else if (line.startsWith('Hábitos:')) {
            const habits = line.replace('Hábitos:', '').trim();
            responsesMap['ddjj_fuma'] = habits.includes('Fuma') ? 'Sí' : 'No';
            responsesMap['ddjj_vapea'] = habits.includes('Vapea') ? 'Sí' : 'No';
            responsesMap['ddjj_alcohol'] = habits.includes('alcohólicas') ? 'Sí' : 'No';
          } else if (line.startsWith('Última menstruación')) {
            responsesMap['ddjj_menstruacion'] = line.split(':').slice(1).join(':').trim();
          }
        }

        // Parse health questions from detail
        for (let i = 1; i <= 7; i++) {
          if (!responsesMap[`ddjj_pregunta_${i}`]) {
            const questionPrefix = `${i}.`;
            const matchingLine = detailLines.find(l => l.trim().startsWith(questionPrefix));
            if (matchingLine) {
              responsesMap[`ddjj_pregunta_${i}`] = matchingLine.includes(':') 
                ? 'Sí: ' + matchingLine.split(':').slice(1).join(':').trim()
                : 'Sí';
            } else {
              responsesMap[`ddjj_pregunta_${i}`] = primaryBen.has_preexisting_conditions ? '' : 'No';
            }
          }
        }
        
        // Set default No for habits if not found
        if (!responsesMap['ddjj_fuma']) responsesMap['ddjj_fuma'] = 'No';
        if (!responsesMap['ddjj_vapea']) responsesMap['ddjj_vapea'] = 'No';
        if (!responsesMap['ddjj_alcohol']) responsesMap['ddjj_alcohol'] = 'No';
        if (!responsesMap['ddjj_menstruacion']) responsesMap['ddjj_menstruacion'] = 'N/A';
      }

      // *** ENHANCED TEMPLATE ENGINE — 50+ variables, beneficiary loops, formatted dates/currency ***
      const { createEnhancedTemplateContext, interpolateEnhancedTemplate } = await import('@/lib/enhancedTemplateEngine');

      // Fetch company settings for representante data
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('contratada_signer_name, contratada_signer_dni, contratada_signer_phone')
        .eq('company_id', company.id)
        .single();

      const context = createEnhancedTemplateContext(
        client, plan, company, sale, effectiveBeneficiaries || [], undefined, responsesMap, companySettings
      );

      const templatesWithAttachments = new Set((allAttachments || []).map((a: any) => a.template_id));
      // Build a map of template_id -> first PDF attachment for direct file linking
      const templatePdfAttachmentMap = new Map<string, any>();
      const directAnnexTemplateIds = new Set<string>();
      for (const att of (allAttachments as any[] || [])) {
        const isPDF = att.file_type === 'application/pdf' || att.file_name?.endsWith('.pdf');
        if (isPDF && !templatePdfAttachmentMap.has(att.template_id)) {
          templatePdfAttachmentMap.set(att.template_id, att);
        }
      }

      // Sort templates: DDJJ and Contrato first, Anexo last (large content processed last)
      const sortedTemplates = [...(templateContents || [])].sort((a, b) => {
        const aNorm = normalizeAccents(a.name);
        const bNorm = normalizeAccents(b.name);
        const aIsAnexo = isAnexoPlanName(a.name) || (!aNorm.includes('ddjj') && !aNorm.includes('declaracion') && !aNorm.includes('contrato'));
        const bIsAnexo = isAnexoPlanName(b.name) || (!bNorm.includes('ddjj') && !bNorm.includes('declaracion') && !bNorm.includes('contrato'));
        if (aIsAnexo && !bIsAnexo) return 1;
        if (!aIsAnexo && bIsAnexo) return -1;
        return 0;
      });

      const titularDocuments = (
        await Promise.all(sortedTemplates.map(async (template) => {
          const hasDesignerContent = !!template.content?.trim();
          const norm = normalizeAccents(template.name);
          const isDDJJ = norm.includes('ddjj') || norm.includes('declaracion') || (template as any).document_type === 'ddjj_salud';
          const isContrato = norm.includes('contrato');
          const isAnexoPlan = isAnexoPlanName(template.name);
          const isAnexo = isAnexoPlan || (!isDDJJ && !isContrato);

          const pdfAttachment = isAnexo ? templatePdfAttachmentMap.get(template.id) : null;
          if (isAnexo && pdfAttachment) {
            directAnnexTemplateIds.add(template.id);
            return {
              sale_id: saleId,
              name: template.name,
              document_type: 'anexo',
              content: null,
              file_url: pdfAttachment.file_url,
              status: 'pendiente' as any,
              requires_signature: false,
              is_final: true,
              generated_from_template: true,
              beneficiary_id: null,
            };
          }

          if (isAnexo && !hasDesignerContent) {
            return null;
          }

          let normalizedContent: string;
          if (isAnexo && hasDesignerContent) {
            normalizedContent = template.content || '';
          } else {
            normalizedContent = interpolateEnhancedTemplate(template.content || '', context);
          }

          normalizedContent = await resolveStorageImages(normalizedContent);

          return {
            sale_id: saleId,
            name: template.name,
            document_type: isAnexo ? 'anexo' : (isDDJJ ? 'ddjj_salud' : 'contrato'),
            content: normalizedContent,
            status: 'pendiente' as any,
            requires_signature: !isAnexo,
            is_final: isAnexo,
            generated_from_template: true,
            beneficiary_id: null,
          };
        }))
      ).filter(Boolean);

      // Generate DDJJ documents per beneficiary (adherente)
      const ddjiTemplates = (templateContents || []).filter(t => {
        const norm = normalizeAccents(t.name);
        return norm.includes('ddjj') || norm.includes('declaracion')
          || (t as any).document_type === 'ddjj_salud';
      });

      const beneficiaryDocuments = (
        await Promise.all((effectiveBeneficiaries || []).flatMap((b) => {
          if (b.signature_required === false || b.is_primary || ddjiTemplates.length === 0) {
            return [];
          }

          // BUG FIX: Reset ALL health fields before loading each adherent's data.
          // Without this reset, titular's health answers leak into adherents
          // because benResponsesMap inherits from responsesMap (last saved answers).
          const benResponsesMap: Record<string, any> = { ...responsesMap };
          for (let i = 1; i <= 7; i++) {
            benResponsesMap[`ddjj_pregunta_${i}`] = 'No';
          }
          benResponsesMap['ddjj_fuma'] = 'No';
          benResponsesMap['ddjj_vapea'] = 'No';
          benResponsesMap['ddjj_alcohol'] = 'No';
          benResponsesMap['ddjj_menstruacion'] = 'N/A';
          benResponsesMap['ddjj_peso'] = '';
          benResponsesMap['ddjj_altura'] = '';

          const benDetail = b.preexisting_conditions_detail || '';
          const benLines = benDetail.split('; ');
          for (const line of benLines) {
            if (line.startsWith('Peso:')) {
              benResponsesMap['ddjj_peso'] = line.replace('Peso:', '').replace('kg', '').trim();
            } else if (line.startsWith('Estatura:')) {
              benResponsesMap['ddjj_altura'] = line.replace('Estatura:', '').replace('cm', '').trim();
            } else if (line.startsWith('Hábitos:')) {
              const habits = line.replace('Hábitos:', '').trim();
              benResponsesMap['ddjj_fuma'] = habits.includes('Fuma') ? 'Sí' : 'No';
              benResponsesMap['ddjj_vapea'] = habits.includes('Vapea') ? 'Sí' : 'No';
              benResponsesMap['ddjj_alcohol'] = habits.includes('alcohólicas') ? 'Sí' : 'No';
            } else if (line.startsWith('Última menstruación') || line.startsWith('Ultima menstruacion')) {
              benResponsesMap['ddjj_menstruacion'] = line.split(':').slice(1).join(':').trim() || 'N/A';
            }
          }
          // Load health questions strictly from this beneficiary's own data
          for (let i = 1; i <= 7; i++) {
            const questionPrefix = `${i}.`;
            const matchingLine = benLines.find(l => l.trim().startsWith(questionPrefix));
            if (matchingLine) {
              benResponsesMap[`ddjj_pregunta_${i}`] = matchingLine.includes(':')
                ? 'Sí: ' + matchingLine.split(':').slice(1).join(':').trim()
                : 'Sí';
            } else {
              benResponsesMap[`ddjj_pregunta_${i}`] = 'No'; // never inherit from titular
            }
          }

          return ddjiTemplates.map(async (ddjiTemplate) => {
            const beneficiaryContext = createEnhancedTemplateContext(
              {
                first_name: b.first_name, last_name: b.last_name,
                email: b.email, phone: b.phone, dni: b.document_number || (b as any).dni,
                address: b.address, birth_date: b.birth_date,
                city: (b as any).city, province: (b as any).province,
              },
              plan, company, sale, effectiveBeneficiaries || [], undefined, benResponsesMap
            );
            let renderedContent = interpolateEnhancedTemplate(ddjiTemplate.content || '', beneficiaryContext);
            renderedContent = await resolveStorageImages(renderedContent);

            return {
              sale_id: saleId,
              name: `${ddjiTemplate.name} - ${b.first_name} ${b.last_name}`,
              document_type: 'ddjj_salud',
              content: renderedContent,
              status: 'pendiente' as any,
              requires_signature: true,
              beneficiary_id: b.id,
            };
          });
        }))
      ).filter(Boolean);

      const templateNameById = new Map(
        (templateContents || []).map((t: any) => [t.id, t.name])
      );
      const templatesWithContent = new Set(
        (templateContents || []).filter((t: any) => !!t.content?.trim()).map((t: any) => t.id)
      );
      const attachmentDocuments = allAttachments
        .filter((att: any) => !templatesWithContent.has(att.template_id) && !directAnnexTemplateIds.has(att.template_id))
        .map((att: any) => {
          const parentTemplateName = templateNameById.get(att.template_id);
          const isAnexoPlanAttachment = isAnexoPlanName(parentTemplateName) || isAnexoPlanName(att.file_name);

          return {
            sale_id: saleId,
            name: `${isAnexoPlanAttachment ? 'Anexo Plan' : 'Anexo'} - ${att.file_name}`,
            document_type: 'anexo',
            file_url: att.file_url,
            content: null,
            status: 'pendiente' as any,
            requires_signature: false,
            is_final: true,
            generated_from_template: true,
            beneficiary_id: null,
          };
        });

      const documentsToInsert = [
        ...titularDocuments,
        ...beneficiaryDocuments,
        ...attachmentDocuments,
      ];

      // VALIDACIÓN DE NEGOCIO ANTES DE TOCAR LA BASE.
      // Se corre sobre el array ya construido EN MEMORIA (beneficiaryDocuments), no sobre
      // la base. Antes esta comprobación estaba DESPUÉS del borrado + insert, así que un
      // adherente sin DDJJ abortaba la función habiendo ya borrado los documentos previos.
      const adherentesNeedingLinks = (effectiveBeneficiaries || []).filter(
        (b) => b.signature_required !== false && !b.is_primary
      );
      if (adherentesNeedingLinks.length > 0) {
        const idsWithDocs = new Set(
          beneficiaryDocuments
            .map((document: any) => document.beneficiary_id)
            .filter(Boolean)
        );
        const missing = adherentesNeedingLinks.filter((b) => !idsWithDocs.has(b.id));
        if (missing.length > 0) {
          const names = missing.map((b) => `${b.first_name} ${b.last_name}`).join(', ');
          throw new Error(
            `Los siguientes adherentes no tienen documentos generados: ${names}. Asegurate de incluir un template de DDJJ para cada adherente antes de enviar.`
          );
        }
      }

      // Idempotencia: recién ACÁ se borran los documentos generados NO firmados de una
      // ejecución previa. Sin esto, pulsar el botón N veces dejaba N contratos / N DDJJ /
      // N anexos (caso real: venta 2026-000207 con 5 copias).
      //
      // El orden importa: no hay transacciones desde el cliente, así que la mitigación es
      // minimizar la ventana entre "borré" e "inserté". El borrado va inmediatamente antes
      // del insert, con el array completo en memoria y todas las validaciones ya pasadas,
      // para que ningún throw pueda dejar la venta sin documentos.
      const cleanupResult = await deleteUnsignedGeneratedDocuments(saleId);
      if (cleanupResult.notFinalResult.error || cleanupResult.annexResult.error) {
        console.warn(
          '[DocGen] Limpieza previa incompleta:',
          cleanupResult.notFinalResult.error || cleanupResult.annexResult.error
        );
      }

      await insertDocumentsWithFallback(documentsToInsert);

      const candidateSignatureLinkRows = [
        buildSignatureLinkPayload({
          saleId,
          recipientType: 'titular',
          recipientEmail: client?.email || '',
          recipientPhone: client?.phone || undefined,
        }),
        ...adherentesNeedingLinks.map((b) =>
          buildSignatureLinkPayload({
            saleId,
            recipientType: 'adherente',
            recipientEmail: b.email || '',
            recipientPhone: b.phone || undefined,
            beneficiaryId: b.id,
          })
        ),
      ];

      // Evitar signature_links duplicados: si el destinatario (recipient_type + recipient_id)
      // ya tiene un link utilizable —o uno ya completado, porque entonces YA firmó— no se
      // crea otro. Estados en español usados en el proyecto: pendiente / visualizado /
      // completado / revocado / expirado.
      const { data: existingLinks, error: existingLinksError } = await supabase
        .from('signature_links')
        .select('id, recipient_type, recipient_id, status, is_active, expires_at')
        .eq('sale_id', saleId);
      if (existingLinksError) throw existingLinksError;

      const recipientKey = (type?: string | null, id?: string | null) => `${type || ''}::${id || ''}`;
      const nowMs = Date.now();
      const alreadyCoveredRecipients = new Set(
        (existingLinks || [])
          .filter((link: any) => {
            // Ya firmó: nunca re-crear el link.
            if (link.status === 'completado') return true;
            // Inutilizables: se puede crear uno nuevo.
            if (link.status === 'revocado' || link.status === 'expirado') return false;
            if (link.is_active === false) return false;
            if (link.expires_at && new Date(link.expires_at).getTime() <= nowMs) return false;
            return true;
          })
          .map((link: any) => recipientKey(link.recipient_type, link.recipient_id))
      );

      const signatureLinkRows = candidateSignatureLinkRows.filter(
        (row) => !alreadyCoveredRecipients.has(recipientKey(row.recipient_type, row.recipient_id))
      );

      if (signatureLinkRows.length > 0) {
        const { error: signatureLinksError } = await supabase
          .from('signature_links')
          .insert(signatureLinkRows as any);
        if (signatureLinksError) throw signatureLinksError;
      }

      // Validate workflow transition
      const { data: saleForValidation } = await supabase.from('sales').select('*, template_responses(id)').eq('id', saleId).single();
      if (saleForValidation?.company_id) {
        const { data: currentUser } = await supabase.auth.getUser();
        const { data: userRoleData } = await supabase.rpc('get_user_role', { _user_id: currentUser?.user?.id || '' });
        const check = await validateSaleTransition(saleForValidation.company_id, saleForValidation, 'enviado', (userRoleData as any) || 'vendedor');
        if (!check.allowed) throw new Error(check.reasons.join(', '));
      }

      // Update sale status to 'enviado'
      await supabase
        .from('sales')
        .update({ status: 'enviado' } as any)
        .eq('id', saleId);

      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales-list'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale-generated-documents', saleId] });
      queryClient.invalidateQueries({ queryKey: ['signature-links', saleId] });
      // El mensaje distingue si realmente se crearon enlaces nuevos. Si el anti-duplicado
      // descartó todos los candidatos (ya había links vigentes o el destinatario ya firmó),
      // no se reenvió nada: decirlo explícitamente para no confundir al vendedor.
      if (candidateSignatureLinkRows.length > 0 && signatureLinkRows.length === 0) {
        toast.success(
          'Documentos regenerados. Se conservaron los enlaces de firma vigentes (no se generaron enlaces nuevos). Redirigiendo...'
        );
      } else {
        toast.success('Documentos generados y enviados para firma. Redirigiendo...');
      }

      navigate(`/signature-workflow/${saleId}`);
    } catch (error: any) {
      toast.error(error.message || 'Error al enviar documentos');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // Regenerate documents without creating new signature links (used after resend erased docs)
  const handleRegenerateDocuments = async () => {
    if (!saleId || !saleTemplates?.length) return;

    try {
      setRegenerating(true);
      const tplIds = saleTemplates.map((st: any) => st.templates?.id || st.template_id).filter(Boolean);

      const [
        deleteResults,
        saleResult,
        beneficiariesResult,
        templateContentsResult,
        templateResponsesResult,
        attachmentsResult,
      ] = await Promise.all([
        // Limpieza idempotente (mismo comportamiento que antes, ahora centralizado)
        deleteUnsignedGeneratedDocuments(saleId),
        supabase
          .from('sales')
          .select(`*, clients:client_id(*), plans:plan_id(*), companies:company_id(*)`)
          .eq('id', saleId)
          .single(),
        supabase
          .from('beneficiaries')
          .select('*')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: true }),
        supabase
          .from('templates')
          .select('*')
          .in('id', tplIds),
        supabase
          .from('template_responses')
          .select('*, template_questions:question_id(placeholder_name, question_type)')
          .eq('sale_id', saleId),
        supabase
          .from('template_attachments' as any)
          .select('*')
          .in('template_id', tplIds)
          .order('sort_order', { ascending: true }),
      ]);

      // Los errores de borrado no abortan la regeneración (comportamiento original)
      if (deleteResults.notFinalResult.error || deleteResults.annexResult.error) {
        console.warn(
          '[DocGen] Limpieza previa incompleta:',
          deleteResults.notFinalResult.error || deleteResults.annexResult.error
        );
      }
      if (saleResult.error) throw saleResult.error;
      if (beneficiariesResult.error) throw beneficiariesResult.error;
      if (templateContentsResult.error) throw templateContentsResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;

      const sale = saleResult.data;
      const client = sale?.clients as any;
      const plan = sale?.plans as any;
      const company = sale?.companies as any;
      const effectiveBeneficiaries = beneficiariesResult.data || beneficiaries || [];
      const templateContents = templateContentsResult.data || [];
      const templateResponses = templateResponsesResult.data || [];
      const allAttachments = (attachmentsResult.data as any[]) || [];

      const responsesMap: Record<string, any> = {};
      (templateResponses || []).forEach((tr: any) => {
        const ph = normalizeResponsePlaceholder(tr.template_questions?.placeholder_name);
        if (tr.response_value !== null && tr.response_value !== undefined) {
          const formatted = formatResponseValue(tr.response_value, tr.template_questions?.question_type);
          if (ph) responsesMap[ph] = formatted;
          if (tr.question_id) responsesMap[tr.question_id] = formatted;
        }
      });

      // Fallback: Build DDJJ responses from primary beneficiary health data (same as handleSendDocuments)
      const primaryBen = (effectiveBeneficiaries || []).find((b: any) => b.is_primary);
      if (primaryBen && !responsesMap['ddjj_peso']) {
        const healthDetail = primaryBen.preexisting_conditions_detail || '';
        const detailLines = healthDetail.split('; ');
        for (const line of detailLines) {
          if (line.startsWith('Peso:')) {
            responsesMap['ddjj_peso'] = line.replace('Peso:', '').replace('kg', '').trim();
          } else if (line.startsWith('Estatura:')) {
            responsesMap['ddjj_altura'] = line.replace('Estatura:', '').replace('cm', '').trim();
          } else if (line.startsWith('Hábitos:')) {
            const habits = line.replace('Hábitos:', '').trim();
            responsesMap['ddjj_fuma'] = habits.includes('Fuma') ? 'Sí' : 'No';
            responsesMap['ddjj_vapea'] = habits.includes('Vapea') ? 'Sí' : 'No';
            responsesMap['ddjj_alcohol'] = habits.includes('alcohólicas') ? 'Sí' : 'No';
          } else if (line.startsWith('Última menstruación')) {
            responsesMap['ddjj_menstruacion'] = line.split(':').slice(1).join(':').trim();
          }
        }
        for (let i = 1; i <= 7; i++) {
          if (!responsesMap[`ddjj_pregunta_${i}`]) {
            const questionPrefix = `${i}.`;
            const matchingLine = detailLines.find(l => l.trim().startsWith(questionPrefix));
            if (matchingLine) {
              responsesMap[`ddjj_pregunta_${i}`] = matchingLine.includes(':') 
                ? 'Sí: ' + matchingLine.split(':').slice(1).join(':').trim()
                : 'Sí';
            } else {
              responsesMap[`ddjj_pregunta_${i}`] = primaryBen.has_preexisting_conditions ? '' : 'No';
            }
          }
        }
        if (!responsesMap['ddjj_fuma']) responsesMap['ddjj_fuma'] = 'No';
        if (!responsesMap['ddjj_vapea']) responsesMap['ddjj_vapea'] = 'No';
        if (!responsesMap['ddjj_alcohol']) responsesMap['ddjj_alcohol'] = 'No';
        if (!responsesMap['ddjj_menstruacion']) responsesMap['ddjj_menstruacion'] = 'N/A';
      }

      const { createEnhancedTemplateContext, interpolateEnhancedTemplate } = await import('@/lib/enhancedTemplateEngine');

      // Fetch company settings for representante data
      const { data: csSettings } = await supabase
        .from('company_settings')
        .select('contratada_signer_name, contratada_signer_dni, contratada_signer_phone')
        .eq('company_id', company.id)
        .single();

      const context = createEnhancedTemplateContext(client, plan, company, sale, effectiveBeneficiaries, undefined, responsesMap, csSettings);
      const templatesWithAttachments = new Set(allAttachments.map((a: any) => a.template_id));
      const templatePdfAttachmentMap = new Map<string, any>();
      const directAnnexTemplateIds = new Set<string>();
      for (const attachment of allAttachments) {
        const isPDF = attachment.file_type === 'application/pdf' || attachment.file_name?.endsWith('.pdf');
        if (isPDF && !templatePdfAttachmentMap.has(attachment.template_id)) {
          templatePdfAttachmentMap.set(attachment.template_id, attachment);
        }
      }

      // Sort templates: DDJJ and Contrato first, Anexo last
      const sortedTpls = [...templateContents].sort((a, b) => {
        const aNorm = normalizeAccents(a.name);
        const bNorm = normalizeAccents(b.name);
        const aIsAnexo = isAnexoPlanName(a.name) || (!isDDJJTemplate(a) && !aNorm.includes('contrato'));
        const bIsAnexo = isAnexoPlanName(b.name) || (!isDDJJTemplate(b) && !bNorm.includes('contrato'));
        if (aIsAnexo && !bIsAnexo) return 1;
        if (!aIsAnexo && bIsAnexo) return -1;
        return 0;
      });

      const titularDocuments = (
        await Promise.all(sortedTpls.map(async (template) => {
          const hasContent = !!template.content?.trim();
          const isDDJJ = isDDJJTemplate(template);
          const isContrato = normalizeAccents(template.name).includes('contrato');
          const isAnexo = isAnexoPlanName(template.name) || (!isDDJJ && !isContrato);
          const pdfAttachment = isAnexo ? templatePdfAttachmentMap.get(template.id) : null;

          if (isAnexo && pdfAttachment) {
            directAnnexTemplateIds.add(template.id);
            return {
              sale_id: saleId,
              name: template.name,
              document_type: 'anexo',
              file_url: pdfAttachment.file_url,
              content: null,
              status: 'pendiente' as any,
              requires_signature: false,
              is_final: true,
              generated_from_template: true,
              beneficiary_id: null,
            };
          }

          if (isAnexo && !hasContent && templatesWithAttachments.has(template.id)) {
            return null;
          }

          let rendered: string;
          if (!hasContent && isAnexo) {
            rendered = '<p>Documento de anexo.</p>';
          } else if (isAnexo && hasContent) {
            rendered = template.content || '';
          } else {
            rendered = interpolateEnhancedTemplate(template.content || '', context);
          }

          rendered = await resolveStorageImages(rendered);

          return {
            sale_id: saleId,
            name: template.name,
            document_type: isAnexo ? 'anexo' : (isDDJJ ? 'ddjj_salud' : 'contrato'),
            content: rendered,
            status: 'pendiente' as any,
            requires_signature: !isAnexo,
            is_final: isAnexo,
            generated_from_template: true,
            beneficiary_id: null,
          };
        }))
      ).filter(Boolean);

      // DDJJ per adherente
      const ddjiTpls = templateContents.filter(isDDJJTemplate);
      const unresolvedTraceRows: Record<string, any>[] = [];
      const beneficiaryDocuments = (
        await Promise.all((effectiveBeneficiaries || []).flatMap((b) => {
          if (b.signature_required === false || b.is_primary || ddjiTpls.length === 0) {
            return [];
          }

          // BUG FIX: Reset ALL health fields before loading each adherent's data.
          // Without this reset, titular's health answers leak into adherents
          // because benResponsesMap inherits from responsesMap (last saved answers).
          const benResponsesMap: Record<string, any> = { ...responsesMap };
          for (let i = 1; i <= 7; i++) {
            benResponsesMap[`ddjj_pregunta_${i}`] = 'No';
          }
          benResponsesMap['ddjj_fuma'] = 'No';
          benResponsesMap['ddjj_vapea'] = 'No';
          benResponsesMap['ddjj_alcohol'] = 'No';
          benResponsesMap['ddjj_menstruacion'] = 'N/A';
          benResponsesMap['ddjj_peso'] = '';
          benResponsesMap['ddjj_altura'] = '';

          const benDetail = b.preexisting_conditions_detail || '';
          const benLines = benDetail.split('; ');
          for (const line of benLines) {
            if (line.startsWith('Peso:')) {
              benResponsesMap['ddjj_peso'] = line.replace('Peso:', '').replace('kg', '').trim();
            } else if (line.startsWith('Estatura:')) {
              benResponsesMap['ddjj_altura'] = line.replace('Estatura:', '').replace('cm', '').trim();
            } else if (line.startsWith('Hábitos:')) {
              const habits = line.replace('Hábitos:', '').trim();
              benResponsesMap['ddjj_fuma'] = habits.includes('Fuma') ? 'Sí' : 'No';
              benResponsesMap['ddjj_vapea'] = habits.includes('Vapea') ? 'Sí' : 'No';
              benResponsesMap['ddjj_alcohol'] = habits.includes('alcohólicas') ? 'Sí' : 'No';
            } else if (line.startsWith('Última menstruación') || line.startsWith('Ultima menstruacion')) {
              benResponsesMap['ddjj_menstruacion'] = line.split(':').slice(1).join(':').trim() || 'N/A';
            }
          }
          // Load health questions strictly from this beneficiary's own data
          for (let i = 1; i <= 7; i++) {
            const questionPrefix = `${i}.`;
            const matchingLine = benLines.find(l => l.trim().startsWith(questionPrefix));
            if (matchingLine) {
              benResponsesMap[`ddjj_pregunta_${i}`] = matchingLine.includes(':')
                ? 'Sí: ' + matchingLine.split(':').slice(1).join(':').trim()
                : 'Sí';
            } else {
              benResponsesMap[`ddjj_pregunta_${i}`] = 'No'; // never inherit from titular
            }
          }

          return ddjiTpls.map(async (ddji) => {
            const benCtx = createEnhancedTemplateContext(
              {
                first_name: b.first_name,
                last_name: b.last_name,
                email: b.email,
                phone: b.phone,
                dni: b.document_number || (b as any).dni,
                address: b.address,
                birth_date: b.birth_date,
                city: (b as any).city,
                province: (b as any).province,
              },
              plan,
              company,
              sale,
              effectiveBeneficiaries,
              undefined,
              benResponsesMap
            );
            let renderedDDJJ = interpolateEnhancedTemplate(ddji.content || '', benCtx);
            renderedDDJJ = await resolveStorageImages(renderedDDJJ);

            const unresolvedMatches = renderedDDJJ.match(/\{\{[^}]+\}\}/g);
            if (unresolvedMatches?.length) {
              unresolvedTraceRows.push({
                sale_id: saleId,
                action: 'regeneration_unresolved_placeholders',
                details: {
                  document: ddji.name,
                  beneficiary: `${b.first_name} ${b.last_name}`,
                  placeholders: unresolvedMatches,
                },
              });
            }

            return {
              sale_id: saleId,
              name: `${ddji.name} - ${b.first_name} ${b.last_name}`,
              document_type: 'ddjj_salud',
              content: renderedDDJJ,
              status: 'pendiente' as any,
              requires_signature: true,
              beneficiary_id: b.id,
              generated_from_template: true,
            };
          });
        }))
      ).filter(Boolean);

      const templateNameById = new Map(templateContents.map((t: any) => [t.id, t.name]));
      const templatesWithContent = new Set(
        templateContents.filter((t: any) => !!t.content?.trim()).map((t: any) => t.id)
      );
      const attachmentDocuments = allAttachments
        .filter((att: any) => !templatesWithContent.has(att.template_id) && !directAnnexTemplateIds.has(att.template_id))
        .map((att: any) => {
          const parentTemplateName = templateNameById.get(att.template_id);
          return {
            sale_id: saleId,
            name: `${isAnexoPlanName(parentTemplateName) ? 'Anexo Plan' : 'Anexo'} - ${att.file_name}`,
            document_type: 'anexo',
            file_url: att.file_url,
            content: null,
            status: 'pendiente' as any,
            requires_signature: false,
            is_final: true,
            generated_from_template: true,
            beneficiary_id: null,
          };
        });

      await insertDocumentsWithFallback([
        ...titularDocuments,
        ...beneficiaryDocuments,
        ...attachmentDocuments,
      ]);

      if (unresolvedTraceRows.length > 0) {
        const { error: traceError } = await supabase.from('process_traces').insert(unresolvedTraceRows as any);
        if (traceError) {
        }
      }

      queryClient.invalidateQueries({ queryKey: ['sale-generated-documents', saleId] });
      queryClient.invalidateQueries({ queryKey: ['signed-documents', saleId] });
      toast.success('Documentos regenerados exitosamente');
    } catch (error: any) {
      toast.error(error.message || 'Error al regenerar documentos');
    } finally {
      setRegenerating(false);
      setNeedsRegeneration(false);
    }
  };

  if (!saleId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Guarde la venta primero</h3>
        <p className="text-muted-foreground">Debe guardar la venta antes de asociar templates.</p>
      </div>
    );
  }

  if (!isApproved && !disabled) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Pendiente de Aprobación</h3>
        <p className="text-muted-foreground">
          La venta debe ser aprobada por auditoría antes de asociar templates para firma.
        </p>
        <Badge variant="outline" className="mt-3">
          Estado auditoría: {auditStatus || 'pendiente'}
        </Badge>
      </div>
    );
  }

  const availableTemplates = templates?.filter(
    t => t.is_active !== false && !saleTemplates?.some(st => (st as any).templates?.id === t.id)
  ) || [];

  // Group generated docs
  const titularDocs = generatedDocs?.filter(d => !d.beneficiary_id) || [];
  const adherentDocs = generatedDocs?.filter(d => !!d.beneficiary_id) || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Templates de Firma ({saleTemplates?.length || 0})</h3>
        </div>
        {isApproved && saleTemplates && saleTemplates.length > 0 && (
          <div ref={regenerateActionRef} className="flex gap-2">
            {!generatedDocs?.length && (
              <Button onClick={handleSendDocuments} disabled={sending || regenerating} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar Documentos para Firma
              </Button>
            )}
            {!!generatedDocs?.length && (
              <Button
                onClick={handleRegenerateDocuments}
                disabled={sending || regenerating}
                className="gap-2"
                variant={needsRegeneration ? 'default' : 'outline'}
              >
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerar Documentos
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Template selector (only before generation) */}
      {canManageTemplates && (
        <div className="flex gap-2">
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Seleccionar template..." />
            </SelectTrigger>
            <SelectContent>
              {availableTemplates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => selectedTemplateId && addTemplate.mutate(selectedTemplateId)}
            disabled={!selectedTemplateId || addTemplate.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>
      )}

      {canManageTemplates && !!generatedDocs?.length && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Ya existen documentos generados. Puedes agregar o quitar templates, pero los cambios no se reflejarán hasta usar <strong>Regenerar Documentos</strong>.
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => {
                regenerateActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setNeedsRegeneration(true);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Ir a Regenerar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Associated templates list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando templates...</div>
      ) : saleTemplates && saleTemplates.length > 0 ? (
        <div className="space-y-2">
          {saleTemplates.map((st: any) => {
            const tplId = st.templates?.id || st.template_id;
            const tplAnnexes = (templateAnnexes || []).filter((a: any) => a.template_id === tplId);
            // isAnnexOnly: template has PDF attachments and no HTML content (content not fetched in list query)
            const isAnnexOnly = tplAnnexes.length > 0;
            const isExpanded = expandedAnnexes[st.id] || false;

            return (
              <Card key={st.id}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {st.templates?.name || 'Template'}
                          {getTemplateTypeBadge(st.templates?.name || '')}
                          {isAnnexOnly && (
                            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                              <Paperclip className="h-3 w-3 mr-1" />
                              Anexo PDF
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{st.templates?.description || ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {tplAnnexes.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedAnnexes(prev => ({ ...prev, [st.id]: !isExpanded }))}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {isExpanded ? 'Ocultar' : 'Ver'} ({tplAnnexes.length})
                        </Button>
                      )}
                      {canManageTemplates && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeTemplate.mutate(st.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Inline annexes viewer */}
                  {isExpanded && tplAnnexes.length > 0 && (
                    <div className="space-y-3 pt-2 border-t">
                      {tplAnnexes.map((annex: any) => {
                        const isPDF = annex.file_type === 'application/pdf' || annex.file_name?.endsWith('.pdf');
                        const url = annexSignedUrls[annex.id];
                        return (
                          <div key={annex.id} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between bg-muted/50 px-3 py-2 border-b">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                                <span className="text-sm font-medium">{annex.file_name}</span>
                              </div>
                              <Button variant="outline" size="sm" onClick={async () => {
                                const signedUrl = url || await loadAnnexSignedUrl(annex);
                                if (signedUrl) window.open(signedUrl, '_blank');
                              }}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                Abrir
                              </Button>
                            </div>
                            {isPDF && url ? (
                              <iframe
                                src={`${url}#toolbar=1&navpanes=0`}
                                className="w-full h-[400px] bg-muted/30"
                                title={annex.file_name}
                              />
                            ) : isPDF && !url ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                {annex.file_type || 'Archivo'}{annex.file_size ? ` • ${(annex.file_size / 1024).toFixed(1)} KB` : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No hay templates asociados. Seleccione templates (DDJJ Salud, Contrato, Anexos) para generar documentos de firma.
        </div>
      )}

      {/* Pre-generation info */}
      {isApproved && saleTemplates && saleTemplates.length > 0 && !generatedDocs?.length && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
               <strong>Documentos a enviar:</strong> Se generarán enlaces de firma individuales para el titular
              {beneficiaries && beneficiaries.filter(b => !b.is_primary).length > 0 ? ` y ${beneficiaries.filter(b => !b.is_primary).length} adherente(s)` : ''}.
              Cada uno recibirá las declaraciones juradas correspondientes junto con el contrato y anexos seleccionados.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ========== GENERATED DOCUMENTS VIEWER ========== */}
      {generatedDocs && generatedDocs.length > 0 && (
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => setShowDocuments(!showDocuments)}
            className="flex items-center gap-2 w-full text-left"
          >
            <FileText className="h-5 w-5" />
            <h3 className="text-lg font-semibold">
              Documentos Generados ({generatedDocs.length})
            </h3>
            {showDocuments ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
          </button>

          {showDocuments && (
            <div className="space-y-4">
              {/* Titular documents */}
              {titularDocs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Documentos del Titular</p>
                  {titularDocs.map((doc) => (
                    <Card key={doc.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="py-3 px-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {doc.name}
                                {getTemplateTypeBadge(doc.document_type || doc.name)}
                                {getDocStatusBadge(doc.status)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(doc.created_at).toLocaleString('es-PY')}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {isPrivilegedRole && doc.status === 'firmado' && doc.is_final && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={regenerandoPdf === doc.id}
                                onClick={() => handleRegenerarPdf(doc.id)}
                                className="gap-1"
                              >
                                {regenerandoPdf === doc.id ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" /> Regenerando...</>
                                ) : (
                                  <><RefreshCw className="h-3 w-3" /> Regenerar PDF</>
                                )}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewDoc(doc)}
                              className="gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Button>
                          </div>
                        </div>
                        {canViewPrintVersions && doc.status === 'firmado' && doc.is_final && (
                          <div className="border-t pt-3">
                            <PrintVersionsPanel documentId={doc.id} documentName={doc.name} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Adherent documents */}
              {adherentDocs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Documentos de Adherentes
                  </p>
                  {adherentDocs.map((doc) => (
                    <Card key={doc.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="py-3 px-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-purple-500" />
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {doc.name}
                                {getTemplateTypeBadge(doc.document_type || doc.name)}
                                {getDocStatusBadge(doc.status)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(doc.created_at).toLocaleString('es-PY')}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {isPrivilegedRole && doc.status === 'firmado' && doc.is_final && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={regenerandoPdf === doc.id}
                                onClick={() => handleRegenerarPdf(doc.id)}
                                className="gap-1"
                              >
                                {regenerandoPdf === doc.id ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" /> Regenerando...</>
                                ) : (
                                  <><RefreshCw className="h-3 w-3" /> Regenerar PDF</>
                                )}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewDoc(doc)}
                              className="gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Button>
                          </div>
                        </div>
                        {canViewPrintVersions && doc.status === 'firmado' && doc.is_final && (
                          <div className="border-t pt-3">
                            <PrintVersionsPanel documentId={doc.id} documentName={doc.name} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
        document={previewDoc}
      />
    </div>
  );
};

export default SaleTemplatesTab;
