// Compara la salida del motor de plantillas ACTUAL contra el de una referencia
// git (por defecto origin/main) y valida el Anexo de Incorporación.
const fs = require('fs');
const dir = process.argv[2];
const o = JSON.parse(fs.readFileSync(`${dir}/old.json`, 'utf8'));
const n = JSON.parse(fs.readFileSync(`${dir}/new.json`, 'utf8'));

let fallas = 0;
console.log('=== REGRESIÓN: una venta normal debe renderizar IGUAL que antes ===');
for (const k of ['legacy_tr', 'legacy_loop', 'legacy_globals', 'legacy_tr_phone']) {
  const ok = o[k] === n[k];
  if (!ok) {
    fallas++;
    console.log(`  DISTINTO  ${k}`);
    console.log(`    antes: ${o[k]}`);
    console.log(`    ahora: ${n[k]}`);
  } else console.log(`  IGUAL     ${k}`);
}

console.log('\n=== ANEXO DE INCORPORACIÓN ===');
if (!n.anexo) {
  console.log('  (no se pasó ANEXO_PATH)');
} else {
  const body = n.anexo.split('<tbody>')[1].split('</tbody>')[0];
  const filas = body.split('<tr>').filter((r) => r.trim());
  const nombres = filas.map((r) => (r.match(/<td[^>]*>([\s\S]*?)<\/td>/) || [])[1]?.replace(/<[^>]*>/g, '').trim());

  const assert = (nombre, cond) => {
    cond ? console.log(`  OK    ${nombre}`) : (fallas++, console.log(`  FALLA ${nombre}`));
  };
  assert('lista SOLO a quienes se incorporan (2 filas)', filas.length === 2);
  assert('NO incluye al titular', !nombres.some((x) => /HIRANO/i.test(x || '')));
  assert('resuelve la fecha de ingreso', /01\/08\/2026/.test(n.anexo));
  assert('resuelve el ID CLIENTE', /SAMAP-00123/.test(n.anexo));
  assert('la cuota es la del GRUPO, no la de la operación', /1\.250\.000/.test(n.anexo) && !/Gs\. 450\.000/.test(n.anexo));
  assert('V.I. del adherente sin valor hereda la de la venta', (n.anexo.match(/>Sí</g) || []).length >= 2);
  const pend = [...new Set(n.anexo.match(/\{\{[^}]+\}\}/g) || [])];
  assert(`solo quedan los campos de firma (${pend.join(', ') || 'ninguno'})`,
    pend.every((p) => /firma_/.test(p)));
}

console.log(`\nRESULTADO: ${fallas === 0 ? 'TODO OK' : fallas + ' FALLAS'}`);
process.exit(fallas ? 1 : 0);
