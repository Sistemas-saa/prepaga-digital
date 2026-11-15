import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { generateUUID } from '@/lib/utils';
import { toast } from 'sonner';

interface GeneratedLink {
  type: 'titular' | 'adherente' | 'contratada';
  name?: string;
  email: string;
  token: string;
  expires_at: string;
}

export const useCreateAllSignatureLinks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ saleId }: { saleId: string }): Promise<GeneratedLink[]> => {
      // 1. Obtener datos de la venta con joins
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*, clients(*), beneficiaries(*)')
        .eq('id', saleId)
        .single();

      if (saleError || !sale) {
        throw new Error('Venta no encontrada');
      }

      if (!sale.clients) {
        throw new Error('La venta debe tener un cliente asignado');
      }

      // Fetch company settings for contratada signature config
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('contratada_signature_mode, contratada_signer_name, contratada_signer_email, contratada_signer_dni, contratada_signer_phone')
        .eq('company_id', sale.company_id)
        .single();

      const results: GeneratedLink[] = [];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1); // 24 horas

      // 2. Generar enlace para el firmante principal (titular o responsable de pago)
      const titularToken = generateUUID();
      const isResponsablePago = (sale as any).signer_type === 'responsable_pago';

      // Si hay responsable de pago, el link va a esa persona; si no, al titular/cliente
      const signerEmail = isResponsablePago
        ? ((sale as any).signer_email || sale.clients.email || '')
        : (sale.clients.email || '');
      const signerPhone = isResponsablePago
        ? ((sale as any).signer_phone || sale.clients.phone || null)
        : (sale.clients.phone || null);
      const signerName = isResponsablePago
        ? ((sale as any).signer_name || `${sale.clients.first_name} ${sale.clients.last_name}`)
        : `${sale.clients.first_name} ${sale.clients.last_name}`;

      const { data: titularLink, error: titularError } = await supabase
        .from('signature_links')
        .insert({
          sale_id: saleId,
          token: titularToken,
          recipient_type: 'titular',
          recipient_name: isResponsablePago ? (sale as any).signer_name || null : null,
          recipient_email: signerEmail,
          recipient_phone: signerPhone,
          recipient_id: isResponsablePago ? null : sale.client_id,
          expires_at: expiresAt.toISOString(),
          status: 'pendiente',
          step_order: 1,
          is_active: true,
        } as any)
        .select()
        .single();

      if (titularError) {
        console.error('Error creating titular link:', titularError);
      } else if (titularLink) {
        results.push({
          type: 'titular',
          name: signerName,
          email: signerEmail,
          token: titularLink.token,
          expires_at: titularLink.expires_at,
        });
      }

      // 3. Generar enlaces para adherentes que requieren firma
      if (sale.beneficiaries && Array.isArray(sale.beneficiaries) && sale.beneficiaries.length > 0) {
        for (const beneficiary of sale.beneficiaries) {
          // Los beneficiarios is_primary representan a la titular (se crean automáticamente
          // al cargar su DDJJ) y ya están cubiertos por el link de tipo 'titular' — no deben
          // generar un link de tipo 'adherente' propio.
          if (beneficiary.is_primary) continue;

          // Contratos de EMPRESA en modo 'representante': firma solo el
          // representante legal, no cada empleado. 'individual' = de siempre.
          const empleadosFirman = (sale as any)?.employee_signature_mode !== 'representante';
          if (empleadosFirman && beneficiary.signature_required !== false && (beneficiary.email || beneficiary.phone)) {
            const adhToken = generateUUID();
            const adhExpiresAt = new Date();
            adhExpiresAt.setDate(adhExpiresAt.getDate() + 1);

            const { data: adhLink, error: adhError } = await supabase
              .from('signature_links')
              .insert({
                sale_id: saleId,
                token: adhToken,
                recipient_type: 'adherente',
                recipient_email: beneficiary.email || null,
                recipient_phone: beneficiary.phone || null,
                recipient_id: beneficiary.id,
                expires_at: adhExpiresAt.toISOString(),
                status: 'pendiente',
                step_order: 1,
                is_active: true,
              } as any)
              .select()
              .single();

            if (adhError) {
              console.error(`Error creating link for beneficiary ${beneficiary.id}:`, adhError);
            } else if (adhLink) {
              results.push({
                type: 'adherente',
                name: `${beneficiary.first_name} ${beneficiary.last_name}`,
                email: beneficiary.email,
                token: adhLink.token,
                expires_at: adhLink.expires_at,
              });
            }
          }
        }
      }

      // 4. Generar enlace para CONTRATADA si está en modo 'link'
      if (companySettings?.contratada_signature_mode === 'link' && companySettings?.contratada_signer_email) {
        const contratadaToken = generateUUID();
        const contratadaExpiresAt = new Date();
        contratadaExpiresAt.setDate(contratadaExpiresAt.getDate() + 3); // 3 días para la empresa

        // Check if all step 1 links are already completed (titular signed before contratada was created)
        const { data: step1Links } = await supabase
          .from('signature_links')
          .select('id, status')
          .eq('sale_id', saleId)
          .eq('step_order', 1)
          .neq('status', 'revocado');

        const allStep1Done = step1Links && step1Links.length > 0 && step1Links.every((l: any) => l.status === 'completado');

        const { data: contratadaLink, error: contratadaError } = await supabase
          .from('signature_links')
          .insert({
            sale_id: saleId,
            token: contratadaToken,
            recipient_type: 'contratada',
            recipient_name: companySettings.contratada_signer_name || null,
            recipient_email: companySettings.contratada_signer_email,
            recipient_phone: companySettings.contratada_signer_phone || null,
            recipient_id: null,
            expires_at: contratadaExpiresAt.toISOString(),
            status: 'pendiente',
            step_order: 2,
            is_active: allStep1Done ? true : false,
          } as any)
          .select()
          .single();

        if (contratadaError) {
          console.error('Error creating contratada link:', contratadaError);
        } else if (contratadaLink) {
          results.push({
            type: 'contratada',
            name: companySettings.contratada_signer_name || 'Representante Legal',
            email: companySettings.contratada_signer_email,
            token: contratadaLink.token,
            expires_at: contratadaLink.expires_at,
          });
        }
      }

      if (results.length === 0) {
        throw new Error('No se pudieron generar enlaces. Verifica que el cliente y adherentes tengan email.');
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['signature-links'] });

      const titularCount = results.filter(r => r.type === 'titular').length;
      const adherenteCount = results.filter(r => r.type === 'adherente').length;
      const contratadaCount = results.filter(r => r.type === 'contratada').length;

      let desc = `${results.length} enlace(s) generado(s): ${titularCount} titular, ${adherenteCount} adherente(s)`;
      if (contratadaCount > 0) desc += `, ${contratadaCount} contratada`;

      toast.success(desc);
    },
    onError: (error: any) => {
      console.error('Error generating signature links:', error);
      toast.error(error.message || 'Error al generar enlaces de firma');
    },
  });
};
