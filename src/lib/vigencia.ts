import { differenceInCalendarDays, differenceInMonths } from "date-fns";
import { normalizeDateInputValue } from "@/lib/dateOnly";

// ─────────────────────────────────────────────────────────────────────────────
// Vigencia del contrato
// ─────────────────────────────────────────────────────────────────────────────
// Unica fuente de verdad del calculo de vigencia en el front. La lista de
// ventas, el badge y cualquier pantalla futura leen de aca, para que no puedan
// discrepar entre si — el mismo motivo por el que `recalculate_sale_total_amount`
// es la unica formula del total.
//
// El umbral de "por vencer" es 30 dias, el mismo default de la funcion
// `notify_expiring_sales()` de la base: la pantalla y la campanita tienen que
// decir lo mismo el mismo dia.
//
// Ojo con las fechas: `contract_end_date` es un `date` de Postgres (date-only).
// Parsearlo con `new Date("2027-04-14")` lo interpreta como medianoche UTC y en
// Paraguay (UTC-4) retrocede un dia — el bug conocido #1. Por eso se parte el
// string y se construye la fecha con componentes locales.

export const DIAS_POR_VENCER = 30;

export type EstadoVigencia = "sin_definir" | "vigente" | "por_vencer" | "vencido";

export interface Vigencia {
  estado: EstadoVigencia;
  endDate: string | null;
  diasRestantes: number | null;
  mesesRestantes: number | null;
  label: string;
}

/** Venta minima que necesita el calculo (compatible con la fila de `sales`). */
export interface SaleVigenciaInput {
  status?: string | null;
  contract_end_date?: string | null;
  all_signatures_completed?: boolean | null;
}

const ESTADOS_CON_VIGENCIA = ["firmado", "completado"];

const SIN_VIGENCIA: Vigencia = {
  estado: "sin_definir",
  endDate: null,
  diasRestantes: null,
  mesesRestantes: null,
  label: "",
};

/**
 * Convierte un `date` de Postgres en un Date local a medianoche.
 * Devuelve null si el valor no es una fecha utilizable.
 */
export const parseDateOnly = (value?: string | null): Date | null => {
  const normalized = normalizeDateInputValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Suma meses a una fecha date-only y la devuelve como `YYYY-MM-DD`. */
export const addMonthsToDateOnly = (value: string, months: number): string => {
  const date = parseDateOnly(value);
  if (!date) return "";

  const target = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
  // Si el dia no existe en el mes destino (31 de marzo + 1 mes), Date rebalsa al
  // mes siguiente; retroceder al ultimo dia del mes esperado.
  if (target.getDate() !== date.getDate()) target.setDate(0);

  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
};

const plural = (n: number, singular: string, plural_: string) =>
  `${n} ${n === 1 ? singular : plural_}`;

const restantes = (n: number, singular: string, plural_: string) =>
  `${plural(n, singular, plural_)} ${n === 1 ? "restante" : "restantes"}`;

export const getVigencia = (
  sale: SaleVigenciaInput | null | undefined,
  hoy: Date = new Date(),
): Vigencia => {
  if (!sale) return SIN_VIGENCIA;

  // Mismo criterio que la lista para decidir si un contrato esta cerrado:
  // `all_signatures_completed` gana sobre el status, que puede ir atrasado.
  const status = sale.all_signatures_completed ? "completado" : sale.status || "borrador";
  if (!ESTADOS_CON_VIGENCIA.includes(status)) return SIN_VIGENCIA;

  const endDate = parseDateOnly(sale.contract_end_date);
  if (!endDate) return SIN_VIGENCIA;

  const referencia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diasRestantes = differenceInCalendarDays(endDate, referencia);
  // `differenceInMonths` cuenta meses COMPLETOS, no cambios de calendario. Con
  // `differenceInCalendarMonths`, un contrato vencido ayer (31/08 mirado el
  // 01/09) daba "hace 1 mes", y uno que vence en 32 dias daba "2 meses".
  const mesesRestantes = differenceInMonths(endDate, referencia);
  const normalizedEnd = normalizeDateInputValue(sale.contract_end_date);

  if (diasRestantes < 0) {
    const diasVencido = Math.abs(diasRestantes);
    const mesesVencido = Math.abs(mesesRestantes);
    return {
      estado: "vencido",
      endDate: normalizedEnd,
      diasRestantes,
      mesesRestantes,
      label:
        mesesVencido >= 1
          ? `Vencio hace ${plural(mesesVencido, "mes", "meses")}`
          : `Vencio hace ${plural(diasVencido, "dia", "dias")}`,
    };
  }

  if (diasRestantes <= DIAS_POR_VENCER) {
    return {
      estado: "por_vencer",
      endDate: normalizedEnd,
      diasRestantes,
      mesesRestantes,
      label:
        diasRestantes === 0 ? "Vence hoy" : `Vence en ${plural(diasRestantes, "dia", "dias")}`,
    };
  }

  return {
    estado: "vigente",
    endDate: normalizedEnd,
    diasRestantes,
    mesesRestantes,
    label:
      mesesRestantes >= 1
        ? restantes(mesesRestantes, "mes", "meses")
        : restantes(diasRestantes, "dia", "dias"),
  };
};

export const VIGENCIA_LABELS: Record<EstadoVigencia, string> = {
  sin_definir: "—",
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
};
