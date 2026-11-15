/**
 * Catálogo único de `sales.sale_type`.
 *
 * Hay dos familias, y la diferencia NO es cosmética:
 *
 *  · TIPOS MANUALES (`venta_nueva`, `reingreso`): los elige el vendedor en el
 *    formulario. Son ventas comerciales de verdad y cuentan en listados,
 *    dashboards y métricas del mes.
 *
 *  · TIPOS DE OPERACIÓN (`alta_adherente`, `cambio_plan`): los pone el SISTEMA
 *    al crear una venta-operación sobre un contrato ya firmado. No son ventas
 *    nuevas: existen para poder firmar el anexo/formulario y liquidar su
 *    comisión por separado. Nunca deben aparecer en el selector de "Tipo de
 *    Venta" ni inflar las métricas (ver `excludeOperationSales` en saleFilters).
 */

export const SALE_TYPES = {
  VENTA_NUEVA: 'venta_nueva',
  REINGRESO: 'reingreso',
  ALTA_ADHERENTE: 'alta_adherente',
  CAMBIO_PLAN: 'cambio_plan',
} as const;

export type SaleType = (typeof SALE_TYPES)[keyof typeof SALE_TYPES];

export interface SaleTypeOption {
  value: SaleType;
  label: string;
}

const LABELS: Record<SaleType, string> = {
  venta_nueva: 'Venta Nueva',
  reingreso: 'Reingreso',
  alta_adherente: 'Incorporación de Adherente',
  cambio_plan: 'Cambio de Plan',
};

/** Todos los tipos, para mostrar/filtrar en listados. */
export const SALE_TYPE_OPTIONS: SaleTypeOption[] = (
  Object.keys(LABELS) as SaleType[]
).map((value) => ({ value, label: LABELS[value] }));

/**
 * Los únicos que un vendedor puede elegir a mano en el formulario de venta.
 * Alimenta el <Select> de "Tipo de Venta" en SaleBasicTab.
 */
export const MANUAL_SALE_TYPE_OPTIONS: SaleTypeOption[] = [
  { value: SALE_TYPES.VENTA_NUEVA, label: LABELS.venta_nueva },
  { value: SALE_TYPES.REINGRESO, label: LABELS.reingreso },
];

/**
 * Tipos que crea el sistema como venta-operación. Se excluyen de métricas
 * (pero NO de comisiones: ahí sí tienen que entrar).
 */
export const OPERATION_SALE_TYPES: SaleType[] = [
  SALE_TYPES.ALTA_ADHERENTE,
  SALE_TYPES.CAMBIO_PLAN,
];

export const isOperationSaleType = (value?: string | null): boolean =>
  !!value && (OPERATION_SALE_TYPES as string[]).includes(value);

/**
 * Etiqueta legible de un tipo de venta.
 *
 * Nunca devuelve `undefined`: si el valor no está en el catálogo (dato viejo o
 * escrito a mano en la base) se muestra crudo, que es mejor que una celda vacía.
 */
export const saleTypeLabel = (value?: string | null): string => {
  if (!value) return '';
  return LABELS[value as SaleType] ?? value;
};

/**
 * Plantilla que corresponde a cada venta-operación, por `templates.template_type`.
 *
 * Con las 3 plantillas nuevas del anexo la lista pasa a tener 12 entradas, y
 * todas las viejas son `template_type='contrato'`: el vendedor abre el selector
 * y no tiene forma de saber cuál es la que va con la operación que acaba de
 * crear. Esto sirve para SUGERIR (ordenar primero + badge), nunca para filtrar:
 * hay casos legítimos de adjuntar otra plantilla al anexo, como la DDJJ.
 *
 * `anexo_vigencia_inmediata` no está en el mapa a propósito: no depende del tipo
 * de venta sino de si la operación tiene vigencia inmediata, y eso se decide
 * caso por caso.
 */
export const TEMPLATE_TYPE_BY_SALE_TYPE: Partial<Record<SaleType, string>> = {
  [SALE_TYPES.ALTA_ADHERENTE]: 'anexo_incorporacion',
  [SALE_TYPES.CAMBIO_PLAN]: 'solicitud_cambio_plan',
};

/**
 * Contexto que afina la sugerencia. Todo opcional: sin él, la función se
 * comporta exactamente como antes.
 */
export interface TemplateSuggestionContext {
  /** El titular de la venta es una empresa (`clients.client_type='empresa'`). */
  isCompany?: boolean;
  /** La venta-operación es una BAJA de nómina, no un alta. */
  isTermination?: boolean;
}

/**
 * `undefined` para las ventas comerciales de persona física: ahí no hay nada
 * que sugerir, todas las plantillas son 'contrato'.
 *
 * Dos casos de empresa se resuelven acá y no con un `sale_type` nuevo:
 *
 *  · El CONTRATO de una venta a empresa es `venta_nueva`/`reingreso` como
 *    cualquier otra —no es una venta-operación— pero necesita la plantilla que
 *    sabe imprimir la nómina.
 *  · Una BAJA comparte `sale_type='alta_adherente'` con el alta a propósito
 *    (mismo anexo, misma serie ANX), así que el tipo por sí solo no alcanza
 *    para distinguirlas.
 */
export const recommendedTemplateType = (
  saleType?: string | null,
  ctx?: TemplateSuggestionContext,
): string | undefined => {
  if (isOperationSaleType(saleType)) {
    if (saleType === SALE_TYPES.ALTA_ADHERENTE && (ctx?.isTermination || ctx?.isCompany)) {
      return 'anexo_movimiento';
    }
    return TEMPLATE_TYPE_BY_SALE_TYPE[saleType as SaleType];
  }
  if (ctx?.isCompany) return 'contrato_empresa';
  return saleType ? TEMPLATE_TYPE_BY_SALE_TYPE[saleType as SaleType] : undefined;
};

/**
 * Código de "Movimiento" (columna M) de la planilla de liquidación de comisiones.
 * Es sólo presentación: no se guarda en ninguna tabla.
 */
const REPORT_MOVEMENT_CODES: Record<SaleType, string> = {
  venta_nueva: 'V',
  reingreso: 'RI',
  alta_adherente: 'INC',
  cambio_plan: 'CP',
};

/** `sale_type` → código M del reporte. Valor desconocido o vacío → cadena vacía (nunca inventa uno). */
export const saleTypeReportCode = (value?: string | null): string =>
  value ? REPORT_MOVEMENT_CODES[value as SaleType] ?? '' : '';
