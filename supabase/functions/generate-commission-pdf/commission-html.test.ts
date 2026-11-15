import { assert, assertEquals, assertStringIncludes, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCommissionHtml, escapeHtml, formatDateOnly, saleTypeLabel } from "./commission-html.ts";
import { guaraniesInWords } from "./number-to-spanish.ts";

Deno.test("escapes untrusted database values", () => {
  assertEquals(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

Deno.test("formats date-only without timezone conversion", () => {
  assertEquals(formatDateOnly("1981-05-09"), "09/05/1981");
  assertEquals(formatDateOnly("invalid"), "");
});

Deno.test("converts guaranies to Spanish words", () => {
  assertEquals(guaraniesInWords(0), "CERO GUARANÍES");
  assertEquals(guaraniesInWords(21), "VEINTIÚN GUARANÍES");
  assertEquals(guaraniesInWords(1_000_000), "UN MILLÓN DE GUARANÍES");
  assertThrows(() => guaraniesInWords(-1), RangeError);
});

Deno.test("builds multipage-safe HTML with repeated branding shell", () => {
  const items = Array.from({ length: 70 }, (_, index) => ({
    item_number: index + 1,
    group_type: "INDIVIDUAL",
    sale_type: index === 1 ? "alta_adherente" : "venta_nueva",
    sale_date: "2026-08-04",
    commission_amount: 12345,
    client_display_id: `C-${index + 1}`,
    client_sequence: index + 1,
    client_name: index === 0 ? "Cliente <riesgoso>" : `Cliente ${index + 1}`,
    plan_name: "Plan Alfa",
    percent: 30,
    concept: "COMISION",
  }));
  const html = buildCommissionHtml({
    liquidation_number: "LIQ-000001",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    concept: "COMISION VENTA PRE-PAGA",
    total_amount: 864150,
    currency_code: "PYG",
    salesperson_name: "Vendedor Test",
  }, items, {
    company_name: "SAMAP Test",
    company_address: null,
    company_phone: null,
    header_data_uri: "data:image/png;base64,AA==",
    footer_data_uri: "data:image/png;base64,AA==",
  });
  assertStringIncludes(html, "<thead>");
  assertStringIncludes(html, "<tfoot>");
  assertStringIncludes(html, "margin: 0");
  assert(!html.includes("position: fixed"));
  assert(!html.includes("Cliente <riesgoso>"));
  assertStringIncludes(html, "Cliente &lt;riesgoso&gt;");
  assertEquals((html.match(/<tr>/g) ?? []).length >= 70, true);
  // La columna nueva "Tipo Venta" convive con la de group_type (INDIVIDUAL/GRUPAL).
  assertStringIncludes(html, "<th>Tipo</th><th>Tipo Venta</th>");
  assertStringIncludes(html, "<td>INDIVIDUAL</td>");
  assertStringIncludes(html, "<td>Venta Nueva</td>");
  assertStringIncludes(html, "<td>Incorporación de Adherente</td>");
});

Deno.test("etiqueta los tipos de venta y tolera valores desconocidos o nulos", () => {
  assertEquals(saleTypeLabel("cambio_plan"), "Cambio de Plan");
  assertEquals(saleTypeLabel("reingreso"), "Reingreso");
  assertEquals(saleTypeLabel("tipo_viejo"), "tipo_viejo");
  assertEquals(saleTypeLabel(null), "");
  assertEquals(saleTypeLabel(undefined), "");
});
