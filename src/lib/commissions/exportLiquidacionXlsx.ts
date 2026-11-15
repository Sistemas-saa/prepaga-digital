import type { Alignment, Borders, Cell, Fill, Font, Workbook, Worksheet } from 'exceljs';
import type {
  CommissionAdjustment,
  CommissionExportRow,
  CommissionPeriod,
} from '@/types/commissions';
import { saleTypeReportCode } from '@/lib/saleTypes';

/**
 * Exporta una o varias liquidaciones con el diseño de la planilla original
 * "Comisiones <mes>.xlsx": una hoja por liquidación (bandas negra y gris
 * arriba, tabla, subtotal, franja negra y el pie con TOTAL A COBRAR debajo) y
 * un Resumen con las columnas de siempre.
 *
 * EL DISEÑO ES EL MISMO que genera scripts/comisiones/build_plantilla_liquidacion.py.
 * Si se cambia acá hay que cambiarlo allá y viceversa. Lo único que difiere es
 * cómo el Resumen llega a cada hoja: acá apunta DIRECTO a la celda (el generador
 * sabe dónde cayó cada total) y la plantilla, como el usuario le agrega filas y
 * vendedores, usa nombres de ámbito hoja + INDIRECT.
 *
 * El Resumen de la planilla original tenía las referencias corridas (#REF!, la
 * comisión de un vendedor leída de la franja negra). Por eso acá ninguna celda
 * del Resumen se arma a mano, y la fila "Prueba" suma los TOTAL A COBRAR de las
 * hojas para contrastarlos con la columna Total.
 *
 * Lo liquidado es un dato contable inmutable, así que las FILAS llevan los
 * valores del snapshot (nunca se recalculan con parámetros de hoy). Lo que sí es
 * fórmula: los subtotales, el pie y el Resumen.
 */

const FMT_GS = '#,##0';
const FMT_DATE = 'dd/mm/yyyy';
const FMT_MONTH = 'mmmm\\-yy'; // "junio-26", como la planilla original
const FMT_BASE = '"base "#,##0'; // base de la bonificación: sigue siendo un número para la fórmula del pie

const ARGB = {
  black: 'FF000000',
  gray: 'FFC0C0C0',
  green: 'FF92D050',
  totalGreen: 'FF99CC00',
  white: 'FFFFFFFF',
  alert: 'FFFFB3B3',
};

const SHEET_TITLE = 'PLANILLA DE LIQUIDACION DE COMISIONES - VENTAS';
const RESUMEN_TITLE = 'PLANILLA DE LIQUIDACION DE COMISIONES - VENTAS -   R  E  S  U  M  E  N';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

type Col = 'rec' | 'fec' | 'nombre' | 'plan' | 'm' | 'cto' | 'vidas' | 'total' | 'gadm' | 'cuota'
  | 'cuotaIva' | 'pct' | 'comision' | 'adicional' | 'obs';

const COLUMNS: Array<{ key: Col; header: string; width: number; numFmt?: string; align?: Alignment['horizontal'] }> = [
  { key: 'rec', header: 'Rec N°', width: 8 },
  { key: 'fec', header: 'Fec', width: 10, numFmt: FMT_DATE, align: 'center' },
  { key: 'nombre', header: 'Nombre', width: 30 },
  { key: 'plan', header: 'Plan', width: 6, align: 'center' },
  { key: 'm', header: 'M', width: 5, align: 'center' },
  { key: 'cto', header: 'Cto N°', width: 12, align: 'center' },
  { key: 'vidas', header: 'Vidas', width: 6, numFmt: '0', align: 'center' },
  { key: 'total', header: 'Total', width: 11, numFmt: FMT_GS },
  { key: 'gadm', header: 'G Adm', width: 9, numFmt: FMT_GS },
  { key: 'cuota', header: 'Cuota', width: 11, numFmt: FMT_GS },
  { key: 'cuotaIva', header: 'Cuota - IVA', width: 12, numFmt: FMT_GS },
  { key: 'pct', header: '%', width: 7 },
  { key: 'comision', header: 'Comision', width: 12, numFmt: FMT_GS },
  { key: 'adicional', header: 'Adicional', width: 10, numFmt: FMT_GS },
  { key: 'obs', header: 'Obs', width: 30 },
];
const LAST_COL = COLUMNS.length;
const colIndex = (key: Col) => COLUMNS.findIndex((c) => c.key === key) + 1;
const letter = (index: number): string => {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};
const L = (key: Col) => letter(colIndex(key));

/** Columnas que suma el subtotal de cada sección (y la franja negra cuando hay dos). */
const SUM_COLS: Col[] = ['vidas', 'total', 'gadm', 'cuota', 'cuotaIva', 'comision'];
/** Celdas del pie: etiqueta, % de la bonificación, valor y base de la bonificación. */
const PIE = { label: 'cuotaIva', pct: 'pct', value: 'comision', base: 'obs' } as const;

const BASE_LABEL: Record<string, string> = {
  plan_price: 'precio del plan',
  sale_total_amount: 'total de la venta',
  per_adherent: 'por adherente',
  net_of_fee_and_tax: 'neta de gasto adm. e IVA',
};

const THIN: Partial<Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const arial = (size: number, extra: Partial<Font> = {}): Partial<Font> => ({ name: 'Arial', size, ...extra });
const WHITE_BOLD = (size: number) => arial(size, { bold: true, color: { argb: ARGB.white } });

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const orNull = (value: unknown): number | null => (value == null || value === '' ? null : toNumber(value));
const money = (value: number) => value.toLocaleString('es-PY');
const pctFormat = (fraction: number) => (Number.isInteger(Math.round(fraction * 1e8) / 1e6) ? '0%' : '0.00%');

/** `YYYY-MM-DD` → fecha a medianoche UTC. Nunca `new Date(str)`: en UTC-4 retrocede un día (bug conocido #1). */
const parseDateOnly = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

const formatDateOnlyEs = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

/** Si `start`–`end` es un mes calendario completo, devuelve ese mes. */
function fullMonthOf(start: string, end: string): { year: number; month: number } | null {
  const [ys, ms, ds] = start.slice(0, 10).split('-').map(Number);
  const [ye, me, de] = end.slice(0, 10).split('-').map(Number);
  if (!ys || !ms || ds !== 1 || ys !== ye || ms !== me) return null;
  const lastDay = new Date(Date.UTC(ys, ms, 0)).getUTCDate();
  return de === lastDay ? { year: ys, month: ms } : null;
}

const monthName = (start: string): string => {
  const month = Number(start.slice(5, 7));
  return month >= 1 && month <= 12 ? MESES[month - 1] : '';
};

/**
 * Un Cto N° numérico se escribe como número, para que Excel no lo marque como
 * "número guardado como texto". Con ceros adelante o 12+ dígitos queda texto:
 * como número perdería los ceros o se vería en notación científica.
 */
const contractCell = (value: string | null): string | number | null => {
  if (!value) return null;
  return /^[1-9]\d{0,10}$/.test(value) ? Number(value) : value;
};

type Value = string | number | Date | null;
type FormulaValue = { formula: string; result: number };

interface CellStyle {
  font?: Partial<Font>;
  fill?: Fill;
  numFmt?: string;
  align?: Partial<Alignment>;
  border?: boolean;
}

function put(cell: Cell, value: Value | FormulaValue | undefined, style: CellStyle = {}): Cell {
  if (value !== undefined) cell.value = value;
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.numFmt) cell.numFmt = style.numFmt;
  if (style.align) cell.alignment = style.align;
  if (style.border) cell.border = THIN;
  return cell;
}

/** Pinta la fila entera (A..O) de un color, con borde, como las bandas de la planilla original. */
function band(ws: Worksheet, row: number, argb: string, font: Partial<Font>, lastCol = LAST_COL) {
  for (let c = 1; c <= lastCol; c += 1) put(ws.getCell(row, c), undefined, { fill: solid(argb), font, border: true });
}

const formula = (expression: string, result: number): FormulaValue => ({ formula: expression, result });

// ---------------------------------------------------------------------------
// Ajustes del período
// ---------------------------------------------------------------------------

export interface Bonificacion {
  /** % en unidades (15 = 15 %); null si es de monto fijo. */
  percent: number | null;
  base: number | null;
  amount: number;
  /** base × % da exactamente el monto: el pie puede llevar la fórmula `base × %`. */
  exact: boolean;
}

export interface PeriodAdjustments {
  viatico: number;
  viaticoNotes: string[];
  recupero: number;
  recuperos: Array<{ notes: string | null; amount: number }>;
  bonificaciones: Bonificacion[];
  /** Líneas positivas sueltas del pie (AJUSTE VALE, OTROS, adicionales del período). */
  otros: Array<{ label: string; amount: number }>;
  /** Montos en positivo: el pie los resta. */
  descuentos: Array<{ notes: string | null; amount: number }>;
  adicionalByItem: Map<string, number>;
}

/**
 * Reparte los ajustes del período entre las filas y las líneas del pie. La suma
 * `viático + recupero + Σ bonif + Σ otros + Σ adicional por fila − Σ descuentos`
 * coincide con `Σ sign × amount` de la vista `commission_period_payable`.
 *
 * Un `adicional` ligado a un ítem va a la columna Adicional de SU fila; si el
 * ítem no está en la hoja, va al pie como línea propia para que no se pierda.
 * Un ajuste ligado a un ítem de otro concepto se trata como del período.
 */
export function summarizeAdjustments(adjustments: CommissionAdjustment[], itemIds: ReadonlySet<string>): PeriodAdjustments {
  const out: PeriodAdjustments = {
    viatico: 0, viaticoNotes: [], recupero: 0, recuperos: [], bonificaciones: [], otros: [], descuentos: [],
    adicionalByItem: new Map(),
  };
  for (const adj of adjustments) {
    const amount = toNumber(adj.amount);
    const signed = adj.sign * amount;
    const notes = adj.notes?.trim() || null;
    switch (adj.concept) {
      case 'viatico':
        out.viatico += signed;
        if (notes) out.viaticoNotes.push(`${notes}: ${money(signed)}`);
        break;
      case 'recupero':
        out.recupero += signed;
        out.recuperos.push({ notes, amount: signed });
        break;
      case 'bonificacion': {
        const percent = adj.calc_mode === 'percent' && adj.percent != null ? toNumber(adj.percent) : null;
        const base = percent != null && adj.base_amount != null ? toNumber(adj.base_amount) : null;
        const exact = adj.sign === 1 && percent != null && base != null && Math.abs(base * percent / 100 - amount) < 1e-6;
        out.bonificaciones.push({ percent, base, amount: signed, exact });
        break;
      }
      case 'adicional':
        if (adj.item_id && itemIds.has(adj.item_id)) {
          out.adicionalByItem.set(adj.item_id, (out.adicionalByItem.get(adj.item_id) ?? 0) + signed);
        } else {
          out.otros.push({ label: notes || 'ADICIONAL EXTRA', amount: signed });
        }
        break;
      case 'descuento':
        out.descuentos.push({ notes, amount: -signed });
        break;
      default: // 'otro': el signo decide de qué lado del pie cae
        if (adj.sign === 1) out.otros.push({ label: notes || 'OTROS', amount });
        else out.descuentos.push({ notes, amount });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

type Group = 'INDIVIDUAL' | 'GRUPAL';

interface SheetRow {
  group: Group;
  values: Record<Col, Value>;
}

function buildRows(rows: CommissionExportRow[], adicionalByItem: Map<string, number>): SheetRow[] {
  return rows.map((r) => {
    const net = r.base_type === 'net_of_fee_and_tax';
    const gross = orNull(r.gross_amount);
    const fee = orNull(r.admin_fee);
    const obs: string[] = [];
    if (r.client_display_id) obs.push(r.client_display_id);
    if (!net && r.base_type) obs.push(`Base ${BASE_LABEL[r.base_type] ?? r.base_type}: ${money(toNumber(r.base_amount))}`);
    if (r.calc_mode === 'fixed') obs.push('Monto fijo');
    return {
      group: r.group_type === 'GRUPAL' ? 'GRUPAL' : 'INDIVIDUAL',
      values: {
        rec: null, // el sistema no registra el medio de cobro (TRANSF / CAJA)
        fec: parseDateOnly(r.sale_date),
        nombre: r.client_name,
        plan: r.report_code || r.plan_name,
        m: saleTypeReportCode(r.sale_type) || null,
        cto: contractCell(r.contract_number),
        vidas: orNull(r.lives),
        // Sólo valores del snapshot: sales.total_amount de hoy puede haber cambiado desde que se liquidó.
        total: gross ?? (r.base_type === 'sale_total_amount' ? orNull(r.base_amount) : null),
        gadm: fee || null, // la planilla deja en blanco el G Adm en 0 (filas CP)
        cuota: gross != null && fee != null ? gross - fee : null,
        cuotaIva: net ? toNumber(r.base_amount) : null,
        pct: r.calc_mode === 'fixed' || r.percent == null ? null : toNumber(r.percent) / 100,
        comision: toNumber(r.commission_amount),
        adicional: adicionalByItem.get(r.item_id) || null,
        obs: obs.join(' | ') || null,
      },
    };
  });
}

const sumOf = (rows: SheetRow[], key: Col) => rows.reduce((acc, r) => acc + toNumber(r.values[key]), 0);

// ---------------------------------------------------------------------------
// Hoja de cada liquidación
// ---------------------------------------------------------------------------

const stripAccents = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Excel no acepta un nombre de hoja que empiece o termine en apóstrofe: se limpia DESPUÉS de cortar a 28. */
const sheetNameOf = (raw: string) =>
  stripAccents(raw).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28).replace(/^[\s']+|[\s']+$/g, '') || 'Liquidacion';

/**
 * Nombres de hoja únicos sin distinguir mayúsculas, sin pisar "Resumen" y sin
 * "History", que exceljs reserva y rechaza.
 */
function uniqueSheetNames(periods: CommissionPeriod[]): string[] {
  const used = new Set<string>(['resumen', 'history']);
  return periods.map((period) => {
    const base = sheetNameOf(period.salesperson_name || period.liquidation_number);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 25)} (${n})`;
    used.add(name.toLowerCase());
    return name;
  });
}

interface Ref {
  cell: string;
  value: number;
}

type BonifKey = number | 'fijo';

interface SheetSummary {
  vidas: Ref;
  ventas: Ref;
  comision: Ref;
  viatico: Ref;
  bonif: Array<{ key: BonifKey; ref: Ref }>;
  /** RECUPERO + líneas sueltas + ADICIONAL: la columna "Otros" del Resumen. */
  otros: Ref[];
  descuentos: Ref;
  total: Ref;
}

const bonifKeyOf = (b: Bonificacion): BonifKey => (b.percent == null ? 'fijo' : Math.round(b.percent * 10000) / 10000);

function writeHeader(ws: Worksheet, row: number) {
  COLUMNS.forEach((c, j) => {
    put(ws.getCell(row, j + 1), c.header, {
      font: arial(11, { bold: true }),
      align: { horizontal: c.align ?? 'left', vertical: 'middle' },
      border: c.key !== 'obs',
    });
  });
}

function writeDataRow(ws: Worksheet, row: number, data: SheetRow | null) {
  COLUMNS.forEach((c, j) => {
    const value = data ? data.values[c.key] : null;
    const numFmt = c.key === 'pct' && typeof value === 'number' ? pctFormat(value) : c.numFmt;
    put(ws.getCell(row, j + 1), value, {
      font: arial(8),
      numFmt,
      align: c.key === 'obs' ? { wrapText: true, vertical: 'top' } : c.align ? { horizontal: c.align } : undefined,
      fill: data && c.key === 'cto' ? solid(ARGB.green) : undefined,
      border: c.key !== 'obs',
    });
  });
}

function buildPeriodSheet(
  wb: Workbook,
  sheetName: string,
  period: CommissionPeriod,
  rows: SheetRow[],
  adj: PeriodAdjustments,
): SheetSummary {
  const ws = wb.addWorksheet(sheetName);
  COLUMNS.forEach((c, j) => { ws.getColumn(j + 1).width = c.width; });

  // --- Bandas de arriba ----------------------------------------------------
  band(ws, 1, ARGB.black, WHITE_BOLD(10));
  ws.getCell(1, 1).value = SHEET_TITLE;
  band(ws, 2, ARGB.gray, arial(11));
  band(ws, 3, ARGB.gray, arial(11));
  put(ws.getCell('A2'), 'VENDEDOR', { font: arial(10, { bold: true }) });
  put(ws.getCell(2, colIndex('nombre')), period.salesperson_name, { font: arial(11, { bold: true }) });
  put(ws.getCell('A3'), 'PERIODO', { font: arial(10, { bold: true }) });
  const month = fullMonthOf(period.period_start, period.period_end);
  put(
    ws.getCell(3, colIndex('nombre')),
    month
      ? new Date(Date.UTC(month.year, month.month - 1, 1))
      : `${formatDateOnlyEs(period.period_start)} – ${formatDateOnlyEs(period.period_end)}`,
    { font: arial(11, { italic: true }), numFmt: month ? FMT_MONTH : undefined, align: { horizontal: 'left' } },
  );
  put(ws.getCell(3, colIndex(PIE.label)), 'Liquidación', { font: arial(10, { bold: true }) });
  put(ws.getCell(3, colIndex(PIE.value)), period.liquidation_number, { font: arial(10) });

  // --- Secciones: individuales y empresariales -------------------------------
  const individual = rows.filter((r) => r.group === 'INDIVIDUAL');
  const grupal = rows.filter((r) => r.group === 'GRUPAL');
  const sections: Array<{ label: string; rows: SheetRow[] }> = [];
  if (individual.length || !grupal.length) sections.push({ label: 'INDIVIDUALES / FAMILIARES', rows: individual });
  if (grupal.length) sections.push({ label: 'EMPRESARIALES', rows: grupal });
  const banded = grupal.length > 0; // la hoja de sólo individuales (Antonio) no lleva la banda de sección

  let r = 4;
  const ranges: Array<[number, number]> = [];
  const subtotalRows: number[] = [];
  for (const section of sections) {
    if (banded) {
      band(ws, r, ARGB.gray, arial(11));
      put(ws.getCell(r, colIndex('fec')), section.label, { font: arial(10, { bold: true }) });
      r += 1;
    }
    writeHeader(ws, r);
    r += 1;
    const first = r;
    for (const data of section.rows.length ? section.rows : [null]) {
      writeDataRow(ws, r, data);
      r += 1;
    }
    const last = r - 1;
    ranges.push([first, last]);
    for (let c = colIndex('vidas'); c <= colIndex('comision'); c += 1) {
      put(ws.getCell(r, c), undefined, { fill: solid(ARGB.gray), font: arial(11), border: true });
    }
    for (const key of SUM_COLS) {
      const def = COLUMNS[colIndex(key) - 1];
      put(ws.getCell(r, colIndex(key)), formula(`SUM(${L(key)}${first}:${L(key)}${last})`, sumOf(section.rows, key)), {
        font: arial(11, { bold: key === 'cuotaIva' || key === 'comision' }),
        numFmt: key === 'vidas' ? FMT_GS : def.numFmt,
        align: def.align ? { horizontal: def.align } : undefined,
      });
    }
    subtotalRows.push(r);
    r += 1;
  }

  r += 1; // fila en blanco antes de la franja negra
  const blackRow = r;
  band(ws, blackRow, ARGB.black, WHITE_BOLD(11));
  let totalsRow = subtotalRows[0];
  if (subtotalRows.length > 1) {
    for (const key of SUM_COLS) {
      const def = COLUMNS[colIndex(key) - 1];
      put(ws.getCell(blackRow, colIndex(key)), formula(
        subtotalRows.map((s) => `${L(key)}${s}`).join('+'),
        sumOf(rows, key),
      ), { numFmt: key === 'vidas' ? FMT_GS : def.numFmt, align: def.align ? { horizontal: def.align } : undefined });
    }
    totalsRow = blackRow;
  }

  // --- Pie: etiqueta en Cuota - IVA, valor en Comision ---------------------
  r = blackRow + 1;
  const pieLine = (label: string, value: number | FormulaValue | null, opts: { percent?: number | null; base?: number | null } = {}) => {
    const row = r;
    put(ws.getCell(row, colIndex(PIE.label)), label, { font: arial(8, { bold: true }), numFmt: FMT_GS, border: true });
    const pctCell = put(ws.getCell(row, colIndex(PIE.pct)), null, { font: arial(8), border: true });
    if (opts.percent != null) {
      pctCell.value = opts.percent / 100;
      pctCell.numFmt = pctFormat(opts.percent / 100);
    }
    put(ws.getCell(row, colIndex(PIE.value)), value, { font: arial(9), numFmt: FMT_GS, border: true });
    if (opts.base != null) {
      put(ws.getCell(row, colIndex(PIE.base)), opts.base, { font: arial(8), numFmt: FMT_BASE, align: { horizontal: 'left' } });
    }
    r += 1;
    return row;
  };
  const at = (row: number) => `${L(PIE.value)}${row}`;
  const ref = (row: number, value: number): Ref => ({ cell: at(row), value });

  const viaticoRow = pieLine('Viatico', adj.viatico);
  if (adj.viaticoNotes.length) ws.getCell(at(viaticoRow)).note = adj.viaticoNotes.join(' · ');
  const otros: Ref[] = [];
  if (adj.recupero !== 0) otros.push(ref(pieLine('RECUPERO', adj.recupero), adj.recupero));
  const bonif: SheetSummary['bonif'] = [];
  for (const b of adj.bonificaciones) {
    const row = r;
    const value = b.exact ? formula(`${L(PIE.base)}${row}*${L(PIE.pct)}${row}`, b.amount) : b.amount;
    pieLine('Bonificacion', value, { percent: b.percent, base: b.base });
    bonif.push({ key: bonifKeyOf(b), ref: ref(row, b.amount) });
  }
  for (const o of adj.otros) otros.push(ref(pieLine(o.label, o.amount), o.amount));
  const adicional = sumOf(rows, 'adicional');
  const adicionalRow = pieLine('ADICIONAL', formula(
    ranges.map(([a, b]) => `SUM(${L('adicional')}${a}:${L('adicional')}${b})`).join('+'),
    adicional,
  ));
  otros.push(ref(adicionalRow, adicional));
  const descuentos = adj.descuentos.reduce((acc, d) => acc + d.amount, 0);
  const descuentosRow = pieLine('Descuentos', descuentos || null);

  const comision = sumOf(rows, 'comision');
  const total = comision + adj.viatico
    + bonif.reduce((acc, b) => acc + b.ref.value, 0)
    + otros.reduce((acc, o) => acc + o.value, 0)
    - descuentos;
  const totalRow = r;
  const positives = [`${L('comision')}${totalsRow}`, at(viaticoRow), ...bonif.map((b) => b.ref.cell), ...otros.map((o) => o.cell)];
  pieLine('TOTAL A COBRAR', formula(`${positives.join('+')}-${at(descuentosRow)}`, total));
  for (const key of [PIE.label, PIE.pct, PIE.value] as const) {
    const cell = ws.getCell(totalRow, colIndex(key));
    cell.fill = solid(ARGB.gray);
    cell.font = arial(9, { bold: true });
  }

  // --- Detalle debajo del pie ----------------------------------------------
  r = totalRow + 4;
  const title = (text: string) => {
    put(ws.getCell(r, colIndex('nombre')), text, { font: arial(10, { bold: true }), fill: solid(ARGB.green) });
    r += 1;
  };
  const detail = (id: string | null, text: string) => {
    if (id) put(ws.getCell(r, colIndex('fec')), id, { font: arial(10) });
    put(ws.getCell(r, colIndex('nombre')), text, { font: arial(10) });
    r += 1;
  };
  if (adj.recuperos.length) {
    title('RECUPERO CUOTAS');
    for (const rec of adj.recuperos) detail(null, rec.notes || `Recupero: ${money(rec.amount)}`);
    r += 1;
  }
  const mes = monthName(period.period_start).toUpperCase();
  title(mes ? `DESCUENTOS ${mes}` : 'DESCUENTOS');
  if (!adj.descuentos.length) detail('ID:', 'sin descuento');
  for (const d of adj.descuentos) detail('ID:', `${d.notes || 'Descuento'}: ${money(d.amount)}`);

  return {
    vidas: { cell: `${L('vidas')}${totalsRow}`, value: sumOf(rows, 'vidas') },
    ventas: { cell: `${L('total')}${totalsRow}`, value: sumOf(rows, 'total') },
    comision: { cell: `${L('comision')}${totalsRow}`, value: comision },
    viatico: ref(viaticoRow, adj.viatico),
    bonif,
    otros,
    descuentos: ref(descuentosRow, descuentos),
    total: ref(totalRow, total),
  };
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

function buildResumenSheet(
  wb: Workbook,
  entries: Array<{ vendedor: string; sheet: string; summary: SheetSummary }>,
  periodLabel: string,
): Worksheet {
  const ws = wb.addWorksheet('Resumen');

  // Bonif 8 / 12 / 15 % como la planilla original. Un % distinto o una
  // bonificación de monto fijo agregan su columna: nunca se pierde plata.
  const found = entries.flatMap((e) => e.summary.bonif.map((b) => b.key));
  const extra = [...new Set(found.filter((k): k is number => typeof k === 'number' && ![8, 12, 15].includes(k)))]
    .sort((a, b) => a - b);
  const bonifKeys: BonifKey[] = [8, 12, 15, ...extra, ...(found.includes('fijo') ? ['fijo' as const] : [])];

  type Head = { label: string; width: number; value: (s: SheetSummary) => Ref[] | null };
  const heads: Head[] = [
    { label: 'VIDAS', width: 8, value: (s) => [s.vidas] },
    { label: 'Ventas total', width: 13, value: (s) => [s.ventas] },
    { label: 'Comision', width: 12, value: (s) => [s.comision] },
    ...bonifKeys.map((key): Head => ({
      label: key === 'fijo' ? 'Bonif' : `Bonif ${key.toLocaleString('es-PY')}%`,
      width: 11,
      value: (s) => s.bonif.filter((b) => b.key === key).map((b) => b.ref),
    })),
    { label: 'Viatico', width: 11, value: (s) => [s.viatico] },
    { label: 'Otros', width: 11, value: (s) => s.otros },
    { label: 'Descuentos', width: 13, value: (s) => [s.descuentos] },
  ];
  const totalCol = heads.length + 2; // A = Vendedor
  const descCol = totalCol - 1;
  const firstAmountCol = 4; // Comision
  const lastPositiveCol = descCol - 1; // Otros

  ws.mergeCells(1, 1, 1, totalCol);
  put(ws.getCell(1, 1), RESUMEN_TITLE, { fill: solid(ARGB.black), font: WHITE_BOLD(11), align: { horizontal: 'left' }, border: true });
  band(ws, 2, ARGB.gray, arial(11, { bold: true }), totalCol);
  ws.getCell(2, 1).value = periodLabel;

  const headerFont = arial(11, { bold: true });
  put(ws.getCell(3, 1), 'Vendedor', { font: headerFont, border: true });
  heads.forEach((h, j) => put(ws.getCell(3, j + 2), h.label, { font: headerFont, border: true }));
  put(ws.getCell(3, totalCol), 'Total', { font: headerFont, border: true });
  // Columna oculta: el TOTAL A COBRAR de cada hoja, para la fila "Prueba".
  const checkCol = totalCol + 1;
  put(ws.getCell(3, checkCol), 'TOTAL A COBRAR (hoja)', { font: headerFont });

  const first = 4;
  entries.forEach(({ vendedor, sheet, summary }, k) => {
    const row = first + k;
    put(ws.getCell(row, 1), vendedor, { font: arial(11), border: true });
    let positives = 0;
    heads.forEach((h, j) => {
      const refs = h.value(summary) ?? [];
      const result = refs.reduce((acc, x) => acc + x.value, 0);
      const col = j + 2;
      if (col >= firstAmountCol && col <= lastPositiveCol) positives += result;
      put(ws.getCell(row, col), refs.length
        ? formula(refs.map((x) => `${quoteSheet(sheet)}!${x.cell}`).join('+'), result)
        : 0, {
        font: arial(11),
        numFmt: FMT_GS,
        align: col === 2 ? { horizontal: 'center' } : undefined,
        border: true,
      });
    });
    const plus = Array.from({ length: lastPositiveCol - firstAmountCol + 1 }, (_, i) => `${letter(firstAmountCol + i)}${row}`);
    put(ws.getCell(row, totalCol), formula(
      `${plus.join('+')}-${letter(descCol)}${row}`,
      positives - summary.descuentos.value,
    ), { font: arial(11, { bold: true }), fill: solid(ARGB.totalGreen), numFmt: FMT_GS, border: true });
    put(ws.getCell(row, checkCol), formula(`${quoteSheet(sheet)}!${summary.total.cell}`, summary.total.value), {
      font: arial(11),
      numFmt: FMT_GS,
    });
  });

  if (entries.length) {
    const last = first + entries.length - 1;
    const tr = last + 1;
    for (let col = 2; col <= totalCol; col += 1) {
      const col0 = letter(col);
      const result = entries.reduce((acc, e) => {
        if (col === totalCol) return acc + e.summary.total.value;
        return acc + (heads[col - 2].value(e.summary) ?? []).reduce((a, x) => a + x.value, 0);
      }, 0);
      const isTotal = col === totalCol;
      put(ws.getCell(tr, col), formula(`SUM(${col0}${first}:${col0}${last})`, result), {
        font: isTotal ? WHITE_BOLD(11) : arial(11, { bold: true }),
        fill: solid(isTotal ? ARGB.black : ARGB.gray),
        numFmt: FMT_GS,
        align: col === 2 ? { horizontal: 'center' } : undefined,
        border: true,
      });
    }

    // "Prueba": los TOTAL A COBRAR de las hojas tienen que sumar lo mismo que la columna Total.
    // Suma la columna oculta y no una referencia por hoja: con cientos de liquidaciones
    // esa fórmula pasaría el límite de 8.192 caracteres de Excel.
    const pr = tr + 1;
    put(ws.getCell(pr, descCol), 'Prueba', { font: arial(11, { bold: true }) });
    const check = entries.reduce((acc, e) => acc + e.summary.total.value, 0);
    const checkLetter = letter(checkCol);
    put(ws.getCell(pr, totalCol), formula(`SUM(${checkLetter}${first}:${checkLetter}${last})`, check), {
      font: arial(11, { bold: true }),
      numFmt: FMT_GS,
    });
    const totalLetter = letter(totalCol);
    ws.addConditionalFormatting({
      ref: `${totalLetter}${pr}`,
      rules: [{
        type: 'expression',
        priority: 1,
        formulae: [`ABS(${totalLetter}${pr}-${totalLetter}${tr})>0.5`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: ARGB.alert } } },
      }],
    });
  }

  ws.getColumn(1).width = 22;
  heads.forEach((h, j) => { ws.getColumn(j + 2).width = h.width; });
  ws.getColumn(totalCol).width = 13;
  ws.getColumn(checkCol).hidden = true;
  return ws;
}

function resumenPeriodLabel(periods: CommissionPeriod[]): string {
  if (!periods.length) return 'PERIODO';
  const start = periods.map((p) => p.period_start).sort()[0];
  const end = periods.map((p) => p.period_end).sort()[periods.length - 1];
  const month = fullMonthOf(start, end);
  if (month) {
    const name = MESES[month.month - 1];
    return `PERIODO ${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.year}`;
  }
  return `PERIODO ${formatDateOnlyEs(start)} – ${formatDateOnlyEs(end)}`;
}

export interface LiquidacionExportInput {
  periods: CommissionPeriod[];
  rows: CommissionExportRow[];
  adjustments: CommissionAdjustment[];
}

export async function buildLiquidacionWorkbook({ periods, rows, adjustments }: LiquidacionExportInput): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAMAP Prepaga Digital';
  wb.created = new Date();

  const names = uniqueSheetNames(periods);
  const entries = periods.map((period, index) => {
    const periodRows = rows.filter((r) => r.period_id === period.id);
    const adj = summarizeAdjustments(
      adjustments.filter((a) => a.period_id === period.id),
      new Set(periodRows.map((r) => r.item_id)),
    );
    const summary = buildPeriodSheet(wb, names[index], period, buildRows(periodRows, adj.adicionalByItem), adj);
    return { vendedor: period.salesperson_name, sheet: names[index], summary };
  });

  buildResumenSheet(wb, entries, resumenPeriodLabel(periods));
  wb.calcProperties.fullCalcOnLoad = true;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function liquidacionFileName(periods: CommissionPeriod[]): string {
  if (periods.length === 1) {
    return `liquidacion-${periods[0].liquidation_number.replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`;
  }
  const starts = periods.map((p) => p.period_start).sort();
  const ends = periods.map((p) => p.period_end).sort();
  return `liquidaciones-${starts[0]}_${ends[ends.length - 1]}.xlsx`;
}
