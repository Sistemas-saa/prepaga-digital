import { guaraniesInWords } from "./number-to-spanish.ts";

export interface CommissionPeriodPdf {
  liquidation_number: string;
  period_start: string;
  period_end: string;
  concept: string;
  total_amount: number;
  currency_code: string;
  salesperson_name: string;
}

/**
 * Etiquetas de `sales.sale_type`.
 *
 * Esto es una edge function de Deno: NO puede importar de `src/`, así que el
 * mapa se duplica acá a propósito. DEBE mantenerse alineado con
 * `src/lib/saleTypes.ts` (fuente de verdad del catálogo en el front).
 */
const SALE_TYPE_LABELS: Record<string, string> = {
  venta_nueva: "Venta Nueva",
  reingreso: "Reingreso",
  alta_adherente: "Incorporación de Adherente",
  cambio_plan: "Cambio de Plan",
};

/** Nunca devuelve vacío por un valor desconocido: muestra el código crudo. */
export function saleTypeLabel(value?: string | null): string {
  if (!value) return "";
  return SALE_TYPE_LABELS[value] ?? value;
}

export interface CommissionItemPdf {
  item_number: number;
  group_type: string;
  sale_type: string | null;
  sale_date: string;
  commission_amount: number;
  client_display_id: string | null;
  client_sequence: number | null;
  client_name: string;
  plan_name: string;
  percent: number | null;
  concept: string;
}

export interface CommissionBrandingPdf {
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  header_data_uri: string | null;
  footer_data_uri: string | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function formatNumber(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString("es-PY");
}

export function buildCommissionHtml(
  period: CommissionPeriodPdf,
  items: CommissionItemPdf[],
  branding: CommissionBrandingPdf,
): string {
  const itemRows = items.map((item) => `
    <tr>
      <td>${item.item_number}</td>
      <td>${escapeHtml(item.group_type)}</td>
      <td>${escapeHtml(saleTypeLabel(item.sale_type))}</td>
      <td>${formatDateOnly(item.sale_date)}</td>
      <td class="amount">${formatNumber(item.commission_amount)}</td>
      <td>${escapeHtml(item.client_display_id ?? "")}</td>
      <td>${item.client_sequence ?? ""}</td>
      <td>${escapeHtml(item.client_name)}</td>
      <td>${escapeHtml(item.plan_name)}</td>
      <td class="amount">${item.percent == null ? "—" : escapeHtml(item.percent)}</td>
      <td>${escapeHtml(item.concept)}</td>
    </tr>`).join("");

  const header = branding.header_data_uri
    ? `<img src="${branding.header_data_uri}" alt="Encabezado" />`
    : `<div class="company-fallback">${escapeHtml(branding.company_name)}</div>`;
  const footer = branding.footer_data_uri
    ? `<img src="${branding.footer_data_uri}" alt="Zócalo" />`
    : `<div class="footer-fallback">${escapeHtml(branding.company_address ?? "")} ${escapeHtml(branding.company_phone ?? "")}</div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 9px; }
  .print-shell { width: 100%; border-collapse: collapse; }
  .print-shell > thead { display: table-header-group; }
  .print-shell > tfoot { display: table-footer-group; }
  .brand-cell { border: 0; padding: 0 10mm; height: 22mm; text-align: center; }
  .brand-cell img { display: block; max-width: 100%; max-height: 21mm; margin: 0 auto; object-fit: contain; }
  .brand-footer { height: 17mm; }
  .brand-footer img { max-height: 16mm; }
  .company-fallback { font-size: 18px; font-weight: 700; padding-top: 7mm; }
  .footer-fallback { font-size: 8px; color: #4b5563; }
  .content-cell { border: 0; padding: 3mm 10mm; vertical-align: top; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 14px; margin-bottom: 4mm; }
  .meta strong { display: block; color: #374151; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items thead { display: table-header-group; }
  .items tr { break-inside: avoid; page-break-inside: avoid; }
  .items th, .items td { border: 1px solid #9ca3af; padding: 4px; overflow-wrap: anywhere; }
  .items th { background: #e5e7eb; text-align: left; font-size: 8px; }
  .items th:nth-child(1) { width: 4%; } .items th:nth-child(2) { width: 7%; }
  .items th:nth-child(3) { width: 10%; } .items th:nth-child(4) { width: 7%; }
  .items th:nth-child(5) { width: 9%; } .items th:nth-child(6) { width: 8%; }
  .items th:nth-child(7) { width: 4%; } .items th:nth-child(8) { width: 18%; }
  .items th:nth-child(9) { width: 12%; } .items th:nth-child(10) { width: 5%; }
  .items th:nth-child(11) { width: 12%; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 4mm; margin-left: auto; width: 52%; border-collapse: collapse; }
  .totals td { border: 1px solid #9ca3af; padding: 6px; }
  .words { margin-top: 3mm; font-weight: 700; text-align: right; }
</style></head><body>
<table class="print-shell">
  <thead><tr><td class="brand-cell">${header}</td></tr></thead>
  <tfoot><tr><td class="brand-cell brand-footer">${footer}</td></tr></tfoot>
  <tbody><tr><td class="content-cell">
    <div class="meta">
      <div><strong>Promotor</strong>${escapeHtml(period.salesperson_name)}</div>
      <div><strong>N° Liquidación</strong>${escapeHtml(period.liquidation_number)}</div>
      <div><strong>Período</strong>${formatDateOnly(period.period_start)} al ${formatDateOnly(period.period_end)}</div>
      <div><strong>Concepto</strong>${escapeHtml(period.concept)}</div>
      <div><strong>Empresa</strong>${escapeHtml(branding.company_name)}</div>
    </div>
    <table class="items"><thead><tr>
      <th>Item</th><th>Tipo</th><th>Tipo Venta</th><th>Fecha</th><th>Monto Comisión</th><th>Id Cliente</th>
      <th>Sec</th><th>Cliente</th><th>Plan</th><th>%</th><th>Concepto</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <table class="totals"><tr><td>Total x Concepto</td><td class="amount">${escapeHtml(period.currency_code)} ${formatNumber(period.total_amount)}</td></tr></table>
    <div class="words">${guaraniesInWords(period.total_amount)}</div>
  </td></tr></tbody>
</table></body></html>`;
}
