import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolve4 } from 'node:dns/promises';

const US_REF = 'ykducvvcjzdpoojxlsig';
const BR_REF = 'ejiycfqxgtrzaysgpzmx';
const dbUrl = process.env.SUPABASE_US_DB_URL || '';
const apply = process.argv.includes('--apply');

function fail(message) {
  console.error(`[commission-us-guard] ${message}`);
  process.exit(1);
}

// spawnSync no lanza: ante ENOENT deja status en null y error seteado. Sin esto
// el guard reportaba "Dry-run failed" sin una sola linea de diagnostico.
function describeSpawn(result) {
  if (result.error) return `no se pudo ejecutar el proceso: ${result.error.message}`;
  if (result.signal) return `terminado por senal ${result.signal}`;
  return `exit code ${result.status}`;
}

if (!dbUrl) fail('SUPABASE_US_DB_URL is required.');
if (dbUrl.includes(BR_REF)) fail('Safety stop: the URL references BR production.');

let parsed;
try {
  parsed = new URL(dbUrl);
} catch {
  fail('SUPABASE_US_DB_URL is not a valid URL.');
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  fail('Only postgres:// or postgresql:// URLs are accepted.');
}
const username = decodeURIComponent(parsed.username);
const isDirect = parsed.hostname === `db.${US_REF}.supabase.co` && username === 'postgres';
const isPooler = parsed.hostname.endsWith('.pooler.supabase.com') && username === `postgres.${US_REF}`;
if (!isDirect && !isPooler) {
  fail(`Safety stop: DSN host/user do not identify US test ${US_REF}.`);
}

// En Windows, spawnSync con shell:false NO puede ejecutar archivos .cmd desde el
// parche de CVE-2024-27980 (Node 18.20.2+/20.12.2+): falla con EINVAL sin correr
// nada. La salida habitual seria shell:true, pero eso concatena los argumentos sin
// escapar y el DSN lleva una contrasena que puede contener & | ^ — riesgo de
// romper el comando o de inyeccion. En su lugar invocamos npx-cli.js con el propio
// binario de node, manteniendo shell:false y el paso de argumentos como array.
function resolveNpx() {
  if (process.platform !== 'win32') return { command: 'npx', prefix: [] };
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (existsSync(npxCli)) return { command: process.execPath, prefix: [npxCli] };
  return { command: 'npx.cmd', prefix: [] };
}

// Supabase publica db.<ref>.supabase.co solo con registro AAAA (IPv6). Desde una
// red IPv4 la conexion directa falla con un getaddrinfo ENOTFOUND que no explica
// nada. Se detecta antes de invocar al CLI y se indica la salida concreta.
if (isDirect) {
  try {
    await resolve4(parsed.hostname);
  } catch {
    fail(
      `${parsed.hostname} no tiene registro IPv4 (Supabase lo publica solo por IPv6).\n` +
        '  Usa la cadena del Session pooler (puerto 5432), que si resuelve por IPv4:\n' +
        `  postgresql://postgres.${US_REF}:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres\n` +
        '  Dashboard > proyecto > Connect > Session pooler.',
    );
  }
}

const { command: runner, prefix } = resolveNpx();
const baseArgs = [...prefix, '--yes', 'supabase@2.111.0', 'db', 'push', '--db-url', dbUrl];

console.log(`[commission-us-guard] Target verified: US test ${US_REF}.`);
console.log('[commission-us-guard] Running mandatory dry-run...');
const dryRun = spawnSync(runner, [...baseArgs, '--dry-run'], { stdio: 'inherit', shell: false });
if (dryRun.status !== 0) {
  fail(`Dry-run failed (${describeSpawn(dryRun)}); no migration was applied.`);
}

if (!apply) {
  console.log('[commission-us-guard] Dry-run complete. Use --apply only after reviewing it.');
  process.exit(0);
}

if (process.env.CONFIRM_SUPABASE_US !== US_REF) {
  fail(`Set CONFIRM_SUPABASE_US=${US_REF} to authorize the apply step.`);
}

console.log('[commission-us-guard] Applying migrations to US test...');
const result = spawnSync(runner, baseArgs, { stdio: 'inherit', shell: false });
if (result.status !== 0) fail(`Migration failed (${describeSpawn(result)}).`);
console.log('[commission-us-guard] Migration completed on US test.');
