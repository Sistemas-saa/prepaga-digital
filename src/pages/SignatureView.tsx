import { useParams, Link } from "react-router-dom";
import { useSignatureLinkByToken, useSubmitSignatureLink, useSignatureLinkDocuments, useAllSignatureLinksPublic } from "@/hooks/useSignatureLinkPublic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PublicLayout from "@/layouts/PublicLayout";
import { EnhancedSignatureCanvas } from "@/components/signature/EnhancedSignatureCanvas";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText, User, Calendar, Building, CheckCircle, Clock, AlertCircle,
  Shield, Loader2, Download, Users, PenTool, Paperclip, Eye, Mail,
  KeyRound, Scale, Info, ExternalLink
} from "lucide-react";
import DOMPurify from 'dompurify';
import { formatCurrency } from "@/lib/utils";
import { useSignatureVerification, generateDocumentHash, buildEvidenceBundle } from "@/hooks/useSignatureVerification";

const SignatureView = () => {
  const { token } = useParams<{ token: string }>();
  const { data: linkData, isLoading, error } = useSignatureLinkByToken(token || '');
  const { data: documents } = useSignatureLinkDocuments(
    linkData?.sale_id, 
    linkData?.recipient_type, 
    linkData?.recipient_id,
    token || undefined
  );
  const { data: allLinks } = useAllSignatureLinksPublic(linkData?.sale_id, token || undefined);
  const submitSignature = useSubmitSignatureLink();
  
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signwellCompleted, setSignwellCompleted] = useState(false);
  const signatureSectionRef = useRef<HTMLDivElement>(null);
  const [otpCode, setOtpCode] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('email');
  const [consentRecordId, setConsentRecordId] = useState<string | null>(null);
  const verification = useSignatureVerification();

  // Check if this link has a SignWell signing URL
  const signwellSigningUrl = (linkData as any)?.signwell_signing_url;

  // Listen for SignWell postMessage events (embedded signing completion)
  const handleSignWellMessage = useCallback((event: MessageEvent) => {
    // SignWell sends a postMessage when signing is complete
    if (event.data?.type === 'signwell_event' && event.data?.event === 'completed') {
      setSignwellCompleted(true);
      // Submit as signwell_completed
      if (linkData && token) {
        submitSignature.mutate({
          linkId: linkData.id,
          token: token,
          signatureData: 'signwell_completed',
        });
      }
    }
  }, [linkData, token]);

  useEffect(() => {
    if (signwellSigningUrl) {
      window.addEventListener('message', handleSignWellMessage);
      return () => window.removeEventListener('message', handleSignWellMessage);
    }
  }, [signwellSigningUrl, handleSignWellMessage]);

  // Fetch OTP policy when link data is available
  useEffect(() => {
    if (linkData?.sale_id && token) {
      verification.fetchPolicy(linkData.sale_id, token);
    }
  }, [linkData?.sale_id, token]);

  // Auto-sync selectedChannel with OTP policy default
  useEffect(() => {
    if (verification.otpPolicy?.default_channel) {
      setSelectedChannel(verification.otpPolicy.default_channel);
    }
  }, [verification.otpPolicy]);

  const handleDownloadSignedContent = async (doc: any) => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Always try get-document-download-url with kind=signed first (handles print_versions + branding)
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/get-document-download-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            'x-signature-token': token || '',
          },
          body: JSON.stringify({ document_id: doc.id, kind: 'signed' }),
        }
      );
      const result = await response.json();
      if (result.url) {
        window.open(result.url, '_blank');
        return;
      }
    } catch (err) {
    }

    // Try base PDF if available
    if (doc.base_pdf_url) {
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/get-document-download-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
              'x-signature-token': token || '',
            },
            body: JSON.stringify({ document_id: doc.id, kind: 'base' }),
          }
        );
        const result = await response.json();
        if (result.url) {
          window.open(result.url, '_blank');
          return;
        }
      } catch (err) {
      }
    }

    // Fallback: open HTML content for printing with branding
    if (!doc?.content) return;
    const comp = linkData?.sale?.companies;
    const companyName = comp?.name || '';
    const branding = (linkData as any)?.pdfBranding || {};
    const headerImg = branding.pdf_header_image_url || '';
    const footerImg = branding.pdf_footer_image_url || '';
    const logoUrl = comp?.logo_url || '';

    const htmlContent = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${doc.name}</title>
        <style>
          @page { size: A4; margin: 28mm 15mm 25mm 15mm; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          img { max-width: 280px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .page-header {
            position: fixed; top: -28mm; left: 0; right: 0; height: 24mm;
            display: flex; align-items: center; justify-content: center; padding: 2mm 0;
          }
          .page-header img { max-width: 100%; max-height: 22mm; height: auto; object-fit: contain; }
          .page-footer {
            position: fixed; bottom: -22mm; left: 0; right: 0; height: 18mm;
            display: flex; align-items: center; justify-content: center;
          }
          .page-footer img { max-width: 100%; max-height: 16mm; height: auto; object-fit: contain; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="page-header">
          ${headerImg ? `<img src="${headerImg}" alt="${companyName}" />` : logoUrl ? `<img src="${logoUrl}" alt="${companyName}" />` : `<span style="font-weight:700;font-size:18px;">${companyName}</span>`}
        </div>
        <div class="page-footer">
          ${footerImg ? `<img src="${footerImg}" alt="${companyName}" />` : `<span style="font-size:8px;color:#777;">${companyName} ${(comp as any)?.phone ? '| ' + (comp as any).phone : ''} ${(comp as any)?.email ? '| ' + (comp as any).email : ''}</span>`}
        </div>
        ${DOMPurify.sanitize(doc.content || '', { FORCE_BODY: true })}
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleSignatureComplete = async () => {
    if (!linkData || !termsAccepted) return;
    
    // For digital signature (canvas), require signatureData
    const isElectronic = documents?.some((doc: any) => {
      const content = (doc.content || '').toLowerCase();
      return content.includes('firma electrónica') || content.includes('firma electronica') ||
             content.includes('signature-type="electronic"') || content.includes('signature-type="electronica"') ||
             content.includes('data-signature-type="electronic"') || content.includes('data-signature-type="electronica"');
    });

    if (!isElectronic && !signatureData) return;

    const finalSignatureData = isElectronic
      ? JSON.stringify({
          type: 'electronica',
          accepted_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
        })
      : signatureData!;

    try {
      // Generate document hashes for all docs to sign
      const docsToSign = documents?.filter((d: any) => d.requires_signature !== false) || [];
      const timestamp = new Date().toISOString();
      const ip = 'client-side'; // Will be captured server-side
      const ua = navigator.userAgent;

      // Create a signature client with x-signature-token for RLS
      const { createClient } = await import('@supabase/supabase-js');
      const sigClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { headers: { 'x-signature-token': token! } },
        }
      );

      // Create signature events + evidence bundles for each document
      for (const doc of docsToSign) {
        const docHash = doc.content ? await generateDocumentHash(doc.content) : '';
        
        const evidenceResult = await buildEvidenceBundle({
          documentHash: docHash,
          identityVerificationId: verification.verificationId,
          consentRecordId: consentRecordId || '',
          signatureMethod: isElectronic ? 'electronic' : 'digital',
          ip,
          userAgent: ua,
          timestamp,
        });

        // Insert signature event
        const { data: eventData } = await sigClient.from('signature_events' as any).insert({
          signature_link_id: linkData.id,
          sale_id: linkData.sale_id,
          document_id: doc.id,
          document_hash: docHash,
          ip_address: ip,
          user_agent: ua,
          identity_verified: verification.isVerified,
          identity_verification_id: verification.verificationId,
          consent_record_id: consentRecordId,
          signature_method: isElectronic ? 'electronic' : 'digital',
          evidence_bundle_hash: evidenceResult.hash,
          timestamp,
        }).select().single();

        // Insert evidence bundle (immutable chain of custody)
        const { data: bundleData } = await sigClient.from('signature_evidence_bundles' as any).insert({
          signature_link_id: linkData.id,
          signature_event_id: (eventData as any)?.id || null,
          sale_id: linkData.sale_id,
          document_id: doc.id,
          document_hash: docHash,
          evidence_json: evidenceResult.bundle,
          bundle_hash: evidenceResult.hash,
        }).select().single();

        // Insert hash anchor (internal integrity proof)
        if (bundleData) {
          await sigClient.from('hash_anchors' as any).insert({
            evidence_bundle_id: (bundleData as any).id,
            hash_value: evidenceResult.hash,
            anchor_type: 'internal',
            anchor_reference: `sha256:${evidenceResult.hash}`,
          });
        }
      }

      // Submit the actual signature
      await submitSignature.mutateAsync({
        linkId: linkData.id,
        token: token!,
        signatureData: finalSignatureData,
      });
    } catch (error) {
      console.error('Error in enhanced signature flow:', error);
    }
  };

  const handleSaveConsent = async () => {
    if (!linkData || !termsAccepted || !token) return;
    
    const consentText = `Declaro que: (1) he leído el/los documento(s) completo(s); (2) acepto firmarlos electrónicamente; (3) comprendo que tienen validez jurídica conforme a la Ley N° 4017/2010; (4) confirmo mi identidad; (5) acepto el registro de evidencias técnicas (IP, dispositivo, marca de tiempo, hash).`;
    
    try {
      // Use a client with the signature token header for RLS
      const { createClient } = await import('@supabase/supabase-js');
      const SUPABASE_URL_CONSENT = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY_CONSENT = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const signatureClient = createClient(
        SUPABASE_URL_CONSENT,
        SUPABASE_KEY_CONSENT,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: { headers: { 'x-signature-token': token } },
        }
      );

      const { data, error } = await signatureClient.from('signature_consent_records').insert({
        signature_link_id: linkData.id,
        sale_id: linkData.sale_id,
        consent_text_version: 'v1.0',
        consent_text: consentText,
        checkbox_state: true,
        ip_address: 'client-side',
        user_agent: navigator.userAgent,
      }).select().single();
      
      if (error) throw error;
      setConsentRecordId(data.id);
      return data.id;
    } catch (err: any) {
      console.error('Error saving consent:', err);
      const { toast } = await import('sonner');
      toast.error(err.message || "No se pudo registrar el consentimiento. Intente nuevamente.");
    }
  };

  const handleDownloadSignature = () => {
    if (!signatureData) return;
    const link = document.createElement('a');
    link.download = `firma-${linkData?.recipient_type || 'documento'}-${Date.now()}.png`;
    link.href = signatureData;
    link.click();
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Cargando documento...</p>
        </div>
      </PublicLayout>
    );
  }

  if (error || !linkData) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-12">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle>Enlace no válido</CardTitle>
              <CardDescription>
                El enlace de firma no es válido, ha expirado o ya fue utilizado.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Si crees que esto es un error, contacta con tu agente de ventas.
              </p>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  // Link not yet active (sequential signing)
  if ((linkData as any).isActive === false) {
    return (
      <PublicLayout>
        <div className="flex justify-center py-12">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <CardTitle>Enlace aún no disponible</CardTitle>
              <CardDescription>
                Este enlace de firma se activará cuando el firmante anterior complete su proceso.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Recibirá una notificación cuando sea su turno de firmar.
              </p>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  // Already signed state
  if (linkData.status === 'completado') {
    const isTitular = linkData.recipient_type === 'titular';
    const completedAdherenteLinks = isTitular 
      ? (allLinks || []).filter((l: any) => l.recipient_type === 'adherente' && l.status === 'completado')
      : [];

    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto py-12 px-4 space-y-6">
          <Card>
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
              <CardTitle className="text-2xl text-primary">
                ¡Documento firmado exitosamente!
              </CardTitle>
              <CardDescription>
                Su firma ha sido registrada correctamente el{' '}
                {linkData.completed_at 
                  ? new Date(linkData.completed_at).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : ''
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                Proceso completado
              </Badge>
            </CardContent>
          </Card>

          {(() => {
            // Only show final (signed) documents in success view
            const signedDocs = (documents || []).filter((doc: any) => doc.is_final === true);
            if (signedDocs.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Documentos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {signedDocs.map((doc: any) => (
                    <div key={doc.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.document_type || 'Documento'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.file_url && !doc.content && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                                const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                                const response = await fetch(
                                  `${SUPABASE_URL}/functions/v1/get-document-download-url`,
                                  {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'apikey': SUPABASE_PUBLISHABLE_KEY,
                                      'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                                      'x-signature-token': token || '',
                                    },
                                    body: JSON.stringify({ document_id: doc.id, kind: 'file' }),
                                  }
                                );
                                const result = await response.json();
                                if (result.url) {
                                  window.open(result.url, '_blank');
                                } else {
                                  console.error('Download error:', result.error);
                                }
                              } catch (err) {
                                console.error('Download error:', err);
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Descargar
                          </Button>
                        )}
                        {(doc.content || doc.signed_pdf_url) && (
                          <Button size="sm" variant="outline" onClick={() => handleDownloadSignedContent(doc)}>
                            <Download className="h-3 w-3 mr-1" />
                            {doc.signed_pdf_url ? 'Descargar PDF firmado' : 'Descargar PDF'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {isTitular && completedAdherenteLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Firmas de Adherentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {completedAdherenteLinks.map((aLink: any) => {
                  const beneficiary = linkData.sale?.beneficiaries?.find(
                    (b: any) => b.id === aLink.recipient_id
                  );
                  return (
                    <div key={aLink.id} className="flex items-center justify-between border rounded p-2">
                      <span className="text-sm">
                        {beneficiary ? `${beneficiary.first_name} ${beneficiary.last_name}` : 'Adherente'}
                      </span>
                      <Badge variant="default">✓ Firmado</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </PublicLayout>
    );
  }

  const sale = linkData.sale;
  const client = sale?.clients;
  const plan = sale?.plans;
  const company = sale?.companies;
  const isTitular = linkData.recipient_type === 'titular';
  const isContratada = linkData.recipient_type === 'contratada';

  // Build recipient name for display
  const getRecipientName = () => {
    if (isTitular && client) return `${client.first_name} ${client.last_name}`;
    if (isContratada) return 'Representante Legal';
    if (!isTitular && linkData.recipient_id && sale?.beneficiaries) {
      const ben = sale.beneficiaries.find((b: any) => b.id === linkData.recipient_id);
      if (ben) return `${ben.first_name} ${ben.last_name}`;
    }
    return '';
  };
  const recipientName = getRecipientName();

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
        {/* Company Header */}
        {company && (
          <div className="text-center space-y-2">
            {company.logo_url && (
              <img src={company.logo_url} alt={company.name} className="h-16 mx-auto object-contain" />
            )}
            <h1 className="text-2xl font-bold" style={{ color: company.primary_color || undefined }}>
              {company.name}
            </h1>
          </div>
        )}

        {/* Document Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>
                    {isTitular ? 'Documentos para Firma - Titular' 
                      : isContratada ? 'Firma del Contrato - Contratada'
                      : 'DDJJ de Salud - Adherente'}
                  </CardTitle>
                  <CardDescription>
                    {isTitular 
                      ? 'Revise los documentos y firme al final'
                      : isContratada
                      ? 'Revise y firme el contrato en nombre de la empresa'
                      : 'Revise su Declaración Jurada y firme al final'
                    }
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expira: {new Date(linkData.expires_at).toLocaleDateString('es-ES')}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Contract Info Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {client && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {isTitular ? 'Titular del Contrato' : 'Información del Contrato'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{client.first_name} {client.last_name}</p>
                {client.dni && <p className="text-muted-foreground">C.I.: {client.dni}</p>}
                {isTitular && client.email && <p className="text-muted-foreground">{client.email}</p>}
              </CardContent>
            </Card>
          )}

          {plan && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Plan Contratado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{plan.name}</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(Number(sale?.total_amount || plan.price || 0))}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Documents List - Separated into signature-required and annexes */}
        {(() => {
          // Annexes are documents that don't require signature OR have annex-related document_type
          // BUT: signed contracts (is_final with signed_pdf_url) should NOT be classified as annexes
          const isAnnex = (d: any) => {
            // Never treat a signed final contract as an annex
            if (d.document_type === 'contrato' && (d.signed_pdf_url || d.is_final)) return false;
            return d.requires_signature === false || d.document_type === 'anexo' || d.document_type?.includes('anexo');
          };
          const annexDocs = documents?.filter((d: any) => isAnnex(d)) || [];
          const docsToSign = documents?.filter((d: any) => !isAnnex(d)) || [];
          const hasAnyDocs = docsToSign.length > 0 || annexDocs.length > 0;

          if (!hasAnyDocs) {
            return (
              <Card>
                <CardContent className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No hay documentos disponibles para firmar.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    El vendedor aún no ha generado los documentos para este firmante. Comuníquese con su agente para que complete la preparación del paquete de documentos.
                  </p>
                </CardContent>
              </Card>
            );
          }

          return (
            <>
              {/* Documents requiring signature */}
              {docsToSign.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {isTitular
                        ? `Documentos a Firmar (${docsToSign.length})`
                        : 'Documentos'
                      }
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {docsToSign.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between border rounded-lg p-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                            <div>
                              <p className="font-medium text-sm">
                                {doc.name}{recipientName ? ` - ${recipientName}` : ''}
                              </p>
                              <p className="text-xs text-muted-foreground">{doc.document_type || 'Documento'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.content && (
                              <Button size="sm" variant="outline" onClick={() => handleDownloadSignedContent(doc)}>
                                <Eye className="h-3 w-3 mr-1" />
                                Ver
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}

              {/* Informational annexes (read-only) */}
              {annexDocs.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Anexos ({annexDocs.length})
                    </CardTitle>
                    <CardDescription>Documentos informativos adjuntos. No requieren firma.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {annexDocs.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-4 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <Paperclip className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.document_type === 'anexo' ? 'Anexo' : (doc.document_type || 'Documento')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">Solo lectura</Badge>
                          {doc.file_url && !doc.content && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                                  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                                  const response = await fetch(
                                    `${SUPABASE_URL}/functions/v1/get-document-download-url`,
                                    {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'apikey': SUPABASE_PUBLISHABLE_KEY,
                                        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                                        'x-signature-token': token || '',
                                      },
                                      body: JSON.stringify({ document_id: doc.id, kind: 'file' }),
                                    }
                                  );
                                  const result = await response.json();
                                  if (result.url) {
                                    window.open(result.url, '_blank');
                                  } else {
                                    console.error('Download error:', result.error);
                                  }
                                } catch (err) {
                                  console.error('Download error:', err);
                                }
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver
                            </Button>
                          )}
                          {doc.content && (
                            <Button size="sm" variant="outline" onClick={() => handleDownloadSignedContent(doc)}>
                              <Eye className="h-3 w-3 mr-1" />
                              Ver
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          );
        })()}

        {/* Enhanced Signature Flow */}
        {documents && documents.filter((d: any) => d.requires_signature !== false).length > 0 && (
          <div ref={signatureSectionRef} className="space-y-4">
            {signwellSigningUrl && !signwellCompleted ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Firma Electrónica
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full border rounded-lg overflow-hidden" style={{ height: '700px' }}>
                    <iframe src={signwellSigningUrl} title="SignWell Firma" className="w-full h-full border-0" allow="camera; microphone" />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* STEP 1: Identity Verification (OTP) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="h-5 w-5" />
                      Paso 1 — Verificación de Identidad
                      {verification.isVerified && <Badge className="bg-green-600 ml-2">✓ Verificado</Badge>}
                    </CardTitle>
                    <CardDescription>
                      Para su seguridad, verificaremos su identidad antes de firmar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!verification.isVerified ? (
                      <>
                        {verification.step === 'idle' || verification.step === 'error' || verification.step === 'sending' ? (
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                              Se enviará un código de verificación de 6 dígitos.
                              El código será válido por 5 minutos.
                            </p>

                            {/* Channel selector if policy allows multiple */}
                            {verification.otpPolicy && verification.otpPolicy.allowed_channels.length > 1 && (
                              <div className="flex gap-2">
                                {verification.otpPolicy.allowed_channels.includes('email') && (
                                  <Button
                                    variant={selectedChannel === 'email' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedChannel('email')}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    Email
                                  </Button>
                                )}
                                {(verification.otpPolicy.allowed_channels.includes('whatsapp') || verification.otpPolicy.allowed_channels.includes('smtp')) && (
                                  <Button
                                    variant={selectedChannel === 'whatsapp' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedChannel('whatsapp')}
                                  >
                                    <Shield className="h-3 w-3 mr-1" />
                                    WhatsApp
                                  </Button>
                                )}
                              </div>
                            )}

                            {verification.error && (
                              <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{verification.error}</AlertDescription>
                              </Alert>
                            )}

                            {/* Show fallback info if previous attempt used fallback */}
                            {verification.fallbackUsed && verification.fallbackReason && (
                              <Alert>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                  <strong>Solicitaste:</strong> {verification.attemptedChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                  <br />
                                  <strong>Se envió por:</strong> {verification.channelUsed === 'whatsapp' ? 'WhatsApp' : 'Email (SMTP)'} (fallback)
                                  <br />
                                  <strong>Razón:</strong> {verification.fallbackReason}
                                </AlertDescription>
                              </Alert>
                            )}

                            <Button
                              onClick={() => {
                                const email = linkData.recipient_email || 
                                  (isTitular ? client?.email : '') || '';
                                // For contratada, use recipient_phone from the link itself
                                const phone = isContratada
                                  ? (linkData as any).recipient_phone || ''
                                  : isTitular ? (client as any)?.phone : 
                                    (sale?.beneficiaries?.find((b: any) => b.id === linkData.recipient_id) as any)?.phone || '';
                                const normalizedPhone = phone && !phone.startsWith('+') ? `+595${phone}` : phone;
                                const effectiveChannel = verification.otpPolicy?.allowed_channels?.includes(selectedChannel)
                                  ? selectedChannel
                                  : verification.otpPolicy?.default_channel || selectedChannel;
                                verification.sendOTP(linkData.id, linkData.sale_id, email, token!, effectiveChannel, normalizedPhone || undefined);
                              }}
                              disabled={verification.step === 'sending' as string}
                              className="w-full"
                            >
                              {(verification.step as string) === 'sending' ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando código...</>
                              ) : (
                                <><Mail className="h-4 w-4 mr-2" />Verificar identidad para firmar</>
                              )}
                            </Button>
                          </div>
                        ) : verification.step === 'awaiting_code' || verification.step === 'verifying' ? (
                          <div className="space-y-3">
                            {/* Show channel info */}
                            {verification.fallbackUsed ? (
                              <Alert>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                  <strong>Solicitaste:</strong> {verification.attemptedChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                  <br />
                                  <strong>Enviado por:</strong> {verification.channelUsed === 'whatsapp' ? 'WhatsApp' : 'Email (SMTP)'} (fallback)
                                  <br />
                                  <span className="text-xs">{verification.fallbackReason}</span>
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Código enviado a <strong>{verification.destinationMasked}</strong>
                                {verification.channelUsed === 'whatsapp' ? ' vía WhatsApp' : ' vía Email'}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Input
                                placeholder="Ingrese código de 6 dígitos"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                className="text-center text-lg tracking-widest font-mono"
                              />
                              <Button
                                onClick={() => verification.verifyOTP(otpCode, linkData.id, token!)}
                                disabled={otpCode.length !== 6 || verification.step === 'verifying'}
                              >
                                {verification.step === 'verifying' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : 'Verificar'}
                              </Button>
                            </div>
                            {verification.error && (
                              <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{verification.error}</AlertDescription>
                              </Alert>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                verification.reset();
                                setOtpCode('');
                                // Re-send OTP automatically
                                setTimeout(() => {
                                  const email = isContratada
                                    ? linkData.recipient_email || ''
                                    : isTitular ? (client as any)?.email :
                                      (sale?.beneficiaries?.find((b: any) => b.id === linkData.recipient_id) as any)?.email ||
                                      (isTitular ? client?.email : '') || '';
                                  const phone = isContratada
                                    ? (linkData as any).recipient_phone || ''
                                    : isTitular ? (client as any)?.phone :
                                      (sale?.beneficiaries?.find((b: any) => b.id === linkData.recipient_id) as any)?.phone || '';
                                  const normalizedPhone = phone && !phone.startsWith('+') ? `+595${phone}` : phone;
                                  const effectiveChannel = verification.otpPolicy?.allowed_channels?.includes(selectedChannel)
                                    ? selectedChannel
                                    : verification.otpPolicy?.default_channel || selectedChannel;
                                  verification.sendOTP(linkData.id, linkData.sale_id, email, token!, effectiveChannel, normalizedPhone || undefined);
                                }, 100);
                              }}
                            >
                              Reenviar código
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                        <CheckCircle className="h-4 w-4" />
                        Identidad verificada exitosamente
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* STEP 2: Legal Consent */}
                {verification.isVerified && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Scale className="h-5 w-5" />
                        Paso 2 — Consentimiento Legal
                        {consentRecordId && <Badge className="bg-green-600 ml-2">✓ Aceptado</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/50 border rounded-lg p-4 text-sm space-y-2">
                        <p className="font-medium">Declaro que:</p>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>He leído el/los documento(s) completo(s) que se me presentan.</li>
                          <li>Acepto firmarlos electrónicamente de manera libre y voluntaria.</li>
                          <li>Comprendo que esta firma tiene validez jurídica conforme a la Ley N° 4017/2010 de la República del Paraguay.</li>
                          <li>Confirmo mi identidad como firmante autorizado.</li>
                          <li>Acepto que se registren evidencias técnicas (dirección IP, dispositivo, marca de tiempo, hash del documento) como parte del proceso de firma.</li>
                        </ol>
                      </div>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm font-medium">
                          He leído y acepto las declaraciones anteriores. Entiendo que mi firma electrónica tendrá la misma validez legal que una firma manuscrita.
                        </span>
                      </label>

                      <Link to="/politica-firma" target="_blank" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />
                        Ver Política de Firma Electrónica
                      </Link>

                      {!consentRecordId && (
                        <Button
                          onClick={handleSaveConsent}
                          disabled={!termsAccepted}
                          variant="outline"
                          className="w-full"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Confirmar Consentimiento
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* STEP 3: Evidence Summary + Signature */}
                {consentRecordId && (
                  <>
                    {/* Evidence Summary */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Info className="h-5 w-5" />
                          Paso 3 — Resumen de Evidencias
                        </CardTitle>
                        <CardDescription>
                          Las siguientes evidencias serán registradas al firmar:
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-muted-foreground text-xs">Dirección IP</p>
                            <p className="font-mono">Registrada automáticamente</p>
                          </div>
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-muted-foreground text-xs">Fecha y Hora</p>
                            <p className="font-mono">{new Date().toLocaleString('es-PY')}</p>
                          </div>
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-muted-foreground text-xs">Identidad Verificada</p>
                            <p className="text-green-600 font-medium">✓ OTP verificado</p>
                          </div>
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-muted-foreground text-xs">Hash del Documento</p>
                            <p className="font-mono text-xs truncate">SHA-256 (generado al firmar)</p>
                          </div>
                          <div className="bg-muted/30 rounded p-3 sm:col-span-2">
                            <p className="text-muted-foreground text-xs">Marco Legal</p>
                            <p>Ley N° 4017/2010 · ISO 14533 · ISO 27001</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Signature Input */}
                    {(() => {
                      const hasElectronicSignature = documents?.some((doc: any) => {
                        const content = (doc.content || '').toLowerCase();
                        return content.includes('signature-type="electronic"') ||
                               content.includes("signature-type='electronic'") ||
                               content.includes('data-signature-type="electronic"') ||
                               content.includes("data-signature-type='electronic'") ||
                               content.includes('signature-type="electronica"') ||
                               content.includes('data-signature-type="electronica"') ||
                               content.includes('firma electrónica') ||
                               content.includes('firma electronica');
                      });

                      return (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Shield className="h-5 w-5" />
                              {hasElectronicSignature ? 'Firma Electrónica' : 'Firma Digital'}
                            </CardTitle>
                            <CardDescription>
                              {hasElectronicSignature
                                ? 'Presione el botón para registrar su firma electrónica con validez legal.'
                                : 'Dibuje su firma en el área a continuación.'}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            {!hasElectronicSignature && (
                              <>
                                <EnhancedSignatureCanvas
                                  onSignatureChange={setSignatureData}
                                  width={600}
                                  height={200}
                                />
                                <Separator />
                              </>
                            )}

                            <Button
                              onClick={handleSignatureComplete}
                              disabled={
                                (!hasElectronicSignature && !signatureData) ||
                                submitSignature.isPending
                              }
                              className="w-full"
                              size="lg"
                            >
                              {submitSignature.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Procesando firma...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Firmar Todos los Documentos
                                </>
                              )}
                            </Button>

                            <p className="text-xs text-center text-muted-foreground">
                              Al firmar, se generará un paquete de evidencia inmutable (Evidence Bundle)
                              que incluye hash SHA-256, marca de tiempo y registro de verificación de identidad.
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default SignatureView;
