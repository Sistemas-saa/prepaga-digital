import { readFileSync } from 'fs';
import { createEnhancedTemplateContext, interpolateEnhancedTemplate } from '@/lib/enhancedTemplateEngine';

// ── Datos realistas (mismos para el motor viejo y el nuevo) ──────────────────
const client = {
  first_name: 'RIKA', last_name: 'HIRANO', dni: '3616083',
  email: 'rika@example.com', phone: '984800303',
  address: 'Petirossi 380', barrio: 'Villa Morra', city: 'Asunción',
  province: 'Central', birth_date: '1981-05-09', gender: 'Femenino',
  external_id: 'SAMAP-00123',
};
const plan = { name: 'Plan Materno', price: 310000, description: 'Cobertura materna' };
const company = { name: 'SAMAP', email: 'admin@samap.com.py', phone: '021 2196700' };
const sale = {
  id: 'op-1', total_amount: 450000, titular_amount: 0,
  contract_number: 'ANX-2026-000001', sale_type: 'alta_adherente',
  immediate_coverage: true, sale_date: '2026-08-13',
  group_monthly_total: 1250000,
};
const beneficiaries = [
  {
    first_name: 'JUAN', last_name: 'PEREZ', document_number: '1234567',
    birth_date: '2015-03-10', relationship: 'hijo', amount: 150000,
    phone: '981111111', address: 'Boquerón 123', barrio: 'Recoleta',
    gender: 'Masculino', entry_date: '2026-08-01', immediate_coverage: true,
  },
  {
    first_name: 'MARIA', last_name: 'GOMEZ', document_number: '7654321',
    birth_date: '1990-11-22', relationship: 'conyuge', amount: 300000,
    phone: '982222222', address: 'Mcal López 900', barrio: 'Carmelitas',
    gender: 'Femenino', entry_date: '2026-08-01', immediate_coverage: null,
  },
];

// Venta NORMAL: es la que hay que usar para probar regresión, porque es el
// 99,9% de los casos reales. La de incorporación se usa solo para el anexo.
const ventaNormal = { ...sale, sale_type: 'venta_nueva', contract_number: '2026-000114' };

const ctx = createEnhancedTemplateContext(
  client, plan, company, ventaNormal, beneficiaries, undefined, {}, {}
);
const ctxAnexo = createEnhancedTemplateContext(
  client, plan, company, sale, beneficiaries, undefined, {}, {}
);

// ── Plantillas que ejercitan los caminos tocados ────────────────────────────
const templates: Record<string, string> = {
  // A. Fila <tr> con placeholders YA existentes → NO debe cambiar
  legacy_tr:
    '<table><tbody><tr><td>{{nombre}}</td><td>{{dni}}</td><td>{{edad}}</td>' +
    '<td>{{parentesco}}</td><td>{{montoFormateado}}</td></tr></tbody></table>',

  // B. Loop explícito con placeholders existentes → NO debe cambiar
  legacy_loop:
    '<ul>{{#beneficiarios}}<li>{{indice}} - {{nombreCompleto}} ({{dni}})</li>{{/beneficiarios}}</ul>',

  // C. Placeholders globales existentes → NO deben cambiar
  legacy_globals:
    '<p>{{titular_nombre}} | {{titular_ci}} | {{monto_total}} | {{plan.nombre}} | ' +
    '{{vigencia_inmediata}} | {{numero_contrato}}</p>',

  // D. Fila con {{phone}} (ya estaba en la whitelist) → NO debe cambiar
  legacy_tr_phone:
    '<table><tbody><tr><td>{{nombre}}</td><td>{{phone}}</td></tr></tbody></table>',

  // E. Fila SOLO con {{address}}: antes NO auto-expandía (estaba en los alias
  //    pero no en la whitelist). Ahora sí. Diferencia INTENCIONAL y verificada
  //    contra las 9 plantillas activas de producción: ninguna la usa.
  cambio_intencional_address:
    '<table><tbody><tr><td>{{address}}</td></tr></tbody></table>',
};

const out: Record<string, string> = {};
for (const [k, v] of Object.entries(templates)) {
  out[k] = interpolateEnhancedTemplate(v, ctx);
}

// F. La plantilla real del Anexo (solo la corre el motor nuevo)
const anexoPath = process.env.ANEXO_PATH;
if (anexoPath) {
  try {
    out.anexo = interpolateEnhancedTemplate(readFileSync(anexoPath, 'utf8'), ctxAnexo);
  } catch (e: any) {
    out.anexo = `ERROR: ${e.message}`;
  }
}

process.stdout.write(JSON.stringify(out, null, 2));
