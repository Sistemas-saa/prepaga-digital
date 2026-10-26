// Ensayo del script de pase sobre una replica minima de BR prod, en PGlite
// (Postgres en WASM; no necesita Docker ni credenciales).
//
//   npm i --no-save @electric-sql/pglite@0.5.9
//   node scripts/produccion/build-entrega-a.mjs
//   node scripts/produccion/ensayo/run.mjs .
//
// mock-prod.sql copia de prod (2026-10-25) las columnas, los triggers que
// importan (fn_audit_log, set_titular_amount_on_save, el recalculo de total y
// generate_contract_number) y los casos de datos: las 3 ventas con el total
// fuera de formula, una venta completada con su contrato firmado y un borrador.
// pg_cron se simula con un esquema cron minimo.
//
// NO reemplaza al ensayo sobre una copia real de prod (Fase 1 del runbook):
// prueba el script y la guarda, no el esquema completo de prod.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = process.argv[2];
const mock = readFileSync(new URL('./mock-prod.sql', import.meta.url), 'utf8');
const adaptar = (sql) => {
  // PGlite no trae pg_cron; el mock define cron.job/schedule/unschedule.
  const n = sql.split('CREATE EXTENSION IF NOT EXISTS pg_cron;').length - 1;
  if (n !== 1) throw new Error('pg_cron: ' + n);
  return sql.replace('CREATE EXTENSION IF NOT EXISTS pg_cron;', '-- (pg_cron simulado)');
};
const REAL = adaptar(readFileSync(`${REPO}/sql/produccion-entrega-a.sql`, 'utf8'));
const SIMU = adaptar(readFileSync(`${REPO}/sql/produccion-entrega-a-SIMULACRO.sql`, 'utf8'));

let fallas = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fallas++; };

async function fresh() {
  const db = new PGlite({ extensions: {} });
  await db.exec(mock);
  return db;
}

// Foto independiente de la del script: todas las filas de todas las tablas,
// con TODAS las columnas que existian antes, comparadas como JSON.
async function foto(db, columnas) {
  const tablas = (await db.query(`select tablename from pg_tables where schemaname='public' order by 1`)).rows.map((r) => r.tablename);
  if (!columnas) {
    columnas = {};
    for (const t of tablas) {
      columnas[t] = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by 1`, [t])).rows.map((r) => r.column_name);
    }
  }
  const datos = {};
  for (const t of Object.keys(columnas)) {
    const cols = columnas[t].map((c) => `"${c}"`).join(', ');
    datos[t] = (await db.query(`select ${cols} from public."${t}"`)).rows.map((r) => JSON.stringify(r)).sort();
  }
  return { columnas, datos, tablas };
}

async function correr(db, sql) {
  try { const res = await db.exec(sql); return { ok: true, res }; }
  catch (e) { try { await db.exec('ROLLBACK'); } catch {} return { ok: false, msg: e.message }; }
}

// 1. SIMULACRO -----------------------------------------------------------------
{
  console.log('\n== 1. SIMULACRO');
  const db = await fresh();
  const antes = await foto(db);
  const r = await correr(db, SIMU);
  ok(!r.ok && r.msg.startsWith('SIMULACRO OK'), `termina con SIMULACRO OK -> ${r.msg?.slice(0, 160)}`);
  const despues = await foto(db, antes.columnas);
  ok(JSON.stringify(antes.datos) === JSON.stringify(despues.datos), 'datos identicos despues del simulacro');
  ok(JSON.stringify(antes.tablas) === JSON.stringify(despues.tablas), 'mismas tablas (no quedo nada creado)');
  const quedo = (await db.query(`select to_regclass('public.adherent_incorporations') a, (select count(*) from pg_namespace where nspname='pe_scratch')::int s, (select count(*) from information_schema.columns where table_name='beneficiaries' and column_name='status')::int c`)).rows[0];
  ok(quedo.a === null && quedo.s === 0 && quedo.c === 0, 'sin objetos residuales (tablas, scratch, columnas)');
}

// 2. REAL ----------------------------------------------------------------------
{
  console.log('\n== 2. APLICACION REAL');
  const db = await fresh();
  const antes = await foto(db);
  const r = await correr(db, REAL);
  ok(r.ok, `aplica sin error ${r.ok ? '' : r.msg}`);
  if (r.ok) {
    const fin = r.res[r.res.length - 1].rows[0];
    ok(fin.estado === 'PASE APLICADO' && Number(fin.scratch_restante) === 0, `resultado final ${JSON.stringify(fin)}`);
  }
  const despues = await foto(db, antes.columnas);
  for (const t of Object.keys(antes.datos)) {
    if (t === 'templates') continue;
    if (JSON.stringify(antes.datos[t]) !== JSON.stringify(despues.datos[t])) ok(false, `tabla ${t} cambio`);
  }
  ok(Object.keys(antes.datos).filter((t) => t !== 'templates').every((t) => JSON.stringify(antes.datos[t]) === JSON.stringify(despues.datos[t])),
    'todas las tablas preexistentes identicas (columnas originales, fila por fila)');
  ok(antes.datos.templates.every((row) => despues.datos.templates.includes(row)), 'plantillas preexistentes intactas');
  const t = (await db.query(`select count(*)::int n, count(*) filter (where is_active)::int act from templates`)).rows[0];
  ok(t.n === 12 && t.act === 2, `plantillas: 2 previas + 10 nuevas inactivas (${JSON.stringify(t)})`);
  const tot = (await db.query(`select contract_number, total_amount::text from sales order by 1`)).rows;
  ok(JSON.stringify(tot) === JSON.stringify([
    { contract_number: '2026-000109', total_amount: '90000' }, { contract_number: '2026-000191', total_amount: '275000' },
    { contract_number: '2026-000207', total_amount: '250000' }, { contract_number: '2026-000214', total_amount: '500000' },
    { contract_number: '2026-000300', total_amount: '300000' }]), `totales sin cambios ${JSON.stringify(tot)}`);
  const aud = (await db.query(`select count(*)::int n from audit_logs`)).rows[0].n;
  ok(aud === antes.datos.audit_logs.length, `audit_logs no crecio (${antes.datos.audit_logs.length} -> ${aud})`);
  const mig = (await db.query(`select count(*)::int n from supabase_migrations.schema_migrations`)).rows[0].n;
  ok(mig === 25, `historial: 1 previa + 24 registradas (${mig})`);
  const cron = (await db.query(`select count(*)::int n from cron.job where jobname='notify-expiring-sales'`)).rows[0].n;
  ok(cron === 1, 'job notify-expiring-sales agendado');

  // Comportamiento despues del pase
  const g = await correr(db, `update beneficiaries set amount = 1 where sale_id = 'dddddddd-0000-0000-0000-000000000214' and not is_primary`);
  ok(!g.ok && /ya esta firmado/.test(g.msg), `guard bloquea editar adherente de venta completada -> ${g.msg?.slice(0, 90)}`);
  const ins = await correr(db, `insert into beneficiaries (sale_id, first_name, last_name, relationship, amount) values ('dddddddd-0000-0000-0000-000000000300','Hijo','D','Hijo',100000)`);
  const t300 = (await db.query(`select total_amount::text t from sales where contract_number='2026-000300'`)).rows[0].t;
  ok(ins.ok && t300 === '400000', `alta de adherente en borrador recalcula titular + adherentes (${t300})`);
  const baja = await correr(db, `insert into beneficiaries (sale_id, first_name, last_name, amount, status, coverage_end_date, signature_required) values ('dddddddd-0000-0000-0000-000000000300','Ex','E',50000,'inactive','2026-12-31',false)`);
  const t300b = (await db.query(`select total_amount::text t from sales where contract_number='2026-000300'`)).rows[0].t;
  ok(baja.ok && t300b === '400000', `fila de baja (inactive + coverage_end_date) se inserta y no suma (${baja.ok ? t300b : baja.msg})`);
  const nueva = await correr(db, `insert into sales (company_id, status, sale_type) values ('0a1dc0e5-7378-4d14-b7bc-646b3e652bc6','borrador','venta_nueva')`);
  const nro = (await db.query(`select contract_number from sales order by created_at desc, contract_number desc limit 1`)).rows[0].contract_number;
  ok(nueva.ok && nro === '2026-000301', `numeracion de contratos sigue la serie (${nro})`);

  // 3. Reejecucion
  console.log('\n== 3. REEJECUCION');
  const r2 = await correr(db, REAL);
  ok(!r2.ok && /ya esta aplicado/.test(r2.msg), `segunda corrida aborta en la precondicion -> ${r2.msg?.slice(0, 90)}`);
}

// 4. Sabotajes: la guarda tiene que atraparlos ---------------------------------
const sabotajes = [
  ['UPDATE con los MISMOS valores sobre una venta abierta', `UPDATE public.sales SET total_amount = total_amount WHERE contract_number = '2026-000300';`],
  ['UPDATE con los MISMOS valores sobre adherentes (lo frena el guard de firmados)', `UPDATE public.beneficiaries SET amount = amount;`],
  ['un nombre pasado a minuscula', `UPDATE public.clients SET first_name = lower(first_name) WHERE dni = '111';`],
  ['borrar una notificacion', `DELETE FROM public.notifications;`],
  ['plantilla sembrada activa', null],
];
for (const [nombre, sql] of sabotajes) {
  console.log(`\n== 4. SABOTAJE: ${nombre}`);
  const db = await fresh();
  const antes = await foto(db);
  let script = SIMU;
  if (sql) {
    script = script.replace('-- ############################################################################\n-- VERIFICACION', `${sql}\n-- ############################################################################\n-- VERIFICACION`);
  } else {
    script = script.replace(/v\.template_type, false, true/, 'v.template_type, true, true');
  }
  const r = await correr(db, script);
  const esperado = /guard de firmados/.test(nombre) ? /ya esta firmado/ : /GUARDA DE DATOS/;
  ok(!r.ok && esperado.test(r.msg), `aborta -> ${r.msg?.slice(0, 200)}`);
  const despues = await foto(db, antes.columnas);
  ok(JSON.stringify(antes.datos) === JSON.stringify(despues.datos), 'y no queda nada aplicado');
}

console.log(`\n${fallas === 0 ? 'TODO OK' : fallas + ' FALLA(S)'}`);
process.exit(fallas ? 1 : 0);
