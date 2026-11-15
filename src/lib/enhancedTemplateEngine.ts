// Enhanced Template Engine for dynamic document generation with beneficiaries support
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency as formatPygCurrency } from '@/lib/utils';
import { getSignatureLinkUrl } from '@/lib/appUrls';
import { getClientDisplayName, getClientDocument, getClientDocumentLabel, isCompanyClient } from '@/lib/clientUtils';
import { agruparNomina, aplanarNomina, estaActivo, tieneNomina } from '@/lib/nomina';

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
  gender: string;
  sexo: string;
  estadoCivil: string;
  ocupacion: string;
  tienePreexistencias: boolean;
  detallePreexistencias: string;
  monto: number;
  montoFormateado: string;
  requiereFirma: boolean;
  estadoFirma: string;
  /** "Fecha de Ingreso": columna del Anexo de Incorporación de Adherente. */
  fechaIngreso: string;
  /**
   * "V.I." por adherente. Vacío cuando el adherente no lo tiene definido;
   * en ese caso el alias del template cae a la vigencia de la VENTA, que es
   * el comportamiento que existía hasta ahora.
   */
  vigenciaInmediata: string;
  /**
   * Valor CRUDO de `beneficiaries.immediate_coverage`: true | false | null.
   * `null` NO es "no": significa "hereda la vigencia de la venta" (misma
   * semántica que SaleAdherentsTab). Por eso no se normaliza a boolean: el
   * cálculo de la V.I. efectiva es `b.immediateCoverage ?? sale.immediate_coverage`.
   */
  immediateCoverage: boolean | null;
  /**
   * NÓMINA de un contrato de empresa. Vacíos en una venta a persona física, así
   * que las plantillas de siempre no cambian.
   *
   * `rol`        → "Empleado" | "Adherente"
   * `dependeDe`  → nombre del empleado del que depende; vacío en la fila del
   *                propio empleado
   * `plan`       → plan de ESTA persona (en una empresa cada uno tiene el suyo)
   */
  rol: string;
  dependeDe: string;
  plan: string;
}

/**
 * Un EMPLEADO con su grupo, para el loop `{{#empleados}}` del contrato de
 * empresa.
 */
export interface EmpleadoContext extends BeneficiaryContext {
  adherentes: BeneficiaryContext[];
  cantidadAdherentes: number;
  subtotal: number;
  subtotalFormateado: string;
}

/** Una fila de la tabla de INTEGRANTES del Formulario de Solicitud de Cambio. */
export interface PlanChangeMemberContext {
  nombre: string;
  planAnterior: string;
  montoAnterior: number;
  montoAnteriorFormateado: string;
  montoNuevo: number;
  montoNuevoFormateado: string;
}

export interface EnhancedTemplateContext {
  cliente: {
    nombre: string;
    apellido: string;
    nombreCompleto: string;
    email: string;
    telefono: string;
    /** Documento del titular. Para una EMPRESA lleva el RUC, no el dni. */
    ci: string;
    /** Igual que `ci`. Se conserva porque hay plantillas en produccion que lo usan. */
    dni: string;
    /** Alias explicito de `ci`/`dni`, para plantillas nuevas. */
    documento: string;
    /** 'RUC' para empresas, 'C.I.' para personas. */
    documentoLabel: string;
    /** Solo empresas; cadena vacia para personas. */
    ruc: string;
    /** Solo empresas; cadena vacia para personas. */
    razonSocial: string;
    esEmpresa: boolean;
    direccion: string;
    ciudad: string;
    provincia: string;
    departamento: string;
    barrio: string;
    codigoPostal: string;
    fechaNacimiento: string;
    edad: number;
    genero: string;
    gender: string;
    sexo: string;
    /** "ID CLIENTE Nº" del Anexo de Incorporación (clients.external_id). */
    idCliente: string;
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
    /**
     * Cuota mensual del GRUPO completo. Solo difiere de totalFormateado en las
     * operaciones de Incorporación de Adherente, donde el total de la venta es
     * solo el de las personas que entran (y es la base de la comisión).
     */
    totalGrupoFormateado: string;
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
    /** "ALTA" | "BAJA" | "" — sólo en un anexo de movimiento de nómina. */
    movimiento: string;
    /** Fecha de baja, dd/MM/yyyy. Vacía en un alta. */
    movimientoFecha: string;
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
  /**
   * NÓMINA de un contrato de empresa: los empleados ACTIVOS con su grupo.
   * Vacío en una venta a persona física, así que el loop `{{#empleados}}` no
   * imprime nada y las plantillas de siempre no cambian.
   */
  empleados: EmpleadoContext[];
  /**
   * Subconjunto de `beneficiarios` cuya VIGENCIA INMEDIATA EFECTIVA es true
   * (`beneficiario.immediate_coverage ?? venta.immediate_coverage`).
   * Es la lista que imprime el "Anexo Especial de Vigencia Inmediata".
   */
  beneficiariosVigenciaInmediata: BeneficiaryContext[];
  beneficiarioPrincipal: BeneficiaryContext | null;
  /**
   * Datos del Cambio de Plan (los adosa `attachPlanChangeContext`).
   * Para cualquier venta que NO sea un cambio de plan queda en vacíos/0, así
   * que ninguna plantilla existente se rompe.
   */
  cambio: {
    planAnterior: string;
    planNuevo: string;
    montoAnterior: number;
    montoAnteriorFormateado: string;
    montoNuevo: number;
    montoNuevoFormateado: string;
    /** Etiqueta legible en español, no el código de la base. */
    motivo: string;
    fechaInicioNuevoContrato: string;
    observaciones: string;
  };
  /** Foto de los integrantes al momento de la solicitud (members_snapshot). */
  integrantesAnteriores: PlanChangeMemberContext[];
  respuestas: Record<string, any>;
  representante: {
    nombre: string;
    dni: string;
  };
  // contratante: quien firma por parte del cliente.
  // Es el responsable de pago si signer_type = 'responsable_pago', o el titular si no.
  contratante: {
    nombre: string;
    apellido: string;
    nombreCompleto: string;
    ci: string;
    dni: string;
    documento?: string;
    documentoLabel?: string;
    email: string;
    telefono: string;
    relacion: string;
    esResponsable: boolean;
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
/**
 * @param opts.planName  nombre del plan de ESTA persona (contratos de empresa)
 * @param opts.dependeDe nombre del empleado del que depende
 */
function createBeneficiaryContext(
  beneficiary: any,
  opts?: { planName?: string; dependeDe?: string },
): BeneficiaryContext {
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
    // Alias en inglés para compatibilidad con templates que usan {{gender}} o {{sexo}}
    gender: beneficiary.gender || '',
    // sexo: abreviado para la columna SEXO de la tabla de beneficiarios (M/F)
    sexo: beneficiary.gender === 'Masculino' ? 'M' : beneficiary.gender === 'Femenino' ? 'F' : (beneficiary.gender || ''),
    estadoCivil: beneficiary.marital_status || '',
    ocupacion: beneficiary.occupation || '',
    tienePreexistencias: beneficiary.has_preexisting_conditions || false,
    detallePreexistencias: beneficiary.preexisting_conditions_detail || '',
    monto: beneficiary.amount || 0,
    montoFormateado: formatCurrency(beneficiary.amount || 0),
    requiereFirma: beneficiary.signature_required !== false,
    estadoFirma: 'pendiente', // Will be updated from signature_links
    fechaIngreso: formatDate(beneficiary.entry_date),
    // Se deja vacío si la columna es NULL para que el alias herede la
    // vigencia de la venta (ver buildBenAliases).
    vigenciaInmediata:
      beneficiary.immediate_coverage === true ? 'Sí'
      : beneficiary.immediate_coverage === false ? 'No'
      : '',
    // Crudo, sin normalizar: null = "hereda de la venta".
    immediateCoverage:
      beneficiary.immediate_coverage === true ? true
      : beneficiary.immediate_coverage === false ? false
      : null,
    // Nómina de empresa. En una venta a persona física `member_role` no existe
    // (o es 'adherente' por default) y los tres quedan vacíos.
    rol: beneficiary.member_role === 'empleado' ? 'Empleado'
      : beneficiary.member_role === 'adherente' ? 'Adherente'
      : '',
    dependeDe: opts?.dependeDe || '',
    plan: opts?.planName || '',
  };
}

/**
 * Motivos del Cambio de Plan → etiqueta del formulario en papel.
 * Se replica acá (en vez de importar `usePlanChanges`) para que el motor de
 * plantillas no dependa de un hook de React. Si se agrega un motivo nuevo hay
 * que sumarlo en los dos lados.
 */
const PLAN_CHANGE_REASON_LABELS: Record<string, string> = {
  separacion: 'Separación del contrato actual a uno independiente',
  mayor_cobertura: 'Pasar a plan de mayor cobertura',
  menor_cobertura: 'Pasar a plan de menor cobertura',
};

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
  companySettings?: any,
  /**
   * Catálogo de planes, para poder imprimir el plan de CADA persona en un
   * contrato de empresa. Va al final y es opcional a propósito: así los 6 call
   * sites que ya existen siguen compilando y comportándose igual sin tocarlos.
   */
  plans?: any[]
): EnhancedTemplateContext {
  const now = new Date();
  const nombrePlanPorId = new Map<string, string>(
    (plans || []).map((p: any) => [p.id, p.name]),
  );
  
  // Create beneficiary contexts (always include titular first for contract tables)
  const normalizedBeneficiaries = Array.isArray(beneficiaries) ? beneficiaries : [];
  const hasPrimaryBeneficiary = normalizedBeneficiaries.some((b: any) => b?.is_primary === true);

  // Calculate titular's individual share: total minus sum of adherent amounts
  const adherentSum = normalizedBeneficiaries
    .filter((b: any) => !b?.is_primary)
    .reduce((sum: number, b: any) => sum + (b?.amount || 0), 0);
  const titularAmount = (sale?.total_amount || 0) - adherentSum;
  const effectiveTitularAmount = titularAmount > 0 ? titularAmount : (sale?.total_amount || plan?.price || 0);

  // En una operación de Incorporación de Adherente el documento debe listar
  // SOLO a quienes se incorporan: el titular ya figura en el contrato madre y
  // no va como una fila más de la tabla del anexo. Para el resto de las ventas
  // se sigue anteponiendo el titular, como siempre.
  const esIncorporacionDeAdherente = (sale as any)?.sale_type === 'alta_adherente';

  // Un contrato de EMPRESA tampoco lleva fila de titular: la razón social no es
  // beneficiaria de sí misma, no tiene edad ni parentesco, y su `titular_amount`
  // es 0 —así que `effectiveTitularAmount` caía al fallback `sale.total_amount`
  // e imprimía a la empresa cobrando la cuota entera del grupo, duplicada
  // encima de la nómina—. Los beneficiarios de una venta de empresa son sus
  // empleados y los adherentes de ellos.
  const esContratoDeEmpresa = isCompanyClient(client);

  const titularFallback =
    !hasPrimaryBeneficiary && client && !esIncorporacionDeAdherente && !esContratoDeEmpresa
    ? {
        first_name: client?.first_name || '',
        last_name: client?.last_name || '',
        document_number: getClientDocument(client),
        dni: getClientDocument(client),
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

  // NÓMINA: cada empleado con los adherentes a su cargo. Se arma con el MISMO
  // agrupador que usa la pantalla (`src/lib/nomina.ts`), para que lo que se ve
  // al cargar y lo que sale impreso no puedan discrepar.
  const nomina = agruparNomina(normalizedBeneficiaries as any[]);
  const nombreDeMiembro = (b: any) =>
    `${b?.first_name || ''} ${b?.last_name || ''}`.trim();
  const planDeMiembro = (b: any) =>
    (b?.plan_id && nombrePlanPorId.get(b.plan_id)) || '';

  const contextoDe = (b: any, dependeDe?: string) =>
    createBeneficiaryContext(b, { planName: planDeMiembro(b), dependeDe });

  const empleados: EmpleadoContext[] = nomina.empleados
    .filter((g) => estaActivo(g.empleado))
    .map((g) => {
      const adherentesActivos = g.adherentes.filter(estaActivo);
      return {
        ...contextoDe(g.empleado),
        adherentes: adherentesActivos.map((a) => contextoDe(a, nombreDeMiembro(g.empleado))),
        cantidadAdherentes: adherentesActivos.length,
        subtotal: g.subtotal,
        subtotalFormateado: formatCurrency(g.subtotal),
      };
    });

  const beneficiaryContexts = mergedBeneficiaries.map((b) => {
    // Titular: always use calculated share (total - adherent sum) for accuracy
    if (b.is_primary || b.relationship?.toLowerCase() === 'titular') {
      return createBeneficiaryContext({ ...b, amount: effectiveTitularAmount });
    }
    // El empleado del que depende sólo existe en un contrato de empresa.
    const padre = b.parent_beneficiary_id
      ? normalizedBeneficiaries.find((x: any) => x?.id === b.parent_beneficiary_id)
      : null;
    return contextoDe(b, padre ? nombreDeMiembro(padre) : undefined);
  });

  const sortedBeneficiaryContexts = tieneNomina(normalizedBeneficiaries as any[])
    // Con nómina, el orden ES la información: cada empleado seguido de su
    // grupo. Ordenar por "titular primero" dejaría la tabla ilegible.
    ? aplanarNomina(nomina).map((m) => {
        const idx = mergedBeneficiaries.findIndex((b: any) => b?.id === (m as any).id);
        return idx >= 0 ? beneficiaryContexts[idx] : contextoDe(m);
      })
    : [...beneficiaryContexts].sort((a, b) => {
        const aIsPrimary = (a.parentesco || '').toLowerCase() === 'titular';
        const bIsPrimary = (b.parentesco || '').toLowerCase() === 'titular';
        if (aIsPrimary === bIsPrimary) return 0;
        return aIsPrimary ? -1 : 1;
      });

  const primaryBeneficiary = sortedBeneficiaryContexts.find((b) => (b.parentesco || '').toLowerCase() === 'titular')
    || sortedBeneficiaryContexts[0]
    || null;

  // V.I. EFECTIVA por persona: el adherente manda si tiene un valor propio
  // (true/false); si es null hereda la vigencia de la VENTA. Misma semántica
  // que SaleAdherentsTab y que el alias {{vigencia_inmediata_adherente}}.
  // El titular no se agrega aparte: cuando corresponde imprimirlo ya viene en
  // sortedBeneficiaryContexts (fila is_primary o el fallback armado arriba),
  // así que filtrar la lista alcanza y no lo duplica.
  const ventaVigenciaInmediata = sale?.immediate_coverage === true;
  const beneficiariosVigenciaInmediata = sortedBeneficiaryContexts.filter(
    (b) => (b.immediateCoverage ?? ventaVigenciaInmediata) === true,
  );

  // Datos del Cambio de Plan que adosa `attachPlanChangeContext`.
  const planChange = (sale as any)?.plan_change || null;
  const planChangeMembers: PlanChangeMemberContext[] = Array.isArray(planChange?.members)
    ? planChange.members.map((m: any) => ({
        nombre: m?.name || '',
        planAnterior: m?.previous_plan || '',
        montoAnterior: Number(m?.previous_amount) || 0,
        montoAnteriorFormateado: formatCurrency(Number(m?.previous_amount) || 0),
        montoNuevo: Number(m?.new_amount) || 0,
        montoNuevoFormateado: formatCurrency(Number(m?.new_amount) || 0),
      }))
    : [];

  const cambioContext = {
    planAnterior: planChange?.previous_plan_name || '',
    planNuevo: planChange?.new_plan_name || '',
    montoAnterior: Number(planChange?.previous_total_amount) || 0,
    montoAnteriorFormateado: planChange
      ? formatCurrency(Number(planChange.previous_total_amount) || 0)
      : '',
    montoNuevo: Number(planChange?.new_total_amount) || 0,
    montoNuevoFormateado: planChange
      ? formatCurrency(Number(planChange.new_total_amount) || 0)
      : '',
    motivo: planChange
      ? (PLAN_CHANGE_REASON_LABELS[planChange.reason] || planChange.reason_label || planChange.reason || '')
      : '',
    // formatDate le agrega T00:00:00 a las fechas de calendario: sin eso
    // new Date('2026-09-01') es medianoche UTC y en Paraguay muestra el día
    // anterior (bug conocido #1).
    fechaInicioNuevoContrato: formatDate(planChange?.new_contract_start_date || null, 'dd/MM/yyyy'),
    observaciones: planChange?.observations || '',
  };

  // Compute effective total from beneficiary amounts (source of truth)
  const effectiveTotal = sortedBeneficiaryContexts.length > 0
    ? sortedBeneficiaryContexts.reduce((sum, b) => sum + (b.monto || 0), 0)
    : (sale?.total_amount || 0);

  return {
    cliente: {
      nombre: client?.first_name || '',
      apellido: client?.last_name || '',
      nombreCompleto: getClientDisplayName(client),
      email: client?.email || '',
      telefono: client?.phone || '',
      // Documento segun el tipo de cliente: RUC para empresas, C.I. para
      // personas. Se mantienen `ci` y `dni` porque hay plantillas en produccion
      // que los usan; para una persona el valor es exactamente el de antes.
      ci: getClientDocument(client),
      dni: getClientDocument(client),
      documento: getClientDocument(client),
      documentoLabel: getClientDocumentLabel(client),
      ruc: isCompanyClient(client) ? (client?.ruc || '') : '',
      razonSocial: isCompanyClient(client) ? (client?.razon_social || '') : '',
      esEmpresa: isCompanyClient(client),
      direccion: client?.address || '',
      ciudad: client?.city || '',
      provincia: client?.province || '',
      departamento: client?.province || '',
      barrio: (client as any)?.barrio || '',
      codigoPostal: client?.postal_code || '',
      fechaNacimiento: formatDate(client?.birth_date),
      edad: calculateAge(client?.birth_date),
      genero: (client as any)?.gender || '',
      gender: (client as any)?.gender || '',
      sexo: (client as any)?.gender === 'Masculino' ? 'M' : (client as any)?.gender === 'Femenino' ? 'F' : ((client as any)?.gender || ''),
      idCliente: (client as any)?.external_id || '',
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
      totalGrupoFormateado: formatCurrency(
        Number((sale as any)?.group_monthly_total ?? effectiveTotal) || 0,
      ),
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
      // Movimiento de nómina, adosado por `attachGroupMonthlyTotal`. Vacío en
      // cualquier venta que no sea un anexo, así que `{{movimiento}}` no ensucia
      // ninguna plantilla existente.
      movimiento:
        (sale as any)?.movimiento_nomina === 'baja' ? 'BAJA'
        : (sale as any)?.movimiento_nomina === 'alta' ? 'ALTA'
        : '',
      movimientoFecha: (sale as any)?.movimiento_fecha
        ? formatDate((sale as any).movimiento_fecha, 'dd/MM/yyyy')
        : '',
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
    empleados,
    beneficiariosVigenciaInmediata,
    beneficiarioPrincipal: primaryBeneficiary,
    cambio: cambioContext,
    integrantesAnteriores: planChangeMembers,
    respuestas: responses || {},
    representante: {
      nombre: companySettings?.contratada_signer_name || company?.name || '',
      dni: companySettings?.contratada_signer_dni || '',
    },
    // contratante: quien firma el contrato por parte del cliente.
    // Si signer_type = 'responsable_pago', usa los datos del responsable.
    // Si no, usa los datos del titular (cliente).
    contratante: (() => {
      const isResponsable = (sale as any)?.signer_type === 'responsable_pago';
      if (isResponsable && (sale as any)?.signer_name) {
        return {
          nombre: (sale as any).signer_name || '',
          apellido: '',
          nombreCompleto: (sale as any).signer_name || '',
          ci: (sale as any).signer_dni || '',
          dni: (sale as any).signer_dni || '',
          email: (sale as any).signer_email || '',
          telefono: (sale as any).signer_phone || '',
          relacion: (sale as any).signer_relationship || 'Responsable de Pago',
          esResponsable: true,
        };
      }
      return {
        nombre: client?.first_name || '',
        apellido: client?.last_name || '',
        nombreCompleto: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
        ci: getClientDocument(client),
        dni: getClientDocument(client),
        documento: getClientDocument(client),
        documentoLabel: getClientDocumentLabel(client),
        email: client?.email || '',
        telefono: client?.phone || '',
        relacion: 'Titular',
        esResponsable: false,
      };
    })(),
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

  // Nombres que disparan la auto-expansión de una fila <tr> por adherente.
  // Se usa anclado (`\{\{(?:...)\}\}`), así que agregar nombres es seguro; aun
  // así, las variantes más largas van ANTES que sus prefijos por claridad
  // (vigencia_inmediata_adherente antes que vigencia_inmediata).
  // OJO: `address` estaba en los alias pero NO acá, así que una fila que solo
  // usara {{address}} no auto-expandía. Corregido.
  // `plan_nombre` y `depende_de` van ANTES que sus prefijos por la misma razón
  // que `vigencia_inmediata_adherente`: el patrón está anclado, pero mantener el
  // orden hace obvio cuál gana si algún día se desancla.
  const beneficiaryPlaceholderNames = 'first_name|last_name|_index|index|indice|birth_date|dni|ci|gender|amount|relationship|edad|titular\\.edad|age|formatted_amount|email|phone|document_number|vigencia_inmediata_adherente|vigencia_inmediata|tipo_venta|venta\\.vigenciaInmediata|venta\\.tipoVenta|nombre|apellido|nombreCompleto|fechaNacimiento|genero|parentesco|montoFormateado|monto|ocupacion|estadoCivil|barrio|address|telefono|direccion|domicilio|fecha_ingreso|fechaIngreso|plan_nombre|plan_persona|depende_de|dependeDe|rol';

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
    '{{telefono}}': beneficiary.telefono,
    '{{direccion}}': beneficiary.direccion,
    '{{domicilio}}': beneficiary.direccion,
    // Columnas propias del Anexo de Incorporación de Adherente
    '{{fecha_ingreso}}': beneficiary.fechaIngreso,
    '{{fechaIngreso}}': beneficiary.fechaIngreso,
    // Si el adherente no tiene V.I. propia, hereda la de la venta.
    '{{vigencia_inmediata_adherente}}':
      beneficiary.vigenciaInmediata || context.venta.vigenciaInmediata,
    '{{vigencia_inmediata}}': context.venta.vigenciaInmediata,
    '{{tipo_venta}}': context.venta.tipoVenta,
    '{{venta.vigenciaInmediata}}': context.venta.vigenciaInmediata,
    '{{venta.tipoVenta}}': context.venta.tipoVenta,
    // Nómina de empresa. En una venta a persona física los tres son cadena
    // vacía, así que una plantilla que los use no rompe: sólo deja la celda en
    // blanco.
    '{{plan_nombre}}': beneficiary.plan,
    '{{plan_persona}}': beneficiary.plan,
    '{{depende_de}}': beneficiary.dependeDe,
    '{{dependeDe}}': beneficiary.dependeDe,
    '{{rol}}': beneficiary.rol,
  });

  const applyBenAliases = (text: string, aliases: Record<string, string>): string => {
    let out = text;
    Object.entries(aliases).forEach(([placeholder, value]) => {
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(regex, value || '');
    });
    return out;
  };

  // Cuerpo del loop, una vez por beneficiario. Lo comparten
  // {{#beneficiarios}} y {{#beneficiarios_vi}}: MISMAS variables por fila y
  // mismo índice, para que una tabla se pueda copiar de una plantilla a otra.
  const renderBeneficiaryLoop = (content: string, list: BeneficiaryContext[]): string =>
    list.map((beneficiary, index) => {
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
    return renderBeneficiaryLoop(content, context.beneficiarios);
  });

  // {{#empleados}}...{{/empleados}}: NÓMINA de un contrato de empresa, con un
  // sub-loop {{#sus_adherentes}} por empleado.
  //
  // POR QUÉ UN LOOP APARTE Y NO {{#beneficiarios}}
  // Ese loop es PLANO: no sabe agrupar, así que no puede imprimir un subtotal
  // por empleado ni anidar a su grupo debajo. La nómina completa igual se puede
  // imprimir con {{#beneficiarios}} usando las columnas {{rol}} y
  // {{depende_de}} — este loop es para cuando el documento necesita el corte
  // por empleado.
  //
  // El sub-loop se resuelve PRIMERO, con `renderBeneficiaryLoop`, y recién
  // después se aplican los alias del empleado sobre el resto de la fila: al
  // revés, los `{{nombreCompleto}}` de los adherentes se reemplazarían todos
  // por el del empleado.
  const empleadosLoopRegex = /\{\{#empleados\}\}([\s\S]*?)\{\{\/empleados\}\}/gi;
  const susAdherentesLoopRegex = /\{\{#sus_adherentes\}\}([\s\S]*?)\{\{\/sus_adherentes\}\}/gi;
  result = result.replace(empleadosLoopRegex, (_, content) => {
    const trimmedContent = content.replace(/<[^>]*>/g, '').trim();
    if (!trimmedContent) return '';
    // La nómina ya se imprimió acá: la auto-expansión de <tr> no debe volver a
    // repetir las filas.
    beneficiaryLoopMatched = true;
    beneficiaryLoopHadContent = true;

    return context.empleados
      .map((empleado, index) => {
        let itemResult = String(content).replace(
          susAdherentesLoopRegex,
          (__: string, subContent: string) =>
            renderBeneficiaryLoop(subContent, empleado.adherentes),
        );

        itemResult = applyBenAliases(itemResult, {
          ...buildBenAliases(empleado, index),
          '{{cantidadAdherentes}}': String(empleado.cantidadAdherentes),
          '{{cantidad_adherentes}}': String(empleado.cantidadAdherentes),
          '{{subtotal}}': String(empleado.subtotal),
          '{{subtotalFormateado}}': empleado.subtotalFormateado,
          '{{subtotal_formateado}}': empleado.subtotalFormateado,
        });
        return itemResult;
      })
      .join('');
  });

  // {{#beneficiarios_vi}}...{{/beneficiarios_vi}}: Anexo Especial de Vigencia
  // Inmediata. Sólo las personas con V.I. EFECTIVA (el adherente manda; si no
  // tiene valor propio, hereda la de la venta).
  const beneficiariosViLoopRegex = /\{\{#beneficiarios_vi\}\}([\s\S]*?)\{\{\/beneficiarios_vi\}\}/gi;
  result = result.replace(beneficiariosViLoopRegex, (_, content) => {
    const trimmedContent = content.replace(/<[^>]*>/g, '').trim();
    if (!trimmedContent) return '';
    // Marca el loop como resuelto para que la auto-expansión de <tr> no vuelva
    // a repetir las filas que este loop ya expandió.
    beneficiaryLoopMatched = true;
    beneficiaryLoopHadContent = true;
    return renderBeneficiaryLoop(content, context.beneficiariosVigenciaInmediata);
  });

  // {{#integrantes_anteriores}}...{{/integrantes_anteriores}}: tabla de
  // INTEGRANTES del Formulario de Solicitud de Cambio. Recorre el
  // members_snapshot adosado (una FOTO del contrato al pedir el cambio), NO
  // los beneficiarios actuales del contrato.
  const integrantesLoopRegex = /\{\{#integrantes_anteriores\}\}([\s\S]*?)\{\{\/integrantes_anteriores\}\}/gi;
  result = result.replace(integrantesLoopRegex, (_, content) => {
    const trimmedContent = content.replace(/<[^>]*>/g, '').trim();
    if (!trimmedContent) return '';
    return context.integrantesAnteriores.map((member, index) => {
      const aliases: Record<string, string> = {
        '{{nombre}}': member.nombre,
        '{{nombreCompleto}}': member.nombre,
        '{{planAnterior}}': member.planAnterior,
        '{{montoAnterior}}': String(member.montoAnterior),
        '{{montoAnteriorFormateado}}': member.montoAnteriorFormateado,
        '{{montoNuevo}}': String(member.montoNuevo),
        '{{montoNuevoFormateado}}': member.montoNuevoFormateado,
        '{{_index}}': String(index + 1),
        '{{index}}': String(index + 1),
        '{{indice}}': String(index + 1),
      };
      let itemResult = content;
      Object.entries(aliases).forEach(([placeholder, value]) => {
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        itemResult = itemResult.replace(regex, value || '');
      });
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
  // Cambio de Plan. En una venta normal todos sus campos son '' o 0, así que
  // una plantilla que no los use no cambia en nada.
  replaceNestedVariables(context.cambio, 'cambio');

  // Replace primary beneficiary
  if (context.beneficiarioPrincipal) {
    replaceNestedVariables(context.beneficiarioPrincipal, 'beneficiarioPrincipal');
    replaceNestedVariables(context.beneficiarioPrincipal, 'titular');
  }

  // ===== STEP 2: Legacy aliases =====
  // NOTA: titular_nombre, titular_ci, etc. usan 'contratante'.
  // Si signer_type = 'responsable_pago' → datos del responsable.
  // Si signer_type = 'titular'/null → datos del cliente (sin cambio).
  const legacyAliases: Record<string, string> = {
    '{{titular_nombre}}': context.contratante.nombreCompleto,
    '{{titular_email}}': context.contratante.email,
    '{{titular_telefono}}': context.contratante.telefono,
    '{{titular_ci}}': context.contratante.ci,
    // Documento del contratante CON su etiqueta: en una empresa es "RUC", no
    // "C.I.". `{{titular_ci}}` ya traía el valor correcto (getClientDocument
    // devuelve el RUC para una empresa), pero las plantillas rotulaban "C. I.
    // Nº" a mano y quedaba mal en un contrato corporativo. La rama del
    // responsable de pago siempre es una persona, de ahí el default.
    '{{titular_documento}}': context.contratante.ci,
    '{{titular_documento_label}}': (context.contratante as any).documentoLabel || 'C.I.',
    '{{titular_dni}}': context.contratante.ci,
    '{{titular_direccion}}': context.cliente.direccion,
    '{{titular_ciudad}}': context.cliente.ciudad,
    '{{titular_provincia}}': context.cliente.provincia,
    '{{titular_departamento}}': context.cliente.departamento,
    '{{titular_barrio}}': context.cliente.barrio,
    '{{titular_fecha_nacimiento}}': context.cliente.fechaNacimiento,
    '{{titular_edad}}': String(context.cliente.edad),
    '{{id_cliente}}': context.cliente.idCliente,
    '{{titular_id_cliente}}': context.cliente.idCliente,
    '{{monto_total}}': context.venta.totalFormateado,
    '{{monto_total_grupo}}': context.venta.totalGrupoFormateado,
    '{{monto_total_letras}}': context.venta.totalLetras,
    '{{razon_social}}': context.facturacion.razonSocial,
    '{{ruc}}': context.facturacion.ruc,
    '{{billing_email}}': context.facturacion.email,
    '{{billing_telefono}}': context.facturacion.telefono,
    '{{fecha_actual}}': context.fecha.actualFormateada,
    '{{numero_contrato}}': context.venta.numeroContrato,
    '{{fecha_inicio_contrato}}': context.venta.fechaInicioContratoFormateada,
    '{{vendedor_nombre}}': context.venta.vendedor,
    '{{vigencia_inmediata}}': context.venta.vigenciaInmediata,
    '{{tipo_venta}}': context.venta.tipoVenta,
    // Movimiento de nómina. La plantilla del anexo es la MISMA para alta y para
    // baja, así que sin esto el documento no tendría cómo decir cuál es.
    '{{movimiento}}': context.venta.movimiento,
    '{{movimiento_fecha}}': context.venta.movimientoFecha,
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
        { key: '{{cliente.documento}}', description: 'RUC para empresas o C.I. para personas' },
        { key: '{{cliente.documentoLabel}}', description: 'Etiqueta del documento: RUC o C.I.' },
        { key: '{{cliente.ruc}}', description: 'RUC del cliente empresa' },
        { key: '{{cliente.razonSocial}}', description: 'Razón social del cliente empresa' },
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
        { key: '{{monto_total_grupo}}', description: 'Cuota mensual del grupo completo (Anexo de Incorporación)' },
        { key: '{{venta.totalLetras}}', description: 'Total en letras (ej: CINCUENTA MIL GUARANÍES)' },
        { key: '{{venta.vendedor}}', description: 'Nombre del vendedor' },
        { key: '{{venta.numeroContrato}}', description: 'Número de contrato' },
        { key: '{{venta.numeroSolicitud}}', description: 'Número de solicitud' },
        { key: '{{venta.estado}}', description: 'Estado de la venta' },
        { key: '{{venta.cantidadAdherentes}}', description: 'Cantidad de adherentes' },
        { key: '{{venta.fechaInicioContrato}}', description: 'Fecha de inicio del contrato (dd/MM/yyyy)' },
        { key: '{{fecha_inicio_contrato}}', description: 'Fecha inicio contrato formateada' },
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
        { key: '{{telefono}}', description: 'Teléfono del adherente (dentro del loop)' },
        { key: '{{domicilio}}', description: 'Domicilio del adherente (dentro del loop)' },
        { key: '{{barrio}}', description: 'Barrio del adherente (dentro del loop)' },
        { key: '{{fecha_ingreso}}', description: 'Fecha de ingreso del adherente (dentro del loop)' },
        { key: '{{vigencia_inmediata_adherente}}', description: 'V.I. del adherente; si no tiene, hereda la de la venta (dentro del loop)' },
      ],
    },
    {
      category: 'Vigencia Inmediata',
      variables: [
        {
          key: '{{#beneficiarios_vi}}...{{/beneficiarios_vi}}',
          description:
            'Loop del Anexo Especial de Vigencia Inmediata: lista SOLO a las personas con V.I. efectiva (la del adherente; si no tiene, la de la venta). Adentro valen las mismas variables que en {{#beneficiarios}}.',
        },
        { key: '{{venta.vigenciaInmediata}}', description: 'V.I. de la venta (Sí/No)' },
      ],
    },
    {
      category: 'Cambio de Plan',
      variables: [
        { key: '{{cambio.motivo}}', description: 'Motivo del cambio (texto legible)' },
        { key: '{{cambio.planAnterior}}', description: 'Plan anterior del contrato' },
        { key: '{{cambio.planNuevo}}', description: 'Plan nuevo' },
        { key: '{{cambio.montoAnteriorFormateado}}', description: 'Cuota anterior del grupo (Gs.)' },
        { key: '{{cambio.montoNuevoFormateado}}', description: 'Cuota nueva del grupo (Gs.)' },
        { key: '{{cambio.fechaInicioNuevoContrato}}', description: 'Fecha de inicio del nuevo contrato (dd/MM/yyyy)' },
        { key: '{{cambio.observaciones}}', description: 'Observaciones del cambio' },
        {
          key: '{{#integrantes_anteriores}}...{{/integrantes_anteriores}}',
          description: 'Loop de la tabla de INTEGRANTES: recorre la foto del contrato al momento de la solicitud',
        },
        { key: '{{nombre}}', description: 'Nombre del integrante (dentro de integrantes_anteriores)' },
        { key: '{{planAnterior}}', description: 'Plan anterior del integrante (dentro del loop)' },
        { key: '{{montoAnteriorFormateado}}', description: 'Monto anterior del integrante (dentro del loop)' },
        { key: '{{montoNuevoFormateado}}', description: 'Monto nuevo del integrante (dentro del loop)' },
        { key: '{{indice}}', description: 'Número de fila (dentro del loop)' },
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
