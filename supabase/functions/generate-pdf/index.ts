import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Inlined: _shared/html-sanitizer.ts ---
const DANGEROUS_PATTERNS = [
  /<script[\s>]/gi, /javascript\s*:/gi, /on\w+\s*=/gi,
  /data\s*:\s*text\/html/gi, /vbscript\s*:/gi, /<iframe[\s>]/gi,
  /<object[\s>]/gi, /<embed[\s>]/gi, /<applet[\s>]/gi, /<form[\s>]/gi,
  /<input[\s>]/gi, /<button[\s>]/gi, /<meta[\s>]/gi, /<link[\s>]/gi,
  /<base[\s>]/gi, /expression\s*\(/gi, /url\s*\(\s*['"]?\s*javascript/gi,
];
function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  let s = html;
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  for (const tag of ['iframe','object','embed','applet','form','input','button','meta','link','base']) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
    s = s.replace(new RegExp(`</${tag}>`, 'gi'), '');
  }
  s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|src)\s*=\s*["']?\s*(javascript|vbscript)\s*:/gi, '$1="about:blank"');
  s = s.replace(/expression\s*\([^)]*\)/gi, '');
  return s;
}
function detectThreats(html: string): string[] {
  if (!html) return [];
  const threats: string[] = [];
  for (const p of DANGEROUS_PATTERNS) { p.lastIndex = 0; if (p.test(html)) threats.push(p.source); }
  return threats;
}
function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// --- Inlined: _shared/rate-limiter.ts ---
const _requestCounts = new Map<string, { count: number; windowStart: number }>();
function checkRateLimit(identifier: string, options: { windowMs: number; maxRequests: number } = { windowMs: 15*60*1000, maxRequests: 100 }) {
  const now = Date.now();
  const entry = _requestCounts.get(identifier);
  if (_requestCounts.size > 10000) {
    for (const [k, v] of _requestCounts.entries()) { if (now - v.windowStart > options.windowMs) _requestCounts.delete(k); }
  }
  if (!entry || now - entry.windowStart > options.windowMs) {
    _requestCounts.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: options.maxRequests - 1 };
  }
  entry.count++;
  if (entry.count > options.maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: options.windowMs - (now - entry.windowStart) };
  }
  return { allowed: true, remaining: options.maxRequests - entry.count };
}
function rateLimitResponse(corsHeaders: Record<string, string>, retryAfterMs?: number) {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(retryAfterMs ? { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } : {}) },
  });
}
function getClientIdentifier(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GeneratePDFRequest {
  templateId?: string;
  saleId?: string;
  htmlContent?: string;
  filename: string;
  documentType?: 'contract' | 'declaration' | 'questionnaire' | 'other';
  includeSignatureFields?: boolean;
  includeBeneficiariesTable?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Rate limiting
    const clientIp = getClientIdentifier(req)
    const rateCheck = checkRateLimit(`pdf:${clientIp}`, { windowMs: 5 * 60 * 1000, maxRequests: 30 })
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs)
    }

    // Authenticate the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the user's JWT
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = claimsData.claims.sub as string

    // Use service role for data access
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch user's company_id and branding settings
    let headerImageUrl: string | null = null
    let footerImageUrl: string | null = null

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single()

    if (profile?.company_id) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('pdf_header_image_url, pdf_footer_image_url')
        .eq('company_id', profile.company_id)
        .single()

      if (settings) {
        headerImageUrl = settings.pdf_header_image_url || null
        footerImageUrl = settings.pdf_footer_image_url || null
      }
    }

    const { 
      templateId, 
      saleId, 
      htmlContent,
      filename,
      documentType = 'contract',
      includeSignatureFields = false,
      includeBeneficiariesTable = true,
    }: GeneratePDFRequest = await req.json()

    let processedContent = htmlContent || ''
    let templateData: any = null

    // Server-side HTML sanitization - defense in depth
    const threats = detectThreats(processedContent)
    if (threats.length > 0) {
      processedContent = sanitizeHtml(processedContent)
    }

    if (templateId) {
      const { data: template, error: templateError } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (templateError) {
        throw new Error(`Template not found: ${templateError.message}`)
      }
      
      templateData = template
      processedContent = template.content || template.static_content || ''
    }

    if (saleId) {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select(`
          *,
          clients:client_id (*),
          plans:plan_id (*),
          companies:company_id (*),
          beneficiaries (*)
        `)
        .eq('id', saleId)
        .single()

      if (saleError) {
        console.error('Error fetching sale:', saleError)
      } else if (sale) {
        // Fix timezone: 'YYYY-MM-DD' parsed as UTC shifts day back 1 in Paraguay (UTC-4)
        const formatDateLocal = (d: string | null) => {
          if (!d) return ''
          return new Date(d.includes('T') ? d : d + 'T00:00:00').toLocaleDateString('es-ES')
        }

        processedContent = interpolateTemplateVariables(processedContent, {
          cliente: {
            nombre: sale.clients?.first_name || '',
            apellido: sale.clients?.last_name || '',
            nombreCompleto: `${sale.clients?.first_name || ''} ${sale.clients?.last_name || ''}`.trim(),
            email: sale.clients?.email || '',
            telefono: sale.clients?.phone || '',
            dni: sale.clients?.dni || '',
            direccion: sale.clients?.address || '',
          },
          plan: {
            nombre: sale.plans?.name || '',
            precio: sale.plans?.price || 0,
            precioFormateado: `$${(sale.total_amount || sale.plans?.price || 0).toLocaleString()}`,
            descripcion: sale.plans?.description || '',
          },
          empresa: {
            nombre: sale.companies?.name || '',
            email: sale.companies?.email || '',
            telefono: sale.companies?.phone || '',
            direccion: sale.companies?.address || '',
          },
          venta: {
            fecha: formatDateLocal(sale.sale_date || null),
            total: sale.total_amount || 0,
            totalFormateado: `$${(sale.total_amount || 0).toLocaleString()}`,
            numeroContrato: sale.contract_number || '',
            estado: sale.status || '',
          },
          fecha: {
            actual: new Date().toLocaleDateString('es-ES'),
            actualFormateada: new Date().toLocaleDateString('es-ES', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            }),
          },
        })

        if (includeBeneficiariesTable && sale.beneficiaries?.length > 0) {
          const beneficiariesTable = generateBeneficiariesTableHTML(sale.beneficiaries)
          processedContent = processedContent.replace(
            /\{\{tabla_beneficiarios\}\}/gi, 
            beneficiariesTable
          )
        }
      }
    }

    const fullHtmlDocument = generatePDFHtml(processedContent, {
      title: filename,
      documentType,
      includeSignatureFields,
      headerImageUrl,
      footerImageUrl,
    })

    return new Response(JSON.stringify({
      success: true,
      html: fullHtmlDocument,
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      templateName: templateData?.name || 'Documento',
      metadata: {
        generatedAt: new Date().toISOString(),
        documentType,
        saleId,
        templateId,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error generating PDF:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

// Interpolate template variables
function interpolateTemplateVariables(template: string, data: any): string {
  let result = template

  const replaceNested = (obj: any, prefix: string) => {
    if (!obj || typeof obj !== 'object') return
    Object.keys(obj).forEach(key => {
      const value = obj[key]
      const placeholder = `{{${prefix}.${key}}}`
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      if (value !== null && value !== undefined && typeof value !== 'object') {
        result = result.replace(regex, escapeHtml(String(value)))
      }
    })
  }

  replaceNested(data.cliente, 'cliente')
  replaceNested(data.plan, 'plan')
  replaceNested(data.empresa, 'empresa')
  replaceNested(data.venta, 'venta')
  replaceNested(data.fecha, 'fecha')

  return result
}

function generateBeneficiariesTableHTML(beneficiaries: any[]): string {
  if (!beneficiaries || beneficiaries.length === 0) return ''

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">#</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Nombre Completo</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Documento</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Parentesco</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Fecha Nac.</th>
          <th style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">Cobertura</th>
        </tr>
      </thead>
      <tbody>
        ${beneficiaries.map((b, i) => `
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${i + 1}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${b.first_name || ''} ${b.last_name || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${b.document_number || b.dni || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${b.relationship || 'Titular'}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${b.birth_date ? new Date(b.birth_date.includes('T') ? b.birth_date : b.birth_date + 'T00:00:00').toLocaleDateString('es-ES') : ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">$${(b.amount || 0).toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f9fafb; font-weight: bold;">
          <td colspan="5" style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">Total:</td>
          <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">
            $${beneficiaries.reduce((sum, b) => sum + (b.amount || 0), 0).toLocaleString()}
          </td>
        </tr>
      </tfoot>
    </table>
  `
}

function generatePDFHtml(content: string, options: {
  title: string;
  documentType: string;
  includeSignatureFields: boolean;
  headerImageUrl?: string | null;
  footerImageUrl?: string | null;
}): string {
  const signatureSection = options.includeSignatureFields ? `
    <div style="margin-top: 60px; page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; margin-top: 40px;">
        <div style="width: 45%; text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 10px; margin-top: 80px;">
            <p style="margin: 0; font-size: 12px;">Firma del Cliente</p>
            <p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">Fecha: ___/___/______</p>
          </div>
        </div>
        <div style="width: 45%; text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 10px; margin-top: 80px;">
            <p style="margin: 0; font-size: 12px;">Firma del Representante</p>
            <p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">Fecha: ___/___/______</p>
          </div>
        </div>
      </div>
    </div>
  ` : ''

  const hasHeader = !!options.headerImageUrl
  const hasFooter = !!options.footerImageUrl
  const topMargin = hasHeader ? '28mm' : '20mm'
  const bottomMargin = hasFooter ? '25mm' : '20mm'

  const headerHtml = hasHeader ? `
    <div class="pdf-header-branding">
      <img src="${options.headerImageUrl}" alt="Encabezado" />
    </div>
  ` : ''

  const footerHtml = hasFooter ? `
    <div class="pdf-footer-branding">
      <img src="${options.footerImageUrl}" alt="Zócalo" />
    </div>
  ` : ''

  const brandingStyles = `
    .pdf-header-branding {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 22mm;
      text-align: center;
      z-index: 1000;
    }
    .pdf-header-branding img {
      max-width: 100%;
      max-height: 22mm;
      object-fit: contain;
    }
    .pdf-footer-branding {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 18mm;
      text-align: center;
      z-index: 1000;
    }
    .pdf-footer-branding img {
      max-width: 100%;
      max-height: 18mm;
      object-fit: contain;
    }
  `

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${options.title}</title>
      <style>
        @page { size: A4; margin: ${topMargin} 20mm ${bottomMargin} 20mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .document-container { max-width: 210mm; margin: 0 auto; padding: ${hasHeader ? '25mm' : '20px'} 20px ${hasFooter ? '20mm' : '20px'} 20px; }
        h1 { font-size: 24px; margin-bottom: 20px; color: #1a1a1a; }
        h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; color: #333; }
        h3 { font-size: 14px; margin-top: 16px; margin-bottom: 8px; color: #444; }
        p { margin-bottom: 12px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: 600; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; }
        .page-break { page-break-before: always; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        ${brandingStyles}
      </style>
    </head>
    <body>
      ${headerHtml}
      ${footerHtml}
      <div class="document-container">
        ${content}
        ${signatureSection}
        <div class="footer">
          <p>Documento generado automáticamente el ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </body>
    </html>
  `
}
