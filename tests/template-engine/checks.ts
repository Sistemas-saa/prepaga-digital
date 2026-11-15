import { buildClientNamePayload, getClientDisplayName, getClientDocument, isCompanyClient } from '@/lib/clientUtils';
import { excludeIncorporationSales, excludeOperationSales, PLAN_MATERNO_TEMPLATE, resolvePlanFieldsTemplateName, SALE_TYPE_CAMBIO_PLAN, SALE_TYPE_INCORPORACION } from '@/lib/saleFilters';
import { createEnhancedTemplateContext, interpolateEnhancedTemplate } from '@/lib/enhancedTemplateEngine';
import { canMutateBeneficiaries, isSaleLocked } from '@/lib/saleUtils';
import {
  getRelationshipLabel,
  isPhoneRequired,
  isRelationshipRequired,
  validateBeneficiary,
  validateEmployee,
  validateEmployeeDependent,
} from '@/lib/beneficiaryValidation';
import { agruparNomina, aplanarNomina, estaActivo, tieneNomina } from '@/lib/nomina';

let ok = 0, fail = 0;
const check = (nombre: string, real: any, esperado: any) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  bien ? ok++ : fail++;
  console.log(`  ${bien ? 'OK  ' : 'FALLA'}  ${nombre}`);
  if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         obtenido: ${JSON.stringify(real)}`);
};

console.log('=== Empresas: espejo del nombre ===');
check('empresa escribe razón social en first_name',
  buildClientNamePayload({ client_type: 'empresa', razon_social: '  Frigorífico SA  ' }),
  { first_name: 'Frigorífico SA', last_name: '', razon_social: 'Frigorífico SA' });
check('persona no toca razon_social',
  buildClientNamePayload({ client_type: 'persona', first_name: ' Juan ', last_name: ' Perez ' }),
  { first_name: 'Juan', last_name: 'Perez', razon_social: null });
check('sin client_type se comporta como persona',
  buildClientNamePayload({ first_name: 'Ana', last_name: 'Lopez' }),
  { first_name: 'Ana', last_name: 'Lopez', razon_social: null });

console.log('\n=== Nombre a mostrar (código viejo sigue funcionando) ===');
const empresaGuardada = { client_type: 'empresa', ...buildClientNamePayload({ client_type: 'empresa', razon_social: 'Frigorífico SA' }), ruc: '80012345-6' };
check('helper nuevo', getClientDisplayName(empresaGuardada), 'Frigorífico SA');
check('código VIEJO (first_name + last_name)',
  `${empresaGuardada.first_name || ''} ${empresaGuardada.last_name || ''}`.trim(), 'Frigorífico SA');
check('documento de empresa = RUC', getClientDocument(empresaGuardada), '80012345-6');
check('documento de persona = C.I.', getClientDocument({ client_type: 'persona', dni: '3616083' }), '3616083');
check('isCompanyClient', [isCompanyClient(empresaGuardada), isCompanyClient({ client_type: 'persona' })], [true, false]);

console.log('\n=== Empresa: casos borde del documento ===');
check('empresa SIN ruc cargado -> vacío, no cae al dni',
  getClientDocument({ client_type: 'empresa', razon_social: 'Sin RUC SA', ruc: null, dni: '3616083' }), '');
check('empresa con ruc vacío -> vacío',
  getClientDocument({ client_type: 'empresa', ruc: '', dni: '3616083' }), '');
check('persona sin dni -> vacío',
  getClientDocument({ client_type: 'persona', dni: null }), '');
check('cliente nulo no explota',
  [getClientDocument(null), getClientDisplayName(null), isCompanyClient(null)], ['', '', false]);
check('razón social con espacios se recorta al mostrar',
  getClientDisplayName({ client_type: 'empresa', razon_social: '  Frigorífico SA  ' }), 'Frigorífico SA');

console.log('\n=== Campos con CHECK en la base: nunca cadena vacía ===');
// clients_gender_check y clients_marital_status_check aceptan NULL o un valor de
// la lista, pero NO ''. El formulario los inicializa en '' y para una empresa ni
// siquiera se muestran, así que hay que normalizarlos antes del INSERT.
// Esto replica la normalización de ClientForm.tsx (fix del error 23514).
const normalizarOpcional = (v?: string | null) => (v?.trim() ? v : null);
check('gender vacío -> null', normalizarOpcional(''), null);
check('gender solo espacios -> null', normalizarOpcional('   '), null);
check('gender undefined -> null', normalizarOpcional(undefined), null);
check('gender con valor se respeta', normalizarOpcional('Masculino'), 'Masculino');
check('marital_status vacío -> null', normalizarOpcional(''), null);

console.log('\n=== Motor de plantillas: documento del titular ===');
const ctxDe = (cliente: any) =>
  (createEnhancedTemplateContext(cliente, { name: 'Plan Beta', price: 310000 }, { name: 'SAMAP' },
    { id: 's1', total_amount: 310000, sale_date: '2026-08-17' }, []) as any).cliente;

const ctxEmpresa = ctxDe({
  client_type: 'empresa', razon_social: 'Frigorífico SA', ruc: '80012345-6',
  first_name: 'Frigorífico SA', last_name: '', dni: null,
});
check('empresa: {{cliente.documento}} = RUC', ctxEmpresa.documento, '80012345-6');
check('empresa: la etiqueta dice RUC', ctxEmpresa.documentoLabel, 'RUC');
check('empresa: {{cliente.ci}} y {{cliente.dni}} llevan el RUC (plantillas viejas)',
  [ctxEmpresa.ci, ctxEmpresa.dni], ['80012345-6', '80012345-6']);
check('empresa: nombreCompleto = razón social', ctxEmpresa.nombreCompleto, 'Frigorífico SA');
check('empresa: expone razonSocial y esEmpresa',
  [ctxEmpresa.razonSocial, ctxEmpresa.esEmpresa], ['Frigorífico SA', true]);

const ctxPersona = ctxDe({
  client_type: 'persona', first_name: 'RIKA', last_name: 'HIRANO', dni: '3616083',
});
check('persona: documento = C.I., sin cambios', ctxPersona.documento, '3616083');
check('persona: la etiqueta sigue diciendo C.I.', ctxPersona.documentoLabel, 'C.I.');
check('persona: ci/dni intactos', [ctxPersona.ci, ctxPersona.dni], ['3616083', '3616083']);
check('persona: nombreCompleto sin cambios', ctxPersona.nombreCompleto, 'RIKA HIRANO');
check('persona: ruc y razonSocial vacíos', [ctxPersona.ruc, ctxPersona.razonSocial], ['', '']);

console.log('\n=== Adicional Plan Materno: qué campos se habilitan ===');
check('con el adicional marcado manda Plan Materno, sin importar el plan',
  resolvePlanFieldsTemplateName({ maternity_bonus: true }, 'Beta'), 'Plan Materno');
check('con el adicional y SIN plan elegido igual habilita',
  resolvePlanFieldsTemplateName({ maternity_bonus: true }, null), 'Plan Materno');
check('sin adicional cae al plan elegido (comportamiento anterior)',
  resolvePlanFieldsTemplateName({ maternity_bonus: false }, 'Beta'), 'Beta');
check('sin adicional ni plan no habilita nada',
  resolvePlanFieldsTemplateName({ maternity_bonus: false }, null), null);
check('venta sin el campo se comporta como sin adicional',
  resolvePlanFieldsTemplateName({}, 'Senior Plus'), 'Senior Plus');
check('venta nula no explota',
  resolvePlanFieldsTemplateName(null, 'Alfa'), 'Alfa');
check('nombre de plan solo con espacios no habilita',
  resolvePlanFieldsTemplateName({ maternity_bonus: false }, '   '), null);
check('la constante coincide con el template real de la base',
  PLAN_MATERNO_TEMPLATE, 'Plan Materno');

console.log('\n=== Adherentes bloqueados con el contrato firmado ===');
// Sin excepciones por rol: `canMutateBeneficiaries` no recibe el rol a propósito.
// La vía legítima para sumar gente a un contrato firmado es la Incorporación.
for (const estado of ['firmado', 'firmado_parcial', 'completado']) {
  check(`${estado} -> bloqueado`, canMutateBeneficiaries({ status: estado }), false);
}
for (const estado of ['borrador', 'enviado', 'pendiente', 'en_auditoria', 'rechazado']) {
  check(`${estado} -> se puede editar`, canMutateBeneficiaries({ status: estado }), true);
}
check('venta nula no bloquea (todavía no hay contrato)', canMutateBeneficiaries(null), true);
check('estado desconocido no bloquea', canMutateBeneficiaries({ status: 'lo_que_sea' }), true);
// `isSaleLocked` responde otra pregunta y SIGUE eximiendo a los roles
// privilegiados; los dos helpers tienen que poder discrepar.
check('un admin sobre un contrato firmado: isSaleLocked=false pero no puede tocar adherentes',
  [isSaleLocked({ status: 'firmado' }, 'admin'), canMutateBeneficiaries({ status: 'firmado' })],
  [false, false]);

console.log('\n=== Validación del adherente: misma regla en los dos formularios ===');
const personaOk = { first_name: 'Ana', last_name: 'Lopez', relationship: 'hijo', phone: '981123456' };
check('persona completa es válida', validateBeneficiary(personaOk), null);
check('persona sin parentesco falla',
  validateBeneficiary({ ...personaOk, relationship: '' }), 'El parentesco es obligatorio');
check('EMPRESA sin cargo es válida (el cargo es opcional)',
  validateBeneficiary({ ...personaOk, relationship: '' }, { isCompany: true }), null);
check('el rótulo cambia según el titular',
  [getRelationshipLabel(), getRelationshipLabel({ isCompany: true })], ['Parentesco', 'Cargo']);
check('obligatoriedad del vínculo',
  [isRelationshipRequired(), isRelationshipRequired({ isCompany: true })], [true, false]);
// El teléfono se pide sólo a quien tiene que firmar: el OTP va por WhatsApp.
// Antes un formulario lo exigía siempre y el otro nunca.
check('sin teléfono y con firma requerida falla',
  validateBeneficiary({ ...personaOk, phone: '' }),
  'El teléfono es obligatorio para quien tiene que firmar');
check('sin teléfono pero sin firma requerida es válido',
  validateBeneficiary({ ...personaOk, phone: '', signature_required: false }), null);
check('signature_required sin definir se toma como true (default de la base)',
  isPhoneRequired({}), true);
check('nombre de una sola letra falla',
  validateBeneficiary({ ...personaOk, first_name: 'A' }),
  'El nombre debe tener al menos 2 caracteres');
check('nombre solo con espacios falla',
  validateBeneficiary({ ...personaOk, first_name: '   ' }),
  'El nombre debe tener al menos 2 caracteres');
check('apellido faltante falla',
  validateBeneficiary({ ...personaOk, last_name: '' }),
  'El apellido debe tener al menos 2 caracteres');

console.log('\n=== Filtro de ventas-operación ===');
let capturado = '';
const queryFalsa = { or: (f: string) => { capturado = f; return 'query'; } };
excludeOperationSales(queryFalsa);
check('excluye los DOS tipos de operacion, dejando pasar sale_type NULL', capturado,
  `sale_type.is.null,and(sale_type.neq.${SALE_TYPE_INCORPORACION},sale_type.neq.${SALE_TYPE_CAMBIO_PLAN})`);
check('NO usa un neq pelado', capturado.includes('is.null'), true);
// Con dos tipos, los neq TIENEN que ir dentro de un and(). Sueltos dentro del or()
// no excluirian nada: una venta 'alta_adherente' pasaria por cumplir neq.cambio_plan.
check('los neq van agrupados en un and()',
  /and\(sale_type\.neq\.[^,]+,sale_type\.neq\.[^)]+\)/.test(capturado), true);
// El alias viejo debe seguir existiendo: lo usan los dashboards y reportes.
capturado = '';
excludeIncorporationSales(queryFalsa);
check('el alias excludeIncorporationSales sigue excluyendo igual', capturado.includes('is.null'), true);

console.log('\n=== Anexo de Vigencia Inmediata: quién entra en la tabla ===');
// V.I. EFECTIVA = valor del adherente; si es null, hereda el de la VENTA.
// (Misma semántica que SaleAdherentsTab: null NO es "no".)
const clienteVI = { client_type: 'persona', first_name: 'RIKA', last_name: 'HIRANO', dni: '3616083' };
const adherentesVI = [
  { first_name: 'ANA', last_name: 'VI', document_number: '1', relationship: 'hijo', amount: 100000, immediate_coverage: true },
  { first_name: 'BETO', last_name: 'NOVI', document_number: '2', relationship: 'hijo', amount: 100000, immediate_coverage: false },
  { first_name: 'CARLA', last_name: 'HEREDA', document_number: '3', relationship: 'conyuge', amount: 100000, immediate_coverage: null },
];
const plantillaVI = '<ul>{{#beneficiarios_vi}}<li>{{indice}}-{{nombreCompleto}}</li>{{/beneficiarios_vi}}</ul>';
const ctxVI = (immediate: boolean) =>
  createEnhancedTemplateContext(
    clienteVI, { name: 'Plan Beta', price: 300000 }, { name: 'SAMAP' },
    { id: 's-vi', total_amount: 400000, sale_date: '2026-08-17', immediate_coverage: immediate },
    adherentesVI, undefined, {}, {},
  );

const viVentaSi = interpolateEnhancedTemplate(plantillaVI, ctxVI(true));
check('venta con V.I.: entran el titular (hereda), el adherente en true y el null (hereda)',
  viVentaSi, '<ul><li>1-RIKA HIRANO</li><li>2-ANA VI</li><li>3-CARLA HEREDA</li></ul>');
check('venta con V.I.: el adherente en false NO entra aunque la venta la tenga',
  viVentaSi.includes('BETO'), false);

const viVentaNo = interpolateEnhancedTemplate(plantillaVI, ctxVI(false));
check('venta sin V.I.: solo entra el adherente con V.I. propia en true',
  viVentaNo, '<ul><li>1-ANA VI</li></ul>');
check('venta sin V.I.: el null hereda "no" y el titular tampoco entra',
  [viVentaNo.includes('CARLA'), viVentaNo.includes('RIKA')], [false, false]);
check('el loop de todos los beneficiarios sigue listando a los 4',
  (interpolateEnhancedTemplate('<ul>{{#beneficiarios}}<li>{{nombre}}</li>{{/beneficiarios}}</ul>', ctxVI(false))
    .match(/<li>/g) || []).length, 4);

console.log('\n=== Cambio de Plan: la tabla es el SNAPSHOT, no los adherentes de hoy ===');
// A propósito los nombres del snapshot NO coinciden con los beneficiarios
// actuales del contrato: si el loop se equivocara de fuente, se notaría.
const ventaCambio = {
  id: 's-cambio', total_amount: 500000, sale_date: '2026-08-17',
  sale_type: 'cambio_plan', immediate_coverage: false,
  plan_change: {
    reason: 'mayor_cobertura',
    previous_plan_name: 'Plan Alfa', new_plan_name: 'Plan Beta',
    previous_total_amount: 400000, new_total_amount: 500000,
    new_contract_start_date: '2026-09-01',
    observations: 'Pide cobertura odontológica.',
    members: [
      { name: 'RIKA HIRANO', previous_plan: 'Plan Alfa', previous_amount: 250000, new_amount: 300000 },
      { name: 'CARLA HEREDA', previous_plan: 'Plan Alfa', previous_amount: 150000, new_amount: 200000 },
    ],
  },
};
const ctxCambio = createEnhancedTemplateContext(
  clienteVI, { name: 'Plan Beta', price: 300000 }, { name: 'SAMAP' }, ventaCambio,
  // Beneficiarios ACTUALES distintos del snapshot, para detectar la confusión.
  [{ first_name: 'ZULMA', last_name: 'NUEVA', document_number: '9', relationship: 'hijo', amount: 100000 }],
  undefined, {}, {},
);
const filasCambio = interpolateEnhancedTemplate(
  '<table>{{#integrantes_anteriores}}<tr><td>{{indice}}</td><td>{{nombre}}</td>' +
  '<td>{{planAnterior}}</td><td>{{montoAnteriorFormateado}}</td><td>{{montoNuevoFormateado}}</td></tr>' +
  '{{/integrantes_anteriores}}</table>',
  ctxCambio,
);
check('renderiza las 2 filas del snapshot', (filasCambio.match(/<tr>/g) || []).length, 2);
check('la primera fila es la del snapshot, con su plan anterior',
  filasCambio.includes('<td>1</td><td>RIKA HIRANO</td><td>Plan Alfa</td>'), true);
check('NO renderiza a los adherentes actuales del contrato',
  filasCambio.includes('ZULMA'), false);
check('el motivo sale como etiqueta legible, no como código',
  interpolateEnhancedTemplate('{{cambio.motivo}}', ctxCambio),
  'Pasar a plan de mayor cobertura');
check('la fecha de inicio no se corre un día (bug conocido #1)',
  interpolateEnhancedTemplate('{{cambio.fechaInicioNuevoContrato}}', ctxCambio), '01/09/2026');
check('planes y observaciones',
  interpolateEnhancedTemplate('{{cambio.planAnterior}}|{{cambio.planNuevo}}|{{cambio.observaciones}}', ctxCambio),
  'Plan Alfa|Plan Beta|Pide cobertura odontológica.');

console.log('\n=== No regresión: una venta normal no ve nada de esto ===');
const ctxNormal = createEnhancedTemplateContext(
  clienteVI, { name: 'Plan Beta', price: 300000 }, { name: 'SAMAP' },
  { id: 's-normal', total_amount: 400000, sale_date: '2026-08-17', immediate_coverage: false },
  adherentesVI, undefined, {}, {},
);
const plantillaVieja =
  '<p>{{titular_nombre}} | {{titular_ci}} | {{monto_total}} | {{plan.nombre}} | {{vigencia_inmediata}}</p>' +
  '<table><tbody><tr><td>{{nombre}}</td><td>{{dni}}</td><td>{{montoFormateado}}</td></tr></tbody></table>';
const renderVieja = interpolateEnhancedTemplate(plantillaVieja, ctxNormal);
check('una plantilla sin variables nuevas renderiza el titular y las 4 filas de siempre',
  [renderVieja.includes('RIKA HIRANO | 3616083'), (renderVieja.match(/<tr>/g) || []).length],
  [true, 4]);
check('sin cambio de plan, el bloque cambio queda vacío y no ensucia el texto',
  interpolateEnhancedTemplate('[{{cambio.motivo}}][{{cambio.planAnterior}}][{{cambio.fechaInicioNuevoContrato}}]', ctxNormal),
  '[][][]');
check('sin cambio de plan, el loop de integrantes no imprime filas',
  interpolateEnhancedTemplate('<table>{{#integrantes_anteriores}}<tr><td>{{nombre}}</td></tr>{{/integrantes_anteriores}}</table>', ctxNormal),
  '<table></table>');

// ===========================================================================
// NÓMINA DE EMPRESA
// ===========================================================================
console.log('\n=== Nómina: qué exige un empleado que no exige un adherente ===');
const empleadoOK = {
  first_name: 'JUAN', last_name: 'PEREZ', phone: '981123456',
  plan_id: 'plan-oro', amount: 1200000,
};
check('empleado completo es válido', validateEmployee(empleadoOK), null);
check('empleado SIN cargo es válido (el cargo es opcional en una empresa)',
  validateEmployee({ ...empleadoOK, relationship: '' }), null);
check('empleado sin plan falla: sin plan no hay cobertura ni cuota',
  validateEmployee({ ...empleadoOK, plan_id: '' })?.includes('plan'), true);
check('empleado con monto 0 falla: el total del contrato saldría corto',
  validateEmployee({ ...empleadoOK, amount: 0 })?.includes('monto'), true);
// El adherente de un empleado se vincula con ÉL por parentesco, no con la
// empresa por un cargo: pasarle isCompany haría opcional el parentesco y la
// nómina quedaría sin decir quién es quién.
check('adherente de empleado SIN parentesco falla, aunque el contrato sea de empresa',
  validateEmployeeDependent({ first_name: 'MARIA', last_name: 'PEREZ', phone: '981000000',
    plan_id: 'plan-oro', amount: 300000, relationship: '' })?.includes('parentesco'),
  true);
check('adherente de empleado completo es válido',
  validateEmployeeDependent({ first_name: 'MARIA', last_name: 'PEREZ', phone: '981000000',
    plan_id: 'plan-oro', amount: 300000, relationship: 'conyuge' }),
  null);
check('las reglas base no se duplican: el nombre corto sigue fallando igual',
  validateEmployee({ ...empleadoOK, first_name: 'J' }),
  validateBeneficiary({ ...empleadoOK, first_name: 'J' }, { isCompany: true }));

console.log('\n=== Nómina: agrupador empleado → adherentes ===');
const PLANES = [
  { id: 'plan-oro', name: 'Plan ORO', price: 1200000 },
  { id: 'plan-plata', name: 'Plan PLATA', price: 900000 },
];
const nominaFilas = [
  { id: 'e1', first_name: 'JUAN', last_name: 'PEREZ', dni: '111', member_role: 'empleado',
    parent_beneficiary_id: null, plan_id: 'plan-oro', amount: 1200000, status: 'active',
    relationship: 'Gerente', created_at: '2026-01-01' },
  { id: 'a1', first_name: 'MARIA', last_name: 'PEREZ', dni: '112', member_role: 'adherente',
    parent_beneficiary_id: 'e1', plan_id: 'plan-oro', amount: 300000, status: 'active',
    relationship: 'conyuge', created_at: '2026-01-02' },
  { id: 'a2', first_name: 'ANA', last_name: 'PEREZ', dni: '113', member_role: 'adherente',
    parent_beneficiary_id: 'e1', plan_id: 'plan-plata', amount: 250000, status: 'active',
    relationship: 'hijo', created_at: '2026-01-03' },
  { id: 'e2', first_name: 'ROSA', last_name: 'GOMEZ', dni: '221', member_role: 'empleado',
    parent_beneficiary_id: null, plan_id: 'plan-plata', amount: 900000, status: 'active',
    relationship: 'Contadora', created_at: '2026-01-04' },
];

const agrupada = agruparNomina(nominaFilas);
check('dos empleados, con 2 y 0 adherentes',
  agrupada.empleados.map((g) => [g.empleado.id, g.adherentes.length]),
  [['e1', 2], ['e2', 0]]);
check('subtotal del grupo = empleado + sus adherentes',
  agrupada.empleados.map((g) => g.subtotal), [1750000, 900000]);
check('nadie queda suelto', agrupada.sueltos.length, 0);
check('el orden impreso es empleado seguido de su grupo',
  aplanarNomina(agrupada).map((m) => m.id), ['e1', 'a1', 'a2', 'e2']);
check('una venta a persona física no tiene nómina',
  [tieneNomina(adherentesVI), tieneNomina(nominaFilas)], [false, true]);
// El total lo calcula la base sobre TODAS las filas activas, así que una
// persona que la pantalla no muestre igual estaría facturando: un total que no
// cierra con lo que se ve (bug #10).
check('en una venta CON nómina, una fila is_primary no se descarta: sale en sueltos',
  agruparNomina([...nominaFilas,
    { id: 'p1', first_name: 'FANTASMA', last_name: 'X', is_primary: true, amount: 999 }])
    .sueltos.map((s) => s.id),
  ['p1']);
check('en una venta a persona física el primario NO ensucia sueltos',
  agruparNomina([{ id: 'p1', first_name: 'RIKA', last_name: 'H', is_primary: true, amount: 1 },
                 { id: 'a1', first_name: 'HIJO', last_name: 'H', amount: 2 }])
    .sueltos.map((s) => s.id),
  ['a1']);
check('sin empleado asignado, el adherente NO desaparece: cae en sueltos',
  agruparNomina([{ id: 'x', first_name: 'PERDIDO', last_name: 'X', member_role: 'adherente',
    parent_beneficiary_id: 'no-existe', amount: 100 }]).sueltos.map((s) => s.id),
  ['x']);

console.log('\n=== Nómina: la baja deja de sumar pero no desaparece ===');
const conBaja = agruparNomina(
  nominaFilas.map((f) => (f.id === 'a2' ? { ...f, status: 'inactive' } : f)),
);
check('el dado de baja sigue en la lista', conBaja.empleados[0].adherentes.length, 2);
check('pero no suma al subtotal', conBaja.empleados[0].subtotal, 1500000);
check('estaActivo distingue los tres casos',
  [estaActivo({ status: 'active' }), estaActivo({ status: 'inactive' }), estaActivo({ status: null })],
  [true, false, true]);

console.log('\n=== Contrato de empresa: NO se inventa una fila de titular ===');
const clienteEmpresa = {
  client_type: 'empresa', razon_social: 'FRIGORIFICO SA', ruc: '80012345-6',
  first_name: 'FRIGORIFICO SA', last_name: '',
};
const ctxEmpresaNomina = createEnhancedTemplateContext(
  clienteEmpresa, { name: 'Plan ORO', price: 1200000 }, { name: 'SAMAP' },
  // titular_amount 0: el total sale de la nómina.
  { id: 's-emp', total_amount: 2650000, titular_amount: 0, sale_date: '2026-09-08' },
  nominaFilas, undefined, {}, {}, PLANES,
) as any;
// Sin el arreglo del titularFallback acá aparecía una 5ª fila con la razón
// social cobrando los 2.650.000 enteros, encima de la nómina.
check('la tabla lista exactamente a las 4 personas de la nómina',
  ctxEmpresaNomina.beneficiarios.length, 4);
check('ninguna fila es "Titular"',
  ctxEmpresaNomina.beneficiarios.some((b: any) => (b.parentesco || '').toLowerCase() === 'titular'),
  false);
check('la razón social NO aparece como beneficiaria',
  ctxEmpresaNomina.beneficiarios.some((b: any) => b.nombreCompleto.includes('FRIGORIFICO')),
  false);
check('las filas van en orden de nómina',
  ctxEmpresaNomina.beneficiarios.map((b: any) => b.nombre),
  ['JUAN', 'MARIA', 'ANA', 'ROSA']);

console.log('\n=== Contrato de empresa: plan por persona, rol y de quién depende ===');
check('cada persona lleva SU plan',
  ctxEmpresaNomina.beneficiarios.map((b: any) => b.plan),
  ['Plan ORO', 'Plan ORO', 'Plan PLATA', 'Plan PLATA']);
check('el rol distingue empleado de adherente',
  ctxEmpresaNomina.beneficiarios.map((b: any) => b.rol),
  ['Empleado', 'Adherente', 'Adherente', 'Empleado']);
check('el adherente sabe de qué empleado depende; el empleado no depende de nadie',
  ctxEmpresaNomina.beneficiarios.map((b: any) => b.dependeDe),
  ['', 'JUAN PEREZ', 'JUAN PEREZ', '']);

const tablaPlana = interpolateEnhancedTemplate(
  '<table>{{#beneficiarios}}<tr><td>{{nombreCompleto}}</td><td>{{rol}}</td>' +
  '<td>{{plan_nombre}}</td><td>{{depende_de}}</td><td>{{montoFormateado}}</td></tr>{{/beneficiarios}}</table>',
  ctxEmpresaNomina,
);
check('la tabla plana imprime las 4 filas con plan y dependencia',
  [(tablaPlana.match(/<tr>/g) || []).length,
   tablaPlana.includes('<td>MARIA PEREZ</td><td>Adherente</td><td>Plan ORO</td><td>JUAN PEREZ</td>')],
  [4, true]);

console.log('\n=== Loop anidado {{#empleados}} / {{#sus_adherentes}} ===');
const tablaAgrupada = interpolateEnhancedTemplate(
  '<table>{{#empleados}}' +
  '<tr class="emp"><td>{{nombreCompleto}}</td><td>{{plan_nombre}}</td>' +
  '<td>{{cantidadAdherentes}}</td><td>{{subtotalFormateado}}</td></tr>' +
  '{{#sus_adherentes}}<tr class="adh"><td>{{nombreCompleto}}</td><td>{{plan_nombre}}</td></tr>{{/sus_adherentes}}' +
  '{{/empleados}}</table>',
  ctxEmpresaNomina,
);
check('una fila por empleado y una por cada adherente suyo',
  [(tablaAgrupada.match(/class="emp"/g) || []).length,
   (tablaAgrupada.match(/class="adh"/g) || []).length],
  [2, 2]);
// Si el sub-loop se resolviera DESPUÉS de los alias del empleado, los
// {{nombreCompleto}} de los adherentes saldrían todos como "JUAN PEREZ".
check('el sub-loop NO se come los nombres de los adherentes',
  tablaAgrupada.includes('<tr class="adh"><td>MARIA PEREZ</td><td>Plan ORO</td></tr>' +
                         '<tr class="adh"><td>ANA PEREZ</td><td>Plan PLATA</td></tr>'),
  true);
check('el empleado imprime su cantidad de adherentes y su subtotal',
  tablaAgrupada.includes('<td>JUAN PEREZ</td><td>Plan ORO</td><td>2</td>'), true);
check('el segundo empleado no arrastra los adherentes del primero',
  tablaAgrupada.indexOf('ROSA GOMEZ') > tablaAgrupada.indexOf('ANA PEREZ'), true);

// El sub-loop usa un regex GLOBAL reusado en cada iteración del .map(). Si
// `String.replace` no reseteara `lastIndex`, la segunda iteración empezaría a
// buscar desde donde quedó la primera y el segundo empleado saldría SIN sus
// adherentes. Con un solo empleado con hijos el bug no se ve: hacen falta dos.
const ctxDosGrupos = createEnhancedTemplateContext(
  clienteEmpresa, { name: 'Plan ORO', price: 1200000 }, { name: 'SAMAP' },
  { id: 's-emp2', total_amount: 2900000, titular_amount: 0, sale_date: '2026-09-08' },
  [...nominaFilas, { id: 'a3', first_name: 'LUIS', last_name: 'GOMEZ', dni: '222',
    member_role: 'adherente', parent_beneficiary_id: 'e2', plan_id: 'plan-plata',
    amount: 250000, status: 'active', relationship: 'hijo', created_at: '2026-01-05' }],
  undefined, {}, {}, PLANES,
) as any;
const dosGrupos = interpolateEnhancedTemplate(
  '<table>{{#empleados}}<tr class="emp"><td>{{nombreCompleto}}</td></tr>' +
  '{{#sus_adherentes}}<tr class="adh"><td>{{nombreCompleto}}</td></tr>{{/sus_adherentes}}' +
  '{{/empleados}}</table>',
  ctxDosGrupos,
);
check('con DOS empleados con hijos, el sub-loop corre en las dos iteraciones',
  [(dosGrupos.match(/class="emp"/g) || []).length,
   (dosGrupos.match(/class="adh"/g) || []).length,
   dosGrupos.includes('LUIS GOMEZ')],
  [2, 3, true]);

console.log('\n=== No regresión: la nómina no altera una venta a persona física ===');
check('sin empleados, {{#empleados}} no imprime nada',
  interpolateEnhancedTemplate('<table>{{#empleados}}<tr><td>{{nombreCompleto}}</td></tr>{{/empleados}}</table>', ctxNormal),
  '<table></table>');
// Los alias nuevos son POR FILA, igual que {{nombreCompleto}}: sólo se
// resuelven dentro de un loop de beneficiarios. En una venta a persona física
// las columnas quedan vacías, que es lo que tiene que pasar — no hay plan por
// persona ni empleado del que depender.
check('en una venta a persona física las columnas nuevas salen vacías',
  interpolateEnhancedTemplate(
    '<table>{{#beneficiarios}}<tr><td>{{nombreCompleto}}</td><td>[{{rol}}][{{plan_nombre}}][{{depende_de}}]</td></tr>{{/beneficiarios}}</table>',
    ctxNormal,
  ).includes('<td>[][][]</td>'),
  true);
check('la venta a persona física SIGUE anteponiendo al titular',
  (createEnhancedTemplateContext(
    clienteVI, { name: 'Plan Beta', price: 300000 }, { name: 'SAMAP' },
    { id: 's-pf', total_amount: 400000, sale_date: '2026-08-17' },
    adherentesVI, undefined, {}, {},
  ) as any).beneficiarios[0].parentesco.toLowerCase(),
  'titular');

console.log(`\nRESULTADO: ${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
