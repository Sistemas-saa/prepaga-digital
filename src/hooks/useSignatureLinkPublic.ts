import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

// Singleton clients — avoid multiple GoTrueClient instances warning
const _publicClient = SUPABASE_URL
  ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

const _signatureClientCache = new Map<string, any>();

const getPublicClient = (): any => _publicClient!;

const getSignatureClient = (token: string): any => {
  if (!_signatureClientCache.has(token)) {
    _signatureClientCache.set(
      token,
      createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { 'x-signature-token': token } },
      })
    );
  }
  return _signatureClientCache.get(token)!;
};

interface SignatureLinkData {
  id: string;
  sale_id: string;
  package_id: string | null;
  recipient_type: string;
  recipient_email?: string;
  recipient_id: string | null;
  expires_at: string;
  accessed_at: string | null;
  access_count: number;
  status: string;
  completed_at: string | null;
  signwell_signing_url?: string | null;
  created_at: string;
  updated_at: string | null;
  sale?: {
    id: string;
    contract_number: string | null;
    status: string;
    sale_date: string;
    total_amount: number;
    clients: {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      dni: string | null;
    } | null;
    plans: {
      name: string;
      price: number;
      description: string | null;
    } | null;
    companies: {
      name: string;
      logo_url: string | null;
      primary_color: string | null;
    } | null;
    beneficiaries: Array<{
      id: string;
      first_name: string;
      last_name: string;
      dni: string | null;
      phone: string | null;
      email: string | null;
    }>;
  };
}

export const useSignatureLinkByToken = (token: string) => {
  return useQuery({
    queryKey: ['signature-link-public', token],
    queryFn: async () => {
      if (!token) throw new Error('Token is required');

      const signatureClient = getSignatureClient(token);

      const { data: linkData, error: linkError } = await signatureClient
        .from('signature_links')
        .select('id,sale_id,package_id,recipient_type,recipient_id,recipient_email,recipient_phone,recipient_name,expires_at,accessed_at,access_count,status,completed_at,created_at,updated_at,signwell_signing_url,is_active,step_order')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (linkError) {
        console.error('Error fetching signature link:', linkError);
        throw new Error('Enlace no válido o expirado');
      }

      // Increment access count
      await signatureClient
        .from('signature_links')
        .update({ 
          access_count: (linkData.access_count || 0) + 1,
          accessed_at: new Date().toISOString()
        })
        .eq('id', linkData.id);

      // Get sale data with beneficiaries
      const { data: saleData, error: saleError } = await signatureClient
        .from('sales')
        .select(`
          id,
          contract_number,
          status,
          sale_date,
          total_amount,
          clients:client_id (
            first_name,
            last_name,
            email,
            phone,
            dni
          ),
          plans:plan_id (
            name,
            price,
            description
          ),
          companies:company_id (
            name,
            logo_url,
            primary_color,
            tax_id,
            address,
            phone,
            email
          ),
          beneficiaries (
            id,
            first_name,
            last_name,
            dni,
            phone,
            email
          )
        `)
        .eq('id', linkData.sale_id)
        .single();

      if (saleError) {
        console.error('Error fetching sale data:', saleError);
        throw new Error('No se pudo cargar la información de la venta');
      }

      // Fetch PDF branding images for HTML fallback rendering
      let pdfBranding: { pdf_header_image_url?: string; pdf_footer_image_url?: string } = {};
      try {
        const { data: brandingData } = await signatureClient
          .rpc('get_pdf_branding_by_token', { p_token: token });
        const row = Array.isArray(brandingData) ? brandingData[0] : brandingData;
        if (row) pdfBranding = row;
      } catch { /* ignore */ }

      const result = {
        ...linkData,
        sale: saleData as any,
        isActive: (linkData as any).is_active !== false,
        pdfBranding,
      } as SignatureLinkData & { pdfBranding: typeof pdfBranding };

      return result;
    },
    enabled: !!token,
    retry: 2,
  });
};

export const useSubmitSignatureLink = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      linkId,
      token,
      signatureData,
      identityVerificationId,
      consentRecordId,
    }: {
      linkId: string;
      token: string;
      signatureData: string;
      identityVerificationId?: string;
      consentRecordId?: string;
    }) => {
      const signatureClient = getSignatureClient(token);

      let clientIp = 'unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        clientIp = ipData.ip;
      } catch {
      }

      // Estado previo del enlace. Se captura ANTES del CAS para poder compensarlo (rollback)
      // si más abajo salta la invariante de la contratada: sin esto el link quedaba
      // 'completado' y cualquier reintento entraba por la rama `alreadyCompleted`, dejando a
      // la contratada bloqueada para siempre.
      let prevLinkState: { status: string | null; completed_at: string | null } | null = null;
      try {
        const { data: prevLink } = await signatureClient
          .from('signature_links')
          .select('status,completed_at')
          .eq('id', linkId)
          .maybeSingle();
        if (prevLink) {
          prevLinkState = {
            status: (prevLink as any).status ?? null,
            completed_at: (prevLink as any).completed_at ?? null,
          };
        }
      } catch { /* best-effort: si falla, el rollback usa 'pendiente' */ }

      // CAS (compare-and-swap) atómico: solo marca 'completado' si AÚN NO lo está.
      // Si el titular hace doble/triple clic (o hay submits concurrentes), solo el
      // PRIMERO obtiene la fila; los demás reciben 0 filas y se cortan abajo, evitando
      // que se generen documentos firmados duplicados (bug de 3 contratos/DDJJ).
      const { data, error } = await signatureClient
        .from('signature_links')
        .update({
          status: 'completado',
          completed_at: new Date().toISOString(),
        })
        .eq('id', linkId)
        .neq('status', 'completado')
        .select('id,sale_id,recipient_type,recipient_id,status,completed_at')
        .maybeSingle();

      if (error) {
        console.error('Error updating signature link:', error);
        throw error;
      }

      // 0 filas → el enlace ya estaba 'completado' (otro submit ganó la carrera).
      // Salimos sin re-generar documentos (idempotencia).
      if (!data) {
        console.warn('Firma ya procesada para este enlace; se omite para no duplicar documentos.');
        return { id: linkId, alreadyCompleted: true } as any;
      }

      // Log workflow step
      const { data: existingSteps } = await signatureClient
        .from('signature_workflow_steps')
        .select('step_order')
        .eq('signature_link_id', linkId)
        .order('step_order', { ascending: false })
        .limit(1);

      const nextStepOrder = (existingSteps?.[0]?.step_order || 0) + 1;

      const isSignWellCompletion = signatureData === 'signwell_completed';

      await signatureClient
        .from('signature_workflow_steps')
        .insert({
          signature_link_id: linkId,
          step_order: nextStepOrder,
          step_type: 'signature_completed',
          status: 'completado',
          completed_at: new Date().toISOString(),
          data: {
            signed_ip: clientIp,
            user_agent: navigator.userAgent,
            signature_data_length: signatureData.length,
            signwell: isSignWellCompletion,
          },
        });

      // Update IP address on signature link
      try {
        await signatureClient
          .from('signature_links')
          .update({
            ip_addresses: [clientIp],
          } as any)
          .eq('id', linkId);
      } catch (ipErr) {
      }

      // For SignWell completions, skip canvas-specific document embedding
      // SignWell handles the signed PDF on their platform
      if (isSignWellCompletion) {
        // Log in process_traces for audit trail
        try {
          await signatureClient
            .from('process_traces')
            .insert({
              sale_id: data.sale_id,
              action: 'firma_completada',
              details: {
                recipient_type: data.recipient_type,
                recipient_id: data.recipient_id,
                signed_ip: clientIp,
                signature_link_id: linkId,
                completed_at: new Date().toISOString(),
                provider: 'signwell',
              },
            });
        } catch (traceErr) {
        }
        return data;
      }

      // Detect if this is an electronic signature (JSON string) vs canvas (base64 image)
      let isElectronicSignature = false;
      try {
        const parsed = JSON.parse(signatureData);
        if (parsed.type === 'electronica') isElectronicSignature = true;
      } catch { /* not JSON, so it's canvas data */ }

      // Store signature in documents table for the sale
      // Guardamos el id para poder borrar este documento si después salta la invariante
      // de la contratada (si no, queda un `Firma - Contratada` huérfano por cada intento).
      let firmaDocId: string | null = null;
      try {
        const { data: firmaDoc } = await signatureClient
          .from('documents')
          .insert({
            sale_id: data.sale_id,
            name: `Firma - ${data.recipient_type === 'titular' ? 'Titular' : data.recipient_type === 'contratada' ? 'Contratada' : 'Adherente'}`,
            document_type: 'firma',
            content: signatureData,
            status: 'firmado' as any,
            signed_at: new Date().toISOString(),
            beneficiary_id: data.recipient_id || null,
            requires_signature: false,
            is_final: true,
          })
          .select('id')
          .maybeSingle();
        if (firmaDoc) firmaDocId = (firmaDoc as any).id ?? null;
      } catch (docErr) {
      }

      // Build final signed documents with embedded signature (canvas flow)
      try {
        const recipientType = data.recipient_type;
        const recipientId = data.recipient_id;

        let contratadaMergedOk = false;

        // Tipo de la OTRA parte del contrato (se usa en el merge y al concatenar bloques,
        // para no duplicar el bloque de firma ya presente en el HTML).
        const otherPartyType = recipientType === 'titular' ? 'contratada' : 'titular';

        // === CONTRATADA SPECIAL CASE ===
        // Merge contratada's signature into the existing titular's final contract
        // instead of creating a separate document
        if (recipientType === 'contratada') {
          try {
            // NO filtrar por is_final: si otro flujo (p. ej. reenvío del link del titular)
            // reseteó is_final a false, la búsqueda no encontraba nada y el fallback de abajo
            // BORRABA el contrato firmado por el titular. Traemos TODOS los contratos de la
            // venta y elegimos en JS el que realmente tenga la firma del titular.
            const { data: contratoDocs } = await signatureClient
              .from('documents')
              .select('*')
              .eq('sale_id', data.sale_id)
              .is('beneficiary_id', null)
              .eq('document_type', 'contrato')
              .order('created_at', { ascending: false });

            const conFirmaTitular = (contratoDocs || []).filter(
              (d: any) => typeof d.content === 'string' && d.content.includes('data-signer="titular"')
            );
            // Preferimos el que aún NO tenga la firma de la contratada (sigue con el placeholder).
            const titularDoc =
              conFirmaTitular.find((d: any) => d.content.includes('Pendiente firma de la empresa')) ||
              conFirmaTitular[0] ||
              null;

            if (titularDoc) {
              let finalContent = titularDoc.content || '';
              const nowIso = new Date().toISOString();
              const safeSignedAt = new Date().toLocaleString('es-PY');

              // Fetch contratada signer info via SECURITY DEFINER RPC
              let cInfo: any = null;
              try {
                const { data: contratadaInfo } = await signatureClient
                  .rpc('get_contratada_info_by_token', { p_token: token });
                cInfo = Array.isArray(contratadaInfo) ? contratadaInfo[0] : contratadaInfo;
              } catch { /* ignore */ }

              let isElecSig = false;
              try {
                const parsed = JSON.parse(signatureData);
                if (parsed.type === 'electronica') isElecSig = true;
              } catch { /* not JSON */ }

              const signerName = cInfo?.signer_name || (data as any)?.recipient_name || 'Representante Legal';
              const signerCI = cInfo?.signer_dni || '';

              let contratadaBlock: string;
              if (isElecSig) {
                const d = new Date();
                const fd = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
                contratadaBlock = `
                  <div data-signer="contratada" style="display:inline-block;vertical-align:top;width:48%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">
                    <p style="margin:0 0 2px 0;font-size:11px;">Firmado electrónicamente por: <strong>${signerName}</strong></p>
                    <p style="margin:0 0 12px 0;font-size:11px;">Fecha: ${fd}</p>
                    <div style="border-top:1px solid #555;width:80%;margin:0 0 6px 0;"></div>
                    <p style="margin:0;font-size:11px;font-weight:bold;">CONTRATADA</p>
                    <p style="margin:4px 0 0 0;font-size:11px;">Aclaración: ${signerName}</p>
                    <p style="margin:2px 0 0 0;font-size:11px;">C.I.Nº: ${signerCI}</p>
                  </div>
                `;
              } else {
                contratadaBlock = `
                  <div data-signer="contratada" style="display:inline-block;vertical-align:top;width:48%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">
                    <div style="text-align:center;">
                      <img src="${signatureData}" alt="Firma digital" style="max-width:280px;max-height:120px;display:block;" />
                      <p style="margin:4px 0 0 0;font-size:10px;color:#6b7280;">Firmado el: ${safeSignedAt}</p>
                    </div>
                    <div style="border-top:1px solid #555;width:80%;margin:6px 0 6px 0;"></div>
                    <p style="margin:0;font-size:11px;font-weight:bold;">CONTRATADA</p>
                    <p style="margin:4px 0 0 0;font-size:11px;">Aclaración: ${signerName}</p>
                    <p style="margin:2px 0 0 0;font-size:11px;">C.I.Nº: ${signerCI}</p>
                  </div>
                `;
              }

              // Replace "Pendiente firma de la empresa" placeholder with actual contratada signature
              // Use a robust parser approach instead of regex (nested divs break lazy regex)
              let mergeSuccess = false;
              const pendienteIdx = finalContent.indexOf('Pendiente firma de la empresa');
              if (pendienteIdx !== -1) {
                // Walk backwards to find the opening <div with display:inline-block
                const before = finalContent.substring(0, pendienteIdx);
                const lastDivOpen = before.lastIndexOf('<div');
                if (lastDivOpen !== -1) {
                  // Check if this div has inline-block style
                  const divTag = finalContent.substring(lastDivOpen, pendienteIdx);
                  if (divTag.includes('inline-block') || divTag.includes('display:')) {
                    // Find the matching closing </div> by counting depth
                    let depth = 1;
                    let pos = finalContent.indexOf('>', lastDivOpen) + 1;
                    while (pos < finalContent.length && depth > 0) {
                      const nextOpen = finalContent.indexOf('<div', pos);
                      const nextClose = finalContent.indexOf('</div>', pos);
                      if (nextClose === -1) break;
                      if (nextOpen !== -1 && nextOpen < nextClose) {
                        depth++;
                        pos = nextOpen + 4;
                      } else {
                        depth--;
                        pos = nextClose + 6;
                      }
                    }
                    if (depth === 0) {
                      finalContent = finalContent.substring(0, lastDivOpen) + contratadaBlock + finalContent.substring(pos);
                      mergeSuccess = true;
                    }
                  }
                }
              }

              if (!mergeSuccess) {
                // Fallback: append contratada signature block
                finalContent += contratadaBlock;
              }

              // Update the existing final doc with both signatures merged.
              // `is_final: true` + `status: 'firmado'` son OBLIGATORIOS: la búsqueda de
              // titularDoc ya no filtra por is_final, así que puede venir con false/null.
              // Si quedara así, `finalize-signature-link` (que consulta is_final = true) no le
              // genera el PDF ni lo firma con PAdES y el contrato correcto queda invisible.
              await signatureClient
                .from('documents')
                .update({
                  content: finalContent,
                  signed_at: nowIso,
                  signature_data: signatureData,
                  is_final: true,
                  status: 'firmado' as any,
                } as any)
                .eq('id', titularDoc.id);

              // Update original doc status
              await signatureClient
                .from('documents')
                .update({
                  status: 'firmado' as any,
                  signed_at: nowIso,
                  signature_data: signatureData,
                } as any)
                .eq('sale_id', data.sale_id)
                .eq('is_final', false)
                .is('beneficiary_id', null)
                .eq('document_type', 'contrato');

              // RECONCILIACIÓN: dejar UN SOLO contrato final en la venta (el que acabamos de
              // mergear, con ambas firmas). Sin esto la venta quedaba con varios is_final=true
              // y `finalize-signature-link` generaba/enviaba un PDF por cada uno.
              try {
                await signatureClient
                  .from('documents')
                  .update({ is_final: false } as any)
                  .eq('sale_id', data.sale_id)
                  .is('beneficiary_id', null)
                  .eq('document_type', 'contrato')
                  .neq('id', titularDoc.id);
              } catch (dedupeErr) {
                // No debe impedir que la firma se complete.
                console.error('[firma][contratada] no se pudo desmarcar los contratos finales duplicados:', dedupeErr);
              }

              contratadaMergedOk = true;
            }
          } catch (mergeErr) {
            // Nunca silenciar: si el merge falla, abajo se lanza un error de invariante.
            console.error('[firma][contratada] merge falló:', mergeErr);
          }
        }

        // INVARIANTE DE SEGURIDAD: el bloque `if (!contratadaMergedOk)` hace un DELETE de los
        // documentos finales y reconstruye desde la plantilla sin firma. Para la CONTRATADA eso
        // destruiría la firma ya capturada del titular. Preferimos fallar de forma visible.
        if (!contratadaMergedOk && recipientType === 'contratada') {
          // COMPENSACIÓN (rollback best-effort). Al llegar acá ya se ejecutaron dos escrituras:
          //  1) el CAS que dejó el signature_link en 'completado' → sin revertirlo, cualquier
          //     reintento cae en la rama `alreadyCompleted` y la contratada queda BLOQUEADA;
          //  2) el insert del documento `Firma - Contratada` → queda huérfano.
          // Cada paso va en su propio try/catch para que un fallo de limpieza no tape el
          // error original de invariante, que es el que debe llegar a la UI.
          try {
            await signatureClient
              .from('signature_links')
              .update({
                status: prevLinkState?.status ?? 'pendiente',
                completed_at: prevLinkState?.completed_at ?? null,
              })
              .eq('id', linkId);
            console.error('[firma][contratada] invariante: signature_link revertido a', prevLinkState?.status ?? 'pendiente', '(reintentable)', { linkId });
          } catch (rbLinkErr) {
            console.error('[firma][contratada] no se pudo revertir el signature_link:', rbLinkErr);
          }

          try {
            if (firmaDocId) {
              await signatureClient.from('documents').delete().eq('id', firmaDocId);
              console.error('[firma][contratada] invariante: documento "Firma - Contratada" eliminado', { firmaDocId });
            }
          } catch (rbDocErr) {
            console.error('[firma][contratada] no se pudo borrar el documento de firma huérfano:', rbDocErr);
          }

          const invariantErr: any = new Error(
            'No se encontró el contrato firmado por el titular. No se puede firmar como contratada sin perder la firma del cliente. Contactá al administrador.'
          );
          invariantErr.__fatalSignature = true; // marca para que el catch exterior lo re-lance
          throw invariantErr;
        }

        if (!contratadaMergedOk) {
        // First, delete any existing final copies for this recipient to avoid duplicates
        let deleteQuery = signatureClient
          .from('documents')
          .delete()
          .eq('sale_id', data.sale_id)
          .eq('is_final', true)
          .neq('document_type', 'firma');

        if (recipientType === 'adherente' && recipientId) {
          deleteQuery = deleteQuery.eq('beneficiary_id', recipientId);
        } else if (recipientType === 'contratada') {
          // Contratada only signs contracts (no beneficiary_id)
          deleteQuery = deleteQuery.is('beneficiary_id', null).eq('document_type', 'contrato');
        } else if (recipientType === 'titular') {
          deleteQuery = deleteQuery.is('beneficiary_id', null);
        }
        await deleteQuery;

        // Query documents to sign — filtered by role
        // IMPORTANT: always filter requires_signature = true to exclude annexes
        // BUG FIX: Use 'neq(is_final, true)' instead of 'eq(is_final, false)'
        // because some documents are created with is_final: null (not set),
        // and null != false in PostgreSQL, causing them to be missed.
        let docsQuery = signatureClient
          .from('documents')
          .select('*')
          .eq('sale_id', data.sale_id)
          .neq('document_type', 'firma')
          .neq('document_type', 'anexo')
          .neq('is_final', true)
          .eq('requires_signature', true);

        if (recipientType === 'adherente' && recipientId) {
          docsQuery = docsQuery.eq('beneficiary_id', recipientId);
        } else if (recipientType === 'contratada') {
          // Contratada only signs the contract document
          docsQuery = docsQuery.is('beneficiary_id', null).eq('document_type', 'contrato');
        } else if (recipientType === 'titular') {
          docsQuery = docsQuery.is('beneficiary_id', null);
        }

        const { data: docsToSign, error: docsError } = await docsQuery;
        if (docsError) throw docsError;

        if (docsToSign && docsToSign.length > 0) {
          const nowIso = new Date().toISOString();
          const safeSignedAt = new Date().toLocaleString('es-PY');

          // Fetch company info + client/beneficiary data + company settings for signature blocks
          let companyInfo: any = null;
          let saleClientInfo: any = null;
          let saleBeneficiaries: any[] = [];
          let companySettings: any = null;
          let saleSignerInfo: any = null; // responsable de pago si aplica
          try {
            const { data: saleInfo } = await signatureClient
              .from('sales')
              .select('company_id, signer_type, signer_name, signer_dni, signer_phone, signer_email, signer_relationship, companies:company_id(name, tax_id, address, phone, email), clients:client_id(first_name, last_name, dni), beneficiaries(id, first_name, last_name, dni)')
              .eq('id', data.sale_id)
              .single();
            companyInfo = (saleInfo as any)?.companies || null;
            saleClientInfo = (saleInfo as any)?.clients || null;
            saleBeneficiaries = (saleInfo as any)?.beneficiaries || [];
            // Si hay responsable de pago, guardarlo para usarlo en el bloque de firma
            if ((saleInfo as any)?.signer_type === 'responsable_pago' && (saleInfo as any)?.signer_name) {
              saleSignerInfo = {
                nombre: (saleInfo as any).signer_name,
                ci: (saleInfo as any).signer_dni || '',
                email: (saleInfo as any).signer_email || '',
                telefono: (saleInfo as any).signer_phone || '',
                relacion: (saleInfo as any).signer_relationship || 'Responsable de Pago',
              };
            }

            // Fetch contratada signer info via SECURITY DEFINER RPC
            try {
              const { data: contratadaRpc } = await signatureClient
                .rpc('get_contratada_info_by_token', { p_token: token });
              const cRpc = Array.isArray(contratadaRpc) ? contratadaRpc[0] : contratadaRpc;
              if (cRpc) {
                companySettings = {
                  contratada_signer_name: cRpc.signer_name,
                  contratada_signer_dni: cRpc.signer_dni,
                  contratada_signer_email: cRpc.signer_email,
                };
              }
            } catch { /* ignore */ }
          } catch { /* ignore */ }

          // Check if the other party (contratante or contratada) already signed the contract
          let existingOtherPartyBlock: string | null = null;
          if (recipientType === 'titular' || recipientType === 'contratada') {
            try {
              const otherType = otherPartyType;
              // SIN filtro `.eq('is_final', true)`: esta consulta corre DESPUÉS del delete de
              // arriba, que borra justamente los is_final=true. Con el filtro, al re-firmar el
              // titular se perdía el bloque ya firmado de la contratada. Traemos todos los
              // contratos de la venta (más nuevo primero) y elegimos en JS el que realmente
              // contiene el bloque de la otra parte.
              const { data: otherContractDocs } = await signatureClient
                .from('documents')
                .select('content,created_at')
                .eq('sale_id', data.sale_id)
                .is('beneficiary_id', null)
                .like('document_type', '%contrato%')
                .order('created_at', { ascending: false });
              const otherPartyDoc = (otherContractDocs || []).find(
                (d: any) => typeof d.content === 'string' && d.content.includes(`data-signer="${otherType}"`)
              );
              if (otherPartyDoc) {
                const otherContent = otherPartyDoc.content || '';
                try {
                  const parser = new DOMParser();
                  const parsedDoc = parser.parseFromString(otherContent, 'text/html');
                  const signerBlock = parsedDoc.querySelector(`[data-signer="${otherType}"]`);
                  if (signerBlock) {
                    existingOtherPartyBlock = signerBlock.outerHTML;
                  } else {
                    const roleText = otherType === 'contratada' ? 'CONTRATADA' : 'CONTRATANTE';
                    const allDivs = parsedDoc.querySelectorAll('div');
                    for (const div of Array.from(allDivs)) {
                      if (
                        div.textContent?.includes(roleText) &&
                        div.querySelectorAll('p').length >= 2 &&
                        !div.querySelector('div')
                      ) {
                        existingOtherPartyBlock = div.outerHTML;
                        break;
                      }
                    }
                  }
                } catch { /* ignore parsing errors */ }
              }
            } catch { /* ignore */ }
          }

          const finalDocs = docsToSign.map((doc) => {
            const originalContent = doc.content?.trim()
              ? doc.content
              : `
                  <div>
                    <h3>${doc.name}</h3>
                    <p>Documento firmado digitalmente.</p>
                    ${doc.file_url ? `<p><strong>Archivo original:</strong> ${doc.file_url}</p>` : ''}
                  </div>
                `;

            // Build signature block depending on type (canvas vs electronic)
            let signatureBlock: string;
            let signatureImgWithDate: string;

            if (isElectronicSignature) {
              const isoTimestamp = new Date().toISOString();
              const signedDate = new Date();
              const formattedDate = `${String(signedDate.getDate()).padStart(2,'0')}.${String(signedDate.getMonth()+1).padStart(2,'0')}.${signedDate.getFullYear()} ${String(signedDate.getHours()).padStart(2,'0')}:${String(signedDate.getMinutes()).padStart(2,'0')}:${String(signedDate.getSeconds()).padStart(2,'0')}`;

              let signerName = '';
              let signerCI = '';
              let roleLabel = 'CONTRATANTE';

              if (recipientType === 'adherente' && recipientId && saleBeneficiaries.length > 0) {
                const ben = saleBeneficiaries.find((b: any) => b.id === recipientId);
                if (ben) {
                  signerName = `${ben.first_name || ''} ${ben.last_name || ''}`.trim();
                  signerCI = ben.dni || '';
                }
                roleLabel = 'ADHERENTE';
              } else if (recipientType === 'contratada') {
                signerName = companySettings?.contratada_signer_name || (data as any)?.recipient_name || 'Representante Legal';
                signerCI = companySettings?.contratada_signer_dni || '';
                roleLabel = 'CONTRATADA';
              } else if (saleSignerInfo) {
                // Responsable de pago firma en lugar del titular
                signerName = saleSignerInfo.nombre;
                signerCI = saleSignerInfo.ci;
                roleLabel = 'CONTRATANTE';
              } else if (saleClientInfo) {
                signerName = `${saleClientInfo.first_name || ''} ${saleClientInfo.last_name || ''}`.trim();
                signerCI = saleClientInfo.dni || '';
                roleLabel = 'CONTRATANTE';
              }

              const deviceSummary = navigator.userAgent.replace(/\s+/g, ' ').substring(0, 80);
              const hashRef = Array.from(new TextEncoder().encode(signatureData + isoTimestamp))
                .reduce((a, b) => ((a << 5) - a + b) | 0, 0)
                .toString(16).replace('-', '').toUpperCase().padStart(8, '0');

              // Detect signature style from document content
              const useV1 = originalContent.includes('data-signature-style="v1"');

              let electronicBlock: string;
              if (useV1) {
                // v1.0 — Detailed block with metadata
                const signerAttr = recipientType === 'contratada' ? 'contratada' : recipientType === 'adherente' ? 'adherente' : 'titular';
                electronicBlock = `
                  <div data-signer="${signerAttr}" style="display:inline-block;vertical-align:top;width:48%;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111;border:1px solid #ccc;border-radius:6px;padding:10px;">
                    <table style="width:100%;border-collapse:collapse;font-size:10px;">
                      <tr><td style="color:#666;padding:1px 4px;">Firmante:</td><td><strong>${signerName}</strong></td></tr>
                      <tr><td style="color:#666;padding:1px 4px;">Fecha:</td><td>${formattedDate}</td></tr>
                      <tr><td style="color:#666;padding:1px 4px;">Ref. Doc.:</td><td style="font-family:monospace;font-size:9px;">${isoTimestamp.substring(0,8)}…</td></tr>
                      <tr><td style="color:#666;padding:1px 4px;">IP:</td><td style="font-family:monospace;">Registrada</td></tr>
                      <tr><td style="color:#666;padding:1px 4px;">Dispositivo:</td><td style="font-size:9px;">${deviceSummary.substring(0,40)}…</td></tr>
                      <tr><td style="color:#666;padding:1px 4px;">Hash:</td><td style="font-family:monospace;font-size:9px;">${hashRef}</td></tr>
                    </table>
                    <p style="margin:4px 0 0;font-size:9px;color:#666;font-style:italic;">Firma válida conforme a Ley 4017/2010</p>
                    <div style="border-top:1px solid #333;width:80%;margin:6px 0 4px 0;"></div>
                    <p style="margin:0;text-align:center;font-weight:bold;font-size:10px;">${roleLabel}</p>
                    <p style="margin:2px 0 0 0;font-size:10px;">Aclaración: ${signerName || '.............................'}</p>
                    <p style="margin:2px 0 0 0;font-size:10px;">C.I.Nº: ${signerCI || '.............................'}</p>
                  </div>
                `;
              } else {
                // v2.0 — Professional block matching reference PDF format
                const signerAttrV2 = recipientType === 'contratada' ? 'contratada' : recipientType === 'adherente' ? 'adherente' : 'titular';
                electronicBlock = `
                  <div data-signer="${signerAttrV2}" style="display:inline-block;vertical-align:top;width:48%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">
                    <p style="margin:0 0 2px 0;font-size:11px;">Firmado electrónicamente por: <strong>${signerName}</strong></p>
                    <p style="margin:0 0 12px 0;font-size:11px;">Fecha: ${formattedDate}</p>
                    <div style="border-top:1px solid #555;width:80%;margin:0 0 6px 0;"></div>
                    <p style="margin:0;font-size:11px;font-weight:bold;">${roleLabel}</p>
                    <p style="margin:4px 0 0 0;font-size:11px;">Aclaración: ${signerName || '.............................'}</p>
                    <p style="margin:2px 0 0 0;font-size:11px;">C.I.Nº: ${signerCI || '.............................'}</p>
                  </div>
                `;
              }
              signatureImgWithDate = electronicBlock;
              signatureBlock = electronicBlock;
            } else {
              const signatureImg = `<img src="${signatureData}" alt="Firma digital" style="max-width:280px;max-height:120px;display:block;" />`;
              signatureImgWithDate = `
                <div style="text-align:center;">
                  ${signatureImg}
                  <p style="margin:4px 0 0 0;font-size:10px;color:#6b7280;">Firmado el: ${safeSignedAt}</p>
                </div>
              `;
              signatureBlock = `
                <hr style="margin:24px 0;border:none;border-top:1px solid #d1d5db;" />
                <section style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
                  <h4 style="margin:0 0 8px 0;font-size:14px;">Firma Digital Incrustada</h4>
                  <p style="margin:0 0 8px 0;font-size:12px;color:#4b5563;">
                    Firmado el: ${safeSignedAt}
                  </p>
                  ${signatureImg}
                </section>
              `;
            }

            // Try to replace signature placeholders in the document content
            const placeholderPatterns = recipientType === 'adherente'
              ? [/\{\{firma_adherente\}\}/gi, /\{\{firma_contratante\}\}/gi, /\{\{firma_titular\}\}/gi]
              : recipientType === 'contratada'
              ? [/\{\{firma_contratada\}\}/gi]
              : [/\{\{firma_contratante\}\}/gi, /\{\{firma_titular\}\}/gi];

            const textMarkerPatterns = [/Firma del Cliente/gi];

            let finalContent = originalContent;
            let placeholderFound = false;

            // FIRST: Replace <div data-signature-field="true" ...>...</div> elements
            // Role-aware: only replace the field matching the current signer
            // 'cliente' role = titular / adherente; 'empresa' role = contratada
            const signerRoleForField = recipientType === 'contratada' ? 'empresa' : 'cliente';

            // Helper: find the full outer div (handles nested divs)
            const findFullSignatureDiv = (html: string, role: string): { start: number; end: number } | null => {
              const tagRegex = /<div\b([^>]*)>/gi;
              let m: RegExpExecArray | null;
              while ((m = tagRegex.exec(html)) !== null) {
                const attrs = m[1];
                const hasField = /data-signature-field\s*=\s*["']true["']/i.test(attrs);
                const hasRole = new RegExp(`data-signer-role\\s*=\\s*["']${role}["']`, 'i').test(attrs);
                const noRoleAttr = !/data-signer-role/i.test(attrs);
                if (!hasField) continue;
                if (!hasRole && !(noRoleAttr && role === 'cliente')) continue;

                const start = m.index;
                let depth = 1;
                let pos = start + m[0].length;
                while (pos < html.length && depth > 0) {
                  const nextOpen = html.indexOf('<div', pos);
                  const nextClose = html.indexOf('</div>', pos);
                  if (nextClose === -1) break;
                  if (nextOpen !== -1 && nextOpen < nextClose) {
                    depth++;
                    pos = nextOpen + 4;
                  } else {
                    depth--;
                    pos = nextClose + 6;
                  }
                }
                return { start, end: pos };
              }
              return null;
            };

            const sigDivRange = findFullSignatureDiv(finalContent, signerRoleForField);
            if (sigDivRange) {
              finalContent =
                finalContent.substring(0, sigDivRange.start) +
                signatureImgWithDate +
                finalContent.substring(sigDivRange.end);
              placeholderFound = true;
            }

            // If signer is titular/adherente: clean up the 'empresa' field to leave it blank
            // (Contratada will sign in their own step)
            if (recipientType !== 'contratada') {
              const empresaRange = findFullSignatureDiv(finalContent, 'empresa');
              if (empresaRange) {
                const emptyContratadaBlock = `
                  <div style="display:inline-block;vertical-align:top;width:48%;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">
                    <p style="margin:0 0 12px 0;font-size:11px;">Pendiente firma de la empresa</p>
                    <hr style="border:none;border-top:1px solid #555;width:80%;margin:0 0 6px 0;" />
                    <p style="margin:0;font-size:11px;font-weight:bold;">CONTRATADA</p>
                    <p style="margin:4px 0 0 0;font-size:11px;">Aclaración: .............................</p>
                    <p style="margin:2px 0 0 0;font-size:11px;">C.I.Nº: .............................</p>
                  </div>
                `;
                finalContent =
                  finalContent.substring(0, empresaRange.start) +
                  emptyContratadaBlock +
                  finalContent.substring(empresaRange.end);
              }
            }

            // Limpieza de texto de atributos que se filtró de la sanitización.
            // Antes usaba `[^<]*`, que consumía TODO hasta el siguiente `<` — incluido el `>`
            // que cierra la etiqueta — dejando `<div ` sin cerrar y produciendo el HTML
            // corrupto `<div <div class="text-center...`. `[^<>]*` no puede cruzar el `>`.
            const rawAttrRegex = /data-signature-field\s*=\s*["']true["'][^<>]*/gi;
            const prevContent = finalContent;
            finalContent = finalContent.replace(rawAttrRegex, '');
            // Guarda de seguridad: si aun así quedó una etiqueta sin cerrar, descartamos la limpieza.
            if (/<\w+\s+</.test(finalContent)) {
              console.error(
                '[firma] limpieza de data-signature-field produjo HTML corrupto (etiqueta sin cerrar); se descarta el replace.',
                { docId: doc.id, docName: doc.name }
              );
              finalContent = prevContent;
            }

            // Then try placeholder patterns
            if (!placeholderFound) {
              for (const pattern of placeholderPatterns) {
                if (pattern.test(finalContent)) {
                  finalContent = finalContent.replace(pattern, signatureImgWithDate);
                  placeholderFound = true;
                  break;
                }
              }
            }

            // Try text marker replacement if no placeholder found
            if (!placeholderFound) {
              for (const pattern of textMarkerPatterns) {
                if (pattern.test(finalContent)) {
                  finalContent = finalContent.replace(pattern, signatureImgWithDate);
                  placeholderFound = true;
                  break;
                }
              }
            }

            // Fallback: append signature block at the end (only if nothing was replaced)
            if (!placeholderFound) {
              finalContent = `${finalContent}${signatureBlock}`;
            }

            // For contract documents: merge with existing other party block if available
            const isContractDoc = doc.document_type === 'contrato' || doc.name?.toLowerCase().includes('contrato');
            // Solo concatenar si el bloque de la otra parte NO está ya presente:
            // si el merge previo lo insertó, agregarlo de nuevo duplicaba la firma.
            const yaTieneOtraParte = finalContent.includes(`data-signer="${otherPartyType}"`);
            if (
              isContractDoc &&
              existingOtherPartyBlock &&
              !yaTieneOtraParte &&
              (recipientType === 'titular' || recipientType === 'contratada')
            ) {
              // Add the other party's block side by side
              finalContent = `${finalContent}${existingOtherPartyBlock}`;
            }

            return {
              sale_id: doc.sale_id,
              beneficiary_id: doc.beneficiary_id,
              name: `${doc.name} (Firmado)`,
              document_type: doc.document_type || 'documento',
              document_type_id: doc.document_type_id,
              generated_from_template: doc.generated_from_template,
              requires_signature: false,
              is_final: true,
              status: 'firmado' as const,
              signed_at: nowIso,
              signed_by: null,
              signature_data: signatureData,
              file_url: null,
              content: finalContent,
              version: (doc.version || 1) + 1,
            };
          });

          await signatureClient.from('documents').insert(finalDocs as any);

          await signatureClient
            .from('documents')
            .update({
              status: 'firmado',
              signed_at: nowIso,
              signature_data: signatureData,
            } as any)
            .in('id', docsToSign.map((d) => d.id));
        }
        } // end if (!contratadaMergedOk)
      } catch (signedDocsErr: any) {
        console.error('[firma] error armando documentos finales:', signedDocsErr);
        // El error de invariante NO puede tragarse: debe llegar al onError del mutation
        // para que la UI le muestre al usuario que no se firmó.
        if (signedDocsErr?.__fatalSignature) throw signedDocsErr;
      }

      // Log in process_traces for audit trail
      try {
        await signatureClient
          .from('process_traces')
          .insert({
            sale_id: data.sale_id,
            action: 'firma_completada',
            details: {
              recipient_type: data.recipient_type,
              recipient_id: data.recipient_id,
              signed_ip: clientIp,
              signature_link_id: linkId,
              completed_at: new Date().toISOString(),
            },
          });
      } catch (traceErr) {
      }

      // --- POST FIRMA: delegar todo al backend ---
      try {
        const finalizeResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/finalize-signature-link`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              token,
              clientIp,
              userAgent: navigator.userAgent,
              identityVerificationId: identityVerificationId || null,
              consentRecordId: consentRecordId || null,
              skipEventInsert: true,
            }),
          }
        );
        const finalizeResult = await finalizeResponse.json();
        if (!finalizeResult.ok) {
        }
      } catch (finalizeErr) {
        // No bloquear la firma si falla el pipeline backend
      }

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['signature-link-public', variables.token] });
      queryClient.invalidateQueries({ queryKey: ['signature-link-documents', data.sale_id] });
      queryClient.invalidateQueries({ queryKey: ['all-signature-links-public', data.sale_id] });
      toast({
        title: "¡Firma completada!",
        description: "Su firma ha sido registrada exitosamente.",
      });
    },
    onError: (error: any) => {
      console.error('Error submitting signature:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo registrar la firma. Inténtelo nuevamente.",
        variant: "destructive",
      });
    },
  });
};

/**
 * Fetch documents filtered by recipient type:
 * - titular: sees ALL documents
 * - adherente: sees only their own DDJJ (filtered by beneficiary_id)
 */
export const useSignatureLinkDocuments = (
  saleId: string | undefined, 
  recipientType?: string,
  recipientId?: string | null,
  token?: string
) => {
  return useQuery({
    queryKey: ['signature-link-documents', saleId, recipientType, recipientId],
    queryFn: async () => {
      if (!saleId) return [];

      // Use token-authenticated client so RLS policies work
      const client = token 
        ? getSignatureClient(token)
        : getPublicClient();

      let query = client
        .from('documents')
        .select('*')
        .eq('sale_id', saleId)
        .neq('document_type', 'firma') // Exclude signature images
        .order('created_at', { ascending: true });

      if (recipientType === 'adherente' && recipientId) {
        // Adherente only sees their own documents
        query = query.eq('beneficiary_id', recipientId);
      } else if (recipientType === 'contratada') {
        // Contratada only sees the contract document (no DDJJ, no annexes)
        query = query.is('beneficiary_id', null).eq('document_type', 'contrato');
      } else if (recipientType === 'titular') {
        // Titular sees only documents without a beneficiary_id (their own docs)
        query = query.is('beneficiary_id', null);
      }

      // For contratada: deduplicate contract documents
      // Show only the UNSIGNED original for signing; exclude already-signed copies
      if (recipientType === 'contratada') {
        const { data, error } = await query;
        if (error) { console.error('Error fetching documents:', error); throw error; }
        const docs = data || [];
        if (docs.length === 0) return [];
        
        // Group by base document name (strip " (Firmado)" and role suffixes)
        const baseName = (name: string) => 
          name
            .replace(/\s*\(Firmado\)(\s*\(Firmado\))*/gi, '')
            .replace(/\s*-\s*Representante\s*Legal\s*$/i, '')
            .trim();
        
        const groups: Record<string, any[]> = {};
        for (const doc of docs) {
          const key = baseName(doc.name);
          if (!groups[key]) groups[key] = [];
          groups[key].push(doc);
        }
        
        // For each group: if there's an unsigned original (is_final: false), show that for signing.
        // If ALL copies are final/signed, show the latest signed one as read-only.
        const result: any[] = [];
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          const unsigned = group.find((d: any) => !d.is_final && !d.signed_pdf_url);
          if (unsigned) {
            result.push(unsigned);
          } else {
            // All signed — pick the latest
            const sorted = group.sort((a: any, b: any) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            result.push(sorted[0]);
          }
        }
        return result;
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching documents:', error);
        throw error;
      }

      const docs = data || [];

      // If final signed documents exist, prioritize them to avoid showing stale pre-signature versions
      const hasFinalSignedDocs = docs.some((d: any) => d.is_final === true && d.requires_signature !== false);
      if (hasFinalSignedDocs) {
        return docs
          .filter((d: any) => d.is_final === true || d.requires_signature === false)
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      return docs;
    },
    enabled: !!saleId,
  });
};

/**
 * Fetch all signature links for a sale to show completion status to titular
 */
export const useAllSignatureLinksPublic = (saleId: string | undefined, token?: string) => {
  return useQuery({
    queryKey: ['all-signature-links-public', saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const client = token
        ? getSignatureClient(token)
        : getPublicClient();
      const { data, error } = await client
        .from('signature_links')
        .select('id,sale_id,recipient_type,recipient_id,status,completed_at,created_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!saleId,
  });
};
