/**
 * Filtros compartidos sobre la tabla `sales`.
 */

/**
 * sale_type de las VENTAS-OPERACIÓN creadas por una Incorporación de Adherente
 * ("Anexo de Incorporación"). No son ventas comerciales nuevas: son la
 * operación que permite firmar el anexo y liquidar su comisión por separado.
 */
export const SALE_TYPE_INCORPORACION = 'alta_adherente';

/**
 * sale_type de las VENTAS-OPERACIÓN creadas por un Cambio de Plan
 * ("Formulario de Solicitud de Cambio"). Mismo modelo que la incorporación:
 * es la operación que permite firmar el formulario y liquidar su comisión
 * aparte, sin tocar el contrato madre hasta que queda firmada.
 */
export const SALE_TYPE_CAMBIO_PLAN = 'cambio_plan';

/** Todos los sale_type que son operaciones sobre un contrato ya firmado. */
const OPERATION_SALE_TYPES = [SALE_TYPE_INCORPORACION, SALE_TYPE_CAMBIO_PLAN];

/**
 * Excluye las ventas-operación de listados, dashboards, reportes y métricas.
 *
 * Sin esto, cada incorporación de adherente o cambio de plan contaría como una
 * "venta" más e inflaría los totales del mes, que es un dato que el negocio mira.
 *
 * En COMISIONES no se aplica: ahí las ventas-operación SÍ deben entrar, que es
 * justamente el motivo por el que existen.
 *
 * Se usa `.or(...)` en vez de `.neq(...)` porque en SQL `NULL <> 'x'` no es
 * verdadero: un `.neq()` pelado dejaría afuera también las ventas que tengan
 * `sale_type` sin cargar.
 *
 * OJO con la forma del filtro al haber MÁS DE UN tipo: los `neq` van dentro de
 * un `and(...)` anidado, NO sueltos en el `or(...)`. Sueltos, una venta
 * 'alta_adherente' pasaría igual porque cumple `sale_type.neq.cambio_plan`, y
 * viceversa: el filtro no excluiría nada. Queda entonces
 *   sale_type IS NULL OR (sale_type <> 'alta_adherente' AND sale_type <> 'cambio_plan')
 */
export const excludeOperationSales = (query: any) =>
  query.or(
    `sale_type.is.null,and(${OPERATION_SALE_TYPES.map((t) => `sale_type.neq.${t}`).join(',')})`,
  );

/**
 * Alias histórico de `excludeOperationSales`, para no tocar los call sites que
 * ya existen. Excluye TODAS las ventas-operación, no solo las incorporaciones.
 */
export const excludeIncorporationSales = excludeOperationSales;

/** Template de campos personalizados del adicional Plan Materno. */
export const PLAN_MATERNO_TEMPLATE = 'Plan Materno';

/**
 * Qué template de "Campos del Plan" corresponde a una venta.
 *
 * El Plan Materno NO es un plan por sí mismo: va siempre ligado a otro plan y
 * se marca con el adicional `maternity_bonus` al inicio de la venta. Por eso el
 * adicional tiene PRIORIDAD sobre el plan elegido: sus campos se habilitan sea
 * cual sea el plan contratado.
 *
 * Sin adicional se cae al comportamiento anterior: buscar un template homónimo
 * del plan.
 */
export const resolvePlanFieldsTemplateName = (
  sale: { maternity_bonus?: boolean | null } | null | undefined,
  planName?: string | null,
): string | null => {
  if (sale?.maternity_bonus) return PLAN_MATERNO_TEMPLATE;
  return planName?.trim() || null;
};
