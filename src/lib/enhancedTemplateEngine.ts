// Enhanced Template Engine for dynamic document generation with beneficiaries support
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency as formatPygCurrency } from '@/lib/utils';
import { getSignatureLinkUrl } from '@/lib/appUrls';

/**
 * Convert a number to words in Spanish (Guaranies)
 */
function numberToWordsES(n: number): string {
  if (n === 0) return 'CERO';
  
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const convert = (num: number): string => {
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    if (num < 10) return units[num];
    if (num < 20) return teens[num - 10];
    if (num < 30) {
      if (num === 20) return 'VEINTE';
      return 'VEINTI' + units[num - 20];
    }
    if (num < 100) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      return u === 0 ? tens[t] : `${tens[t]} Y ${units[u]}`;
    }
    if (num < 1000) {
      const h = Math.floor(num / 100);
      const rest = num % 100;
      return rest === 0 ? (num === 100 ? 'CIEN' : hundreds[h]) : `${hundreds[h]} ${convert(rest)}`;
    }
    if (num < 1000000) {
      const thousands = Math.floor(num / 1000);
      const rest = num % 1000;
      const prefix = thousands === 1 ? 'MIL' : `${convert(thousands)} MIL`;
      return rest === 0 ? prefix : `${prefix} ${convert(rest)}`;
    }
    if (num < 1000000000) {
      const millions = Math.floor(num / 1000000);
      const rest = num % 1000000;
      const prefix = millions === 1 ? 'UN MILLÓN' : `${convert(millions)} MILLONES`;
      return rest === 0 ? prefix : `${prefix} ${convert(rest)}`;
    }
    return String(num);
  };

  return convert(Math.abs(Math.floor(n)));
}

export interface BeneficiaryContext {
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  dni: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  edad: number;
  parentesco: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  departamento: string;
  barrio: string;
  codigoPostal: string;
  genero: string;
  estadoCivil: string;
  ocupacion: string;
  tienePreexistencias: boolean;
  detallePreexistencias: string;
  monto: number;
  montoFormateado: string;
  requiereFirma: boolean;
  estadoFirma: string;
}

export interface EnhancedTemplateContext {
  cliente: {
    nombre: string;
    apellido: string;
    nombreCompleto: string;
    email: string;
    telefono: string;
    ci: string;
    dni: string;
    direccion: string;
    ciudad: string;
    provincia: string;
    departamento: string;
    barrio: string;
    codigoPostal: string;
    fechaNacimiento: string;
    edad: number;
  };
  plan: {
    nombre: string;
    precio: number;
    precioFormateado: string;
    descripcion: string;
    cobertura: string;
  };
  empresa: {
    nombre: string;
    email: string;
    telefono: string;
    direccion: string;
    logo: string;
    colorPrimario: string;
    colorSecundario: string;
  };
  venta: {
    id: string;
    fecha: string;
    fechaFormateada: string;
    total: number;
    totalFormateado: string;
    totalLetras: string;
    vendedor: string;
    vendedorEmail: string;
    notas: string;
    estado: string;
    numeroContrato: string;
    numeroSolicitud: string;
    cantidadAdherentes: number;
    fechaInicioContrato: string;
    fechaInicioContratoFormateada: string;
    vigenciaInmediata: string;
    tipoVenta: string;
  };
  facturacion: {
    razonSocial: string;
    ruc: string;
    email: string;
    telefono: string;
  };
  firma: {
    enlace: string;
    token: string;
    fechaExpiracion: string;
    estado: string;
  };
  fecha: {
    actual: string;
    actualFormateada: string;
    horaActual: string;
    anio: string;
    mes: string;
    dia: string;
  };
  beneficiarios: BeneficiaryContext[];
  beneficiarioPrincipal: BeneficiaryContext | null;
  respuestas: Record<string, any>;
  representante: {
    nombre: string;
    dni: string;
  };
}

/**
 * Calculate age from birth date
 */
function calculateAge(birthDate: string | null): number {
  if (!birthDate) return 0;
  // Force local time — same fix as formatDate
  const birth = new Date(birthDate.includes('T') ? birthDate : `${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Format currency with locale
 */
function formatCurrency(amount: number, currencySymbol = '$'): string {
  if (currencySymbol === '$') {
    return formatPygCurrency(amount);
  }

  const sanitizedAmount = amount.toLocaleString('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currencySymbol} ${sanitizedAmount}`;
}

/**
 * Format date with Spanish locale
 */
function formatDate(date: string | Date | null, formatStr = 'dd/MM/yyyy'): string {
  if (!date) return '';
  try {
    // For date-only strings (YYYY-MM-DD), appending T00:00:00 forces local time.
    // Without this, new Date('2015-06-08') is UTC midnight → Paraguay (UTC-4) shows June 7.
    const d = typeof date === 'string'
      ? new Date(date.includes('T') ? date : `${date}T00:00:00`)
      : date;
    return format(d, formatStr, { locale: es });
  } catch {
    return '';
  }
}

function normalizeContractHeaderHtml(html: string): string {
  if (!html) return html;

  const leadingHeaderImageRegex =
    /^\s*<img\b([^>]*?)src="([^"]*\/company-assets\/[^"]*\/branding\/[^"]+)"([^>]*)>/i;

  if (!leadingHeaderImageRegex.test(html)) {
    return html;
  }

  return html.replace(leadingHeaderImageRegex, (_match, beforeSrc, src, afterSrc) => {
    const mergedAttrs = `${beforeSrc ?? ''}${afterSrc ?? ''}`;
    const withoutStyle = mergedAttrs.replace(/\sstyle="[^"]*"/gi, '');
    const normalizedStyle = [
      'display:block',
      'width:100%',
      'max-width:100%',
      'height:auto',
      'max-height:none',
      'object-fit:contain',
      'object-position:center center',
      'margin:0 auto 12px auto',
    ].join('; ');

    return `<img${withoutStyle} src="${src}" style="${normalizedStyle}">`;
  });
}

/**
 * Create beneficiary context from database record
 */
function createBeneficiaryContext(beneficiary: any): BeneficiaryContext {
  return {
    nombre: beneficiary.first_name || '',
    apellido: beneficiary.last_name || '',
    nombreCompleto: `${beneficiary.first_name || ''} ${beneficiary.last_name || ''}`.trim(),
    dni: beneficiary.document_number || beneficiary.dni || '',
    email: beneficiary.email || '',
    telefono: beneficiary.phone || '',
    fechaNacimiento: formatDate(beneficiary.birth_date),
    edad: calculateAge(beneficiary.birth_date),
    parentesco: beneficiary.relationship || (beneficiary.is_primary ? 'Titular' : 'Adherente'),
    direccion: beneficiary.address || '',
    ciudad: beneficiary.city || '',
    provincia: beneficiary.province || '',
    departamento: beneficiary.province || '',
    barrio: beneficiary.barrio || '',
    codigoPostal: beneficiary.postal_code || '',
    genero: beneficiary.gender || '',
    estadoCivil: beneficiary.marital_status || '',
    ocupacion: beneficiary.occupation || '',
    tienePreexistencias: beneficiary.has_preexisting_conditions || false,
    detallePreexistencias: beneficiary.preexisting_conditions_detail || '',
    monto: beneficiary.amount || 0,
    montoFormateado: formatCurrency(beneficiary.amount || 0),
    requiereFirma: beneficiary.signature_required !== false,
    estadoFirma: 'pendiente', // Will be updated from signature_links
  };
}

/**
 * Create enhanced template context from sale data
 */
export function createEnhancedTemplateContext(
  client: any,
  plan: any,
  company: any,
  sale: any,
  beneficiaries: any[] = [],
  signatureLink?: any,
  responses?: Record<string, any>,
  companySettings?: any
): EnhancedTemplateContext {
  const now = new Date();
  
  // Create beneficiary contexts (always include titular first for contract tables)
  const normalizedBeneficiaries = Array.isArray(beneficiaries) ? beneficiaries : [];
  const hasPrimaryBeneficiary = normalizedBeneficiaries.some((b: any) => b?.is_primary === true);

  // Calculate titular's individual share: total minus sum of adherent amounts
  const adherentSum = normalizedBeneficiaries
    .filter((b: any) => !b?.is_primary)
    .reduce((sum: number, b: any) => sum + (b?.amount || 0), 0);
  const titularAmount = (sale?.total_amount || 0) - adherentSum;
  const effectiveTitularAmount = titularAmount > 0 ? titularAmount : (sale?.total_amount || plan?.price || 0);

  const titularFallback = !hasPrimaryBeneficiary && client
    ? {
        first_name: client?.first_name || '',
        last_name: client?.last_name || '',
        document_number: client?.dni || '',
        dni: client?.dni || '',
        email: client?.email || '',
        phone: client?.phone || '',
        birth_date: client?.birth_date || null,
        address: client?.address || '',
        city: client?.city || '',
        province: client?.province || '',
        barrio: (client as any)?.barrio || '',
        postal_code: client?.postal_code || '',
        gender: '',
        relationship: 'Titular',
        is_primary: true,
        amount: effectiveTitularAmount,
        signature_required: true,
      }
    : null;

  const mergedBeneficiaries = titularFallback
    ? [titularFallback, ...normalizedBeneficiaries]
    : normalizedBeneficiaries;

  const beneficiaryContexts = mergedBeneficiaries.map((b) => {
    // Titular: always use calculated share (total - adherent sum) for accuracy
    if (b.is_primary || b.relationship?.toLowerCase() === 'titular') {
      return createBeneficiaryContext({ ...b, amount: effectiveTitularAmount });
    }
    return createBeneficiaryContext(b);
  });
  const sortedBeneficiaryContexts = [...beneficiaryContexts].sort((a, b) => {
    const aIsPrimary = (a.parentesco || '').toLowerCase() === 'titular';
    const bIsPrimary = (b.parentesco || '').toLowerCase() === 'titular';
    if (aIsPrimary === bIsPrimary) return 0;
    return aIsPrimary ? -1 : 1;
  });

  const primaryBeneficiary = sortedBeneficiaryContexts.find((b) => (b.parentesco || '').toLowerCase() === 'titular')
    || sortedBeneficiaryContexts[0]
    || null;

  // Compute effective total from beneficiary amounts (source of truth)
  const effectiveTotal = sortedBeneficiaryContexts.length > 0
    ? sortedBeneficiaryContexts.reduce((sum, b) => sum + (b.monto || 0), 0)
    : (sale?.total_amount || 0);

  return {
    cliente: {
      nombre: client?.first_name || '',
      apellido: client?.last_name || '',
      nombreCompleto: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
      email: client?.email || '',
      telefono: client?.phone || '',
      ci: client?.dni || '',
      dni: client?.dni || '',
      direccion: client?.address || '',
      ciudad: client?.city || '',
      provincia: client?.province || '',
      departamento: client?.province || '',
      barrio: (client as any)?.barrio || '',
      codigoPostal: client?.postal_code || '',
      fechaNacimiento: formatDate(client?.birth_date),
      edad: calculateAge(client?.birth_date),
    },
    plan: {
      nombre: plan?.name || '',
      precio: plan?.price || 0,
      precioFormateado: formatCurrency(plan?.price || 0),
      descripcion: plan?.description || '',
      cobertura: typeof plan?.coverage_details === 'object' 
        ? JSON.stringify(plan?.coverage_details) 
        : plan?.coverage_details || '',
    },
    empresa: {
      nombre: company?.name || '',
      email: company?.email || '',
      telefono: company?.phone || '',
      direccion: company?.address || '',
      logo: company?.logo_url || '',
      colorPrimario: company?.primary_color || '#3B82F6',
      colorSecundario: company?.secondary_color || '#1E40AF',
    },
    venta: {
      id: sale?.id || '',
      fecha: sale?.sale_date || formatDate(now, 'yyyy-MM-dd'),
      fechaFormateada: formatDate(sale?.sale_date || now, "d 'de' MMMM 'de' yyyy"),
      total: effectiveTotal,
      totalFormateado: formatCurrency(effectiveTotal),
      totalLetras: numberToWordsES(effectiveTotal) + ' GUARANÍES',
      vendedor: sale?.salesperson ? `${sale.salesperson.first_name || ''} ${sale.salesperson.last_name || ''}`.trim() : '',
      vendedorEmail: sale?.salesperson?.email || '',
      notas: sale?.notes || '',
      estado: sale?.status || 'borrador',
      numeroContrato: sale?.contract_number || '',
      numeroSolicitud: sale?.request_number || '',
      cantidadAdherentes: sale?.adherents_count || beneficiaries.length,
      fechaInicioContrato: sale?.contract_start_date ? formatDate(sale.contract_start_date, 'dd/MM/yyyy') : '',
      fechaInicioContratoFormateada: sale?.contract_start_date ? formatDate(sale.contract_start_date, "d 'de' MMMM 'de' yyyy") : '',
      vigenciaInmediata: sale?.immediate_coverage ? 'Sí' : 'No',
      tipoVenta: sale?.sale_type === 'reingreso' ? 'Reingreso' : 'Venta Nueva',
    },
    facturacion: {
      razonSocial: sale?.billing_razon_social || '',
      ruc: sale?.billing_ruc || '',
      email: sale?.billing_email || '',
      telefono: sale?.billing_phone || '',
    },
    firma: {
      enlace: signatureLink ? getSignatureLinkUrl(signatureLink.token) : '',
      token: signatureLink?.token || '',
      fechaExpiracion: formatDate(signatureLink?.expires_at, "d 'de' MMMM 'de' yyyy"),
      estado: signatureLink?.status || 'pendiente',
    },
    fecha: {
      actual: (() => {
        // fecha_actual = first day of current month
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return formatDate(firstOfMonth, 'yyyy-MM-dd');
      })(),
      actualFormateada: (() => {
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return formatDate(firstOfMonth, "d 'de' MMMM 'de' yyyy");
      })(),
      horaActual: formatDate(now, 'HH:mm'),
      anio: formatDate(now, 'yyyy'),
      mes: formatDate(now, 'MMMM'),
      dia: formatDate(now, 'd'),
    },
    beneficiarios: sortedBeneficiaryContexts,
    beneficiarioPrincipal: primaryBeneficiary,
    respuestas: responses || {},
    representante: {
      nombre: companySettings?.contratada_signer_name || company?.name || '',
      dni: companySettings?.contratada_signer_dni || '',
    },
  };
}

/**
 * Interpolate template with enhanced context
 */
export function interpolateEnhancedTemplate(template: string, context: EnhancedTemplateContext): string {
  let result = normalizeContractHeaderHtml(template);

  // Helper to replace nested variables
  const replaceNestedVariables = (obj: any, prefix: string) => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const placeholder = `{{${prefix}.${key}}}`;
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      
      if (value !== null && value !== undefined && typeof value !== 'object') {
        result = result.replace(regex, String(value));
      }
    });
  };

  // ===== STEP 0: BENEFICIARY LOOPS/EXPANSION FIRST =====
  // Must run BEFORE other replacements so {{titular.edad}}, {{vigencia_inmediata}}, etc.
  // get replaced PER-BENEFICIARY inside each expanded row, not globally beforehand.

  const beneficiaryPlaceholderNames = 'first_name|last_name|_index|index|indice|birth_date|dni|ci|gender|amount|relationship|edad|titular\\.edad|age|formatted_amount|email|phone|document_number|vigencia_inmediata|tipo_venta|venta\\.vigenciaInmediata|venta\\.tipoVenta|nombre|apellido|nombreCompleto|fechaNacimiento|genero|parentesco|montoFormateado|monto|ocupacion|estadoCivil|barrio';

  const buildBenAliases = (beneficiary: BeneficiaryContext, index: number): Record<string, string> => ({
    '{{first_name}}': beneficiary.nombre,
    '{{last_name}}': beneficiary.apellido,
    '{{nombre}}': beneficiary.nombre,
    '{{apellido}}': beneficiary.apellido,
    '{{nombreCompleto}}': beneficiary.nombreCompleto,
    '{{full_name}}': beneficiary.nombreCompleto,
    '{{birth_date}}': beneficiary.fechaNacimiento,
    '{{fechaNacimiento}}': beneficiary.fechaNacimiento,
    '{{gender}}': beneficiary.genero,
    '{{genero}}': beneficiary.genero,
    '{{amount}}': beneficiary.montoFormateado,
    '{{monto}}': String(beneficiary.monto),
    '{{montoFormateado}}': beneficiary.montoFormateado,
    '{{formatted_amount}}': beneficiary.montoFormateado,
    '{{relationship}}': beneficiary.parentesco,
    '{{parentesco}}': beneficiary.parentesco,
    '{{dni}}': beneficiary.dni,
    '{{ci}}': beneficiary.dni,
    '{{document_number}}': beneficiary.dni,
    '{{age}}': String(beneficiary.edad),
    '{{titular.edad}}': String(beneficiary.edad),
    '{{edad}}': String(beneficiary.edad),
    '{{_index}}': String(index + 1),
    '{{index}}': String(index + 1),
    '{{indice}}': String(index + 1),
    '{{email}}': beneficiary.email,
    '{{phone}}': beneficiary.telefono,
    '{{address}}': beneficiary.direccion,
    '{{city}}': beneficiary.ciudad,
    '{{ocupacion}}': beneficiary.ocupacion,
    '{{estadoCivil}}': beneficiary.estadoCivil,
    '{{barrio}}': beneficiary.barrio,
    '{{occupation}}': beneficiary.ocupacion,
    '{{marital_status}}': beneficiary.estadoCivil,
    '{{vigencia_inmediata}}': context.venta.vigenciaInmediata,
    '{{tipo_venta}}': context.venta.tipoVenta,
    '{{venta.vigenciaInmediata}}': context.venta.vigenciaInmediata,
    '{{venta.tipoVenta}}': context.venta.tipoVenta,
  });

  const applyBenAliases = (text: string, aliases: Record<string, string>): string => {
    let out = text;
    Object.entries(aliases).forEach(([placeholder, value]) => {
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(regex, value || '');
    });
    return out;
  };

  // Handle explicit {{#beneficiarios}}...{{/beneficiarios}} loop
  let beneficiaryLoopMatched = false;
  let beneficiaryLoopHadContent = false;
  const beneficiariesLoopRegex = /\{\{#beneficiarios\}\}([\s\S]*?)\{\{\/beneficiarios\}\}/gi;
  result = result.replace(beneficiariesLoopRegex, (_, content) => {
    beneficiaryLoopMatched = true;
    // Check if there's actual content (not just whitespace) between the loop markers
    const trimmedContent = content.replace(/<[^>]*>/g, '').trim();
    if (!trimmedContent) {
      // Empty loop markers — remove them and let auto-expansion handle the table below
      return '';
    }
    beneficiaryLoopHadContent = true;
    return context.beneficiarios.map((beneficiary, index) => {
      let itemResult = content;
      // Replace beneficiary-specific placeholders (Spanish names from BeneficiaryContext)
      Object.keys(beneficiary).forEach(key => {
        const value = (beneficiary as any)[key];
        const placeholder = `{{${key}}}`;
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (value !== null && value !== undefined && typeof value !== 'object') {
          itemResult = itemResult.replace(regex, String(value));
        }
      });
      // English aliases
      itemResult = applyBenAliases(itemResult, buildBenAliases(beneficiary, index));
      return itemResult;
    }).join('');
  });

  // Fallback: Auto-expand <tr> rows with beneficiary placeholders
  if (!beneficiaryLoopHadContent) {
    // TipTap/rich editors often split placeholders across HTML tags like:
    // <span>{{</span><span>first_name}}</span> or <strong>{{first_name}}</strong>
    // First, normalize the HTML to merge split placeholders
    const normalizePlaceholders = (html: string): string => {
      // Remove HTML tags from INSIDE placeholder braces: {{<span>name</span>}} -> {{name}}
      return html.replace(/\{\{([^}]*)\}\}/g, (match) => {
        const stripped = match.replace(/<[^>]*>/g, '');
        return stripped;
      }).replace(/\{(<[^>]*>)*\{/g, '{{').replace(/\}(<[^>]*>)*\}/g, '}}');
    };

    // More aggressive normalization: find {{ ... }} patterns that may span HTML tags
    const deepNormalize = (html: string): string => {
      // Pattern: {{ potentially with HTML tags inside until }}
      let normalized = html.replace(/\{\{(?:<[^>]*>|\s)*([a-zA-Z_][a-zA-Z0-9_.]*?)(?:<[^>]*>|\s)*\}\}/g, '{{$1}}');
      
      // Even more aggressive: find sequences like } <tag> } or { <tag> { and merge them
      // Handle cases where TipTap splits {{ into { + HTML + {
      normalized = normalized.replace(/\{(?:<[^>]*>|\s)+\{/g, '{{');
      normalized = normalized.replace(/\}(?:<[^>]*>|\s)+\}/g, '}}');
      
      // After merging braces, re-clean content inside {{ }}
      normalized = normalized.replace(/\{\{([^}]*)\}\}/g, (match) => {
        const stripped = match.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
        return stripped;
      });
      
      return normalized;
    };

    result = deepNormalize(normalizePlaceholders(result));

    const hasBeneficiaryPlaceholders = new RegExp(`\\{\\{(?:${beneficiaryPlaceholderNames})\\}\\}`, 'gi').test(result);
    
    if (hasBeneficiaryPlaceholders && context.beneficiarios.length > 0) {
      // Strategy 1: Expand <tr> rows containing beneficiary placeholders
      // Use a more robust approach: find all <tr>...</tr> blocks, check if they contain ben placeholders
      const trBlocks: { start: number; end: number; content: string }[] = [];
      const trOpenRegex = /<tr[^>]*>/gi;
      let trMatch;
      while ((trMatch = trOpenRegex.exec(result)) !== null) {
        const startIdx = trMatch.index;
        // Find the matching </tr> (handle nested content but not nested <tr>)
        const closeIdx = result.indexOf('</tr>', startIdx + trMatch[0].length);
        if (closeIdx !== -1) {
          const endIdx = closeIdx + 5; // '</tr>'.length
          trBlocks.push({ start: startIdx, end: endIdx, content: result.substring(startIdx, endIdx) });
        }
      }

      // Find which <tr> blocks contain beneficiary placeholders
      const benPlaceholderCheck = new RegExp(`\\{\\{(?:${beneficiaryPlaceholderNames})\\}\\}`, 'gi');
      let trMatched = false;
      // Process in reverse order to preserve indices
      for (let i = trBlocks.length - 1; i >= 0; i--) {
        const block = trBlocks[i];
        if (benPlaceholderCheck.test(block.content)) {
          benPlaceholderCheck.lastIndex = 0; // reset regex
          trMatched = true;
          const expanded = context.beneficiarios.map((beneficiary, index) => {
            return applyBenAliases(block.content, buildBenAliases(beneficiary, index));
          }).join('\n');
          result = result.substring(0, block.start) + expanded + result.substring(block.end);
        }
        benPlaceholderCheck.lastIndex = 0;
      }

      // Strategy 2: If no <tr> matched, replace standalone placeholders with first beneficiary
      if (!trMatched) {
        const firstBen = context.beneficiarios[0];
        if (firstBen) {
          result = applyBenAliases(result, buildBenAliases(firstBen, 0));
        }
      }
    }
  }

  // ===== STEP 1: Replace main context variables =====
  replaceNestedVariables(context.cliente, 'cliente');
  replaceNestedVariables(context.plan, 'plan');
  replaceNestedVariables(context.empresa, 'empresa');
  replaceNestedVariables(context.venta, 'venta');
  replaceNestedVariables(context.facturacion, 'facturacion');
  replaceNestedVariables(context.firma, 'firma');
  replaceNestedVariables(context.fecha, 'fecha');
  
  // Replace primary beneficiary
  if (context.beneficiarioPrincipal) {
    replaceNestedVariables(context.beneficiarioPrincipal, 'beneficiarioPrincipal');
    replaceNestedVariables(context.beneficiarioPrincipal, 'titular');
  }

  // ===== STEP 2: Legacy aliases =====
  const legacyAliases: Record<string, string> = {
    '{{titular_nombre}}': context.cliente.nombreCompleto,
    '{{titular_email}}': context.cliente.email,
    '{{titular_telefono}}': context.cliente.telefono,
    '{{titular_ci}}': context.cliente.ci,
    '{{titular_dni}}': context.cliente.ci,
    '{{titular_direccion}}': context.cliente.direccion,
    '{{titular_ciudad}}': context.cliente.ciudad,
    '{{titular_provincia}}': context.cliente.provincia,
    '{{titular_departamento}}': context.cliente.departamento,
    '{{titular_barrio}}': context.cliente.barrio,
    '{{titular_fecha_nacimiento}}': context.cliente.fechaNacimiento,
    '{{titular_edad}}': String(context.cliente.edad),
    '{{monto_total}}': context.venta.totalFormateado,
    '{{monto_total_letras}}': context.venta.totalLetras,
    '{{razon_social}}': context.facturacion.razonSocial,
    '{{ruc}}': context.facturacion.ruc,
    '{{billing_email}}': context.facturacion.email,
    '{{billing_telefono}}': context.facturacion.telefono,
    '{{fecha_actual}}': context.fecha.actualFormateada,
    '{{numero_contrato}}': context.venta.numeroContrato,
    '{{vendedor_nombre}}': context.venta.vendedor,
    '{{vigencia_inmediata}}': context.venta.vigenciaInmediata,
    '{{tipo_venta}}': context.venta.tipoVenta,
    // Company aliases for contracts
    '{{company_name}}': context.empresa.nombre,
    '{{company_cuit}}': context.facturacion.ruc,
    '{{company_address}}': context.empresa.direccion,
    // Signature role aliases (representante = empresa, testigo)
    '{{representante_nombre}}': context.representante.nombre,
    '{{representante_dni}}': context.representante.dni,
    '{{testigo_nombre}}': context.venta.vendedor,
    '{{testigo_dni}}': '',
    // Global amount aliases (sale total, not plan base price)
    '{{amount}}': context.venta.totalFormateado,
    '{{monto}}': context.venta.totalFormateado,
    '{{precio}}': context.venta.totalFormateado,
  };
  Object.entries(legacyAliases).forEach(([placeholder, value]) => {
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, String(value || ''));
  });

  // ===== STEP 3: Replace responses =====
  if (context.respuestas) {
    Object.entries(context.respuestas).forEach(([key, value]) => {
      const placeholder = `{{respuestas.${key}}}`;
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, String(value || ''));
    });
  }

  return normalizeContractHeaderHtml(result);
}

/**
 * Get all available template variables with descriptions
 */
export function getEnhancedTemplateVariables(): { category: string; variables: { key: string; description: string }[] }[] {
  return [
    {
      category: 'Cliente',
      variables: [
        { key: '{{cliente.nombre}}', description: 'Nombre del cliente' },
        { key: '{{cliente.apellido}}', description: 'Apellido del cliente' },
        { key: '{{cliente.nombreCompleto}}', description: 'Nombre completo del cliente' },
        { key: '{{cliente.email}}', description: 'Email del cliente' },
        { key: '{{cliente.telefono}}', description: 'Teléfono del cliente' },
        { key: '{{cliente.ci}}', description: 'C.I. del cliente' },
        { key: '{{cliente.dni}}', description: 'C.I. del cliente (alias)' },
        { key: '{{cliente.direccion}}', description: 'Dirección del cliente' },
        { key: '{{cliente.ciudad}}', description: 'Ciudad del cliente' },
        { key: '{{cliente.provincia}}', description: 'Provincia/Departamento del cliente' },
        { key: '{{cliente.departamento}}', description: 'Departamento del cliente (alias de provincia)' },
        { key: '{{cliente.barrio}}', description: 'Barrio del cliente' },
        { key: '{{cliente.fechaNacimiento}}', description: 'Fecha de nacimiento' },
        { key: '{{cliente.edad}}', description: 'Edad del cliente' },
      ],
    },
    {
      category: 'Plan',
      variables: [
        { key: '{{plan.nombre}}', description: 'Nombre del plan' },
        { key: '{{plan.precio}}', description: 'Precio del plan (número)' },
        { key: '{{plan.precioFormateado}}', description: 'Precio del plan (formateado en Gs.)' },
        { key: '{{plan.descripcion}}', description: 'Descripción del plan' },
        { key: '{{plan.cobertura}}', description: 'Detalles de cobertura' },
      ],
    },
    {
      category: 'Empresa',
      variables: [
        { key: '{{empresa.nombre}}', description: 'Nombre de la empresa' },
        { key: '{{empresa.email}}', description: 'Email de la empresa' },
        { key: '{{empresa.telefono}}', description: 'Teléfono de la empresa' },
        { key: '{{empresa.direccion}}', description: 'Dirección de la empresa' },
      ],
    },
    {
      category: 'Venta',
      variables: [
        { key: '{{venta.fecha}}', description: 'Fecha de la venta' },
        { key: '{{venta.fechaFormateada}}', description: 'Fecha formateada (ej: 5 de febrero de 2026)' },
        { key: '{{venta.total}}', description: 'Total de la venta (número)' },
        { key: '{{venta.totalFormateado}}', description: 'Total formateado en Gs.' },
        { key: '{{venta.totalLetras}}', description: 'Total en letras (ej: CINCUENTA MIL GUARANÍES)' },
        { key: '{{venta.vendedor}}', description: 'Nombre del vendedor' },
        { key: '{{venta.numeroContrato}}', description: 'Número de contrato' },
        { key: '{{venta.numeroSolicitud}}', description: 'Número de solicitud' },
        { key: '{{venta.estado}}', description: 'Estado de la venta' },
        { key: '{{venta.cantidadAdherentes}}', description: 'Cantidad de adherentes' },
        { key: '{{venta.fechaInicioContrato}}', description: 'Fecha inicio contrato (dd/MM/yyyy) - 1er día del mes de aprobación' },
        { key: '{{venta.fechaInicioContratoFormateada}}', description: 'Fecha inicio contrato formateada' },
        { key: '{{venta.vigenciaInmediata}}', description: 'Vigencia inmediata (Sí/No)' },
        { key: '{{venta.tipoVenta}}', description: 'Tipo de venta (Venta Nueva/Reingreso)' },
      ],
    },
    {
      category: 'Facturación',
      variables: [
        { key: '{{facturacion.razonSocial}}', description: 'Razón Social para facturación' },
        { key: '{{facturacion.ruc}}', description: 'R.U.C. para facturación' },
        { key: '{{facturacion.email}}', description: 'Email de facturación' },
        { key: '{{facturacion.telefono}}', description: 'Teléfono de facturación' },
      ],
    },
    {
      category: 'Firma Digital',
      variables: [
        { key: '{{firma.enlace}}', description: 'Enlace para firma digital' },
        { key: '{{firma.fechaExpiracion}}', description: 'Fecha de expiración del enlace' },
        { key: '{{firma.estado}}', description: 'Estado de la firma' },
        { key: '{{firma_contratante}}', description: 'Campo de firma del contratante (se reemplaza con la imagen de firma al firmar)' },
        { key: '{{firma_adherente}}', description: 'Campo de firma del adherente (se reemplaza con la imagen de firma al firmar)' },
      ],
    },
    {
      category: 'Fecha y Hora',
      variables: [
        { key: '{{fecha.actual}}', description: 'Fecha 1er día del mes actual (yyyy-MM-dd)' },
        { key: '{{fecha.actualFormateada}}', description: 'Fecha 1er día del mes actual formateada' },
        { key: '{{fecha.horaActual}}', description: 'Hora actual (HH:mm)' },
        { key: '{{fecha.anio}}', description: 'Año actual' },
        { key: '{{fecha.mes}}', description: 'Mes actual (nombre)' },
        { key: '{{fecha.dia}}', description: 'Día actual' },
      ],
    },
    {
      category: 'Beneficiario Principal',
      variables: [
        { key: '{{titular.nombre}}', description: 'Nombre del titular' },
        { key: '{{titular.apellido}}', description: 'Apellido del titular' },
        { key: '{{titular.nombreCompleto}}', description: 'Nombre completo del titular' },
        { key: '{{titular.ci}}', description: 'C.I. del titular' },
        { key: '{{titular.dni}}', description: 'C.I. del titular (alias)' },
        { key: '{{titular.edad}}', description: 'Edad del titular' },
        { key: '{{titular.montoFormateado}}', description: 'Monto de cobertura del titular' },
      ],
    },
    {
      category: 'Lista de Beneficiarios',
      variables: [
        { key: '{{#beneficiarios}}...{{/beneficiarios}}', description: 'Loop para listar todos los beneficiarios' },
        { key: '{{indice}}', description: 'Número del beneficiario (dentro del loop)' },
        { key: '{{nombreCompleto}}', description: 'Nombre completo (dentro del loop)' },
        { key: '{{nombre}}', description: 'Nombre (dentro del loop)' },
        { key: '{{apellido}}', description: 'Apellido (dentro del loop)' },
        { key: '{{fechaNacimiento}}', description: 'Fecha de nacimiento (dentro del loop)' },
        { key: '{{genero}}', description: 'Género (dentro del loop)' },
        { key: '{{parentesco}}', description: 'Parentesco (dentro del loop)' },
        { key: '{{edad}}', description: 'Edad (dentro del loop)' },
        { key: '{{titular.edad}}', description: 'Edad del beneficiario (alias legacy dentro del loop)' },
        { key: '{{monto}}', description: 'Monto numérico (dentro del loop)' },
        { key: '{{montoFormateado}}', description: 'Monto de cobertura formateado (dentro del loop)' },
        { key: '{{dni}}', description: 'C.I./Documento (dentro del loop)' },
        { key: '{{first_name}}', description: 'Nombre - alias inglés (dentro del loop)' },
        { key: '{{last_name}}', description: 'Apellido - alias inglés (dentro del loop)' },
        { key: '{{birth_date}}', description: 'Fecha nac. - alias inglés (dentro del loop)' },
        { key: '{{gender}}', description: 'Género - alias inglés (dentro del loop)' },
        { key: '{{relationship}}', description: 'Parentesco - alias inglés (dentro del loop)' },
        { key: '{{amount}}', description: 'Monto formateado - alias inglés (dentro del loop)' },
        { key: '{{vigencia_inmediata}}', description: 'Vigencia inmediata de la venta (dentro del loop)' },
        { key: '{{tipo_venta}}', description: 'Tipo de venta (dentro del loop)' },
      ],
    },
    {
      category: 'DDJJ Salud',
      variables: [
        { key: '{{respuestas.ddjj_pregunta_1}}', description: 'Enfermedades crónicas (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_2}}', description: 'Trastorno mental/neurológico (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_3}}', description: 'Enfermedad cardiovascular (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_4}}', description: 'Quistes/tumores/oncológicas (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_5}}', description: 'Internaciones/cirugías (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_6}}', description: 'Medicamentos/tratamientos (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_pregunta_7}}', description: 'Otras enfermedades (Sí/No + detalle)' },
        { key: '{{respuestas.ddjj_peso}}', description: 'Peso en kg' },
        { key: '{{respuestas.ddjj_altura}}', description: 'Estatura en cm' },
        { key: '{{respuestas.ddjj_fuma}}', description: 'Fuma (Sí/No)' },
        { key: '{{respuestas.ddjj_vapea}}', description: 'Vapea (Sí/No)' },
        { key: '{{respuestas.ddjj_alcohol}}', description: 'Consume alcohol (Sí/No)' },
        { key: '{{respuestas.ddjj_menstruacion}}', description: 'Última menstruación/embarazo' },
      ],
    },
  ];
}

/**
 * Generate beneficiaries table HTML
 */
export function generateBeneficiariesTable(beneficiaries: BeneficiaryContext[]): string {
  if (beneficiaries.length === 0) return '';

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">#</th>
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">Nombre</th>
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">Documento</th>
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">Parentesco</th>
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">Edad</th>
          <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">Cobertura</th>
        </tr>
      </thead>
      <tbody>
        ${beneficiaries.map((b, i) => `
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${i + 1}</td>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${b.nombreCompleto}</td>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${b.dni}</td>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${b.parentesco}</td>
            <td style="border: 1px solid #e5e7eb; padding: 10px;">${b.edad} años</td>
            <td style="border: 1px solid #e5e7eb; padding: 10px; text-align: right;">${b.montoFormateado}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f9fafb; font-weight: bold;">
          <td colspan="5" style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">Total Cobertura:</td>
          <td style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">
            ${formatCurrency(beneficiaries.reduce((sum, b) => sum + b.monto, 0))}
          </td>
        </tr>
      </tfoot>
    </table>
  `;
}
