#!/usr/bin/env node
// Arma el script de pase a BR produccion de la Entrega A a partir de las
// migraciones del repo, con los ajustes A1-A7 de
// docs/runbooks/produccion-entrega-a.md (seccion 11).
//
//   node scripts/produccion/build-entrega-a.mjs
//
// Genera dos archivos que difieren SOLO en el final:
//   sql/produccion-entrega-a-SIMULACRO.sql  ejecuta todo y lo deshace
//   sql/produccion-entrega-a.sql            ejecuta todo y lo deja aplicado
//
// Por que un generador y no un .sql escrito a mano: asi queda probado que el
// script de prod ES el de las migraciones, salvo los reemplazos nombrados
// abajo. Cada reemplazo exige encontrar el texto exacto una sola vez; si una
// migracion cambia, el generador falla en vez de producir algo distinto.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Esquema aprobado de prod (precondicion 0.a)
// ---------------------------------------------------------------------------
// El script compara el esquema de public de la base destino contra esta
// referencia, columna por columna y con su tipo, y aborta ante cualquier
// diferencia. Es lo que identifica al destino: US test difiere en decenas de
// tablas, y una copia restaurada de prod coincide (que es lo que se quiere para
// el ensayo). El md5 es el de la 2da consulta de esquema-prod-referencia.sql,
// medido en prod: asegura que el .txt se transcribio sin errores.
const ESQUEMA_MD5 = '636520e7e17019f079443b11b73b765f';
const ESQUEMA_TABLAS = 88;
const ESQUEMA_COLUMNAS = 969;
const ESQUEMA = (() => {
  const txt = readFileSync(join(ROOT, 'scripts', 'produccion', 'esquema-prod-referencia.txt'), 'utf8').replace(/\r\n/g, '\n');
  const cols = [];
  for (const linea of txt.split('\n')) {
    if (!linea.trim() || linea.startsWith('#')) continue;
    const [tabla, resto, sobra] = linea.split('|');
    if (!resto || sobra !== undefined) throw new Error(`esquema-prod-referencia.txt: linea mal formada: ${linea.slice(0, 60)}`);
    // El tipo puede llevar comas (numeric(12,2)): se corta solo fuera de parentesis.
    for (const c of resto.split(/,(?![^()]*\))/)) {
      const i = c.indexOf(':');
      cols.push({ tabla, columna: c.slice(0, i), tipo: c.slice(i + 1) });
    }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // orden de bytes = COLLATE "C"
  cols.sort((a, b) => cmp(a.tabla, b.tabla) || cmp(a.columna, b.columna));
  const entradas = cols.map((c) => `${c.tabla}.${c.columna}:${c.tipo}`);
  const md5 = createHash('md5').update(entradas.join(',')).digest('hex');
  const tablas = new Set(cols.map((c) => c.tabla)).size;
  if (md5 !== ESQUEMA_MD5 || tablas !== ESQUEMA_TABLAS || entradas.length !== ESQUEMA_COLUMNAS) {
    throw new Error(`esquema-prod-referencia.txt no coincide con lo medido en prod: ${tablas} tablas, ${entradas.length} columnas, md5 ${md5}`);
  }
  return entradas;
})();

// Versiones que existen como archivo en el repo. Si el historial de la base
// destino tiene alguna que no esta aca, la CLI de Supabase se niega a hacer
// "db push" ("Remote migration versions not found in local migrations
// directory"). Hoy prod tiene 89 asi: es lo que impide un push accidental.
const VERSIONES_LOCALES = readdirSync(MIG_DIR)
  .map((f) => f.match(/^(\d{14})_.*\.sql$/)?.[1])
  .filter(Boolean)
  .sort();

// Las 3 ventas completadas cuyo total guardado difiere de la formula nueva
// (relevado en prod el 2026-10-25). El script NO las toca (A2).
const VENTAS_CONOCIDAS = ['2026-000109', '2026-000191', '2026-000207'];

// Nombres de las plantillas que siembran 20260822000002 y 20260908000006.
const PLANTILLAS_SEMBRADAS = [
  'Anexo de Incorporación de Adherente',
  'Formulario de Solicitud de Cambio de Plan',
  'Anexo Especial de Vigencia Inmediata',
  'Contrato Colectivo de Empresa',
  'Anexo de Movimiento de Nomina',
];

// ---------------------------------------------------------------------------
// Ajustes a migraciones puntuales
// ---------------------------------------------------------------------------
function reemplazarUnaVez(sql, viejo, nuevo, donde) {
  const n = viejo instanceof RegExp
    ? (sql.match(new RegExp(viejo.source, viejo.flags.includes('g') ? viejo.flags : viejo.flags + 'g')) || []).length
    : sql.split(viejo).length - 1;
  if (n !== 1) throw new Error(`${donde}: se esperaba 1 ocurrencia y hay ${n} de ${String(viejo).slice(0, 80)}`);
  return sql.replace(viejo, nuevo);
}

const A2_backfillSoloReporte = (sql) => {
  sql = reemplazarUnaVez(sql,
    "      RAISE NOTICE 'backfill % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;\n" +
    '      PERFORM public.recalculate_sale_total_amount(r.id);\n',
    '      -- [PROD A2] Solo reporte: no se reescribe ningun total.\n' +
    "      RAISE NOTICE 'difiere (NO se corrige) % : % -> %', r.contract_number, r.total_viejo, r.total_nuevo;\n",
    'A2');
  return reemplazarUnaVez(sql,
    "RAISE NOTICE 'total_amount corregido en % venta(s)', v_n;",
    "RAISE NOTICE 'ventas cuyo total difiere de la formula (no se tocaron): %', v_n;",
    'A2');
};

const A3_guardSinFuncionesLegadas = (sql) => {
  sql = reemplazarUnaVez(sql,
    "      'public.activate_adherent_incorporation()',\n" +
    "      'public.complete_adherent_incorporation(uuid)',\n" +
    "      'public.approve_sale_addendum(uuid,text)',\n" +
    "      'public.try_complete_sale_addendum_for_link(uuid)'\n",
    "      -- [PROD A3] En prod solo existe la del trigger de activacion: las otras\n" +
    "      -- 3 son del flujo legado sale_addendums, que prod nunca tuvo.\n" +
    "      'public.activate_adherent_incorporation()'\n",
    'A3');
  return reemplazarUnaVez(sql,
    /DO \$exenciones\$[\s\S]*?\$exenciones\$;/,
    '-- [PROD A3] Se omite el ALTER FUNCTION ... SET: sobre funciones que no existen\n' +
    '-- da undefined_function, que el EXCEPTION original no atrapaba. La exencion\n' +
    '-- real es la de PG_CONTEXT, que queda igual.',
    'A3');
};

const A5_plantillasInactivas = (sql) => reemplazarUnaVez(sql,
  'SELECT c.id, v.name, v.description, v.content, v.template_type, true, true',
  '-- [PROD A5] Nacen INACTIVAS: el front viejo lista toda plantilla activa sin\n' +
  '    -- filtrar por empresa. Se activan despues del deploy del front nuevo.\n' +
  '    SELECT c.id, v.name, v.description, v.content, v.template_type, false, true',
  'A5');

// Orden de aplicacion. Excluidas a proposito:
//   20260804*, 20260819000003, 20261007000001  comisiones (A6)
//   20260822000003                             legado que prod no usa (A4)
const MIGRACIONES = [
  ['20260813000001'], ['20260813000002'], ['20260813000003'],
  ['20260817000001'], ['20260817000002'],
  ['20260818000001', A2_backfillSoloReporte],
  ['20260818000002', A3_guardSinFuncionesLegadas],
  ['20260818000003'],
  ['20260819000001'], ['20260819000002'],
  ['20260822000001'], ['20260822000002', A5_plantillasInactivas],
  ['20260908000001'], ['20260908000002'], ['20260908000003'],
  ['20260908000004'], ['20260908000005'], ['20260908000006', A5_plantillasInactivas],
  ['20260909000001'], ['20260909000002'],
  ['20260910000001'], ['20260910000002'], ['20260910000003'], ['20260910000004'],
  // Hallado al ensayar sobre el clon: prod tiene un CHECK (fuera del repo) que
  // impedía enviar y firmar anexos y ventas a empresa.
  ['20261109000001'],
];

// Las migraciones terminan con SELECTs de verificacion pensados para test. En
// un script unico solo se veria el ultimo, y el de 20260818000001 diria
// "QUEDAN DIFERENCIAS" por las 3 ventas conocidas. Se reemplazan por la
// verificacion consolidada del final, que aborta en vez de mostrar.
function sinVerificacionFinal(sql, archivo) {
  const lineas = sql.split(/\r?\n/);
  const i = lineas.findIndex((l) => /^--\s*VERIFICACI/.test(l));
  if (i < 0) return sql;
  const desde = /^--\s*-{10,}/.test(lineas[i - 1] || '') ? i - 1 : i;
  const cola = lineas.slice(desde).join('\n');
  if (/^\s*(create|alter|update|insert|delete|drop|do\s|grant|revoke|comment)\b/im.test(cola)) {
    throw new Error(`${archivo}: la seccion de verificacion contiene algo que no es SELECT`);
  }
  return lineas.slice(0, desde).join('\n');
}

const archivos = readdirSync(MIG_DIR);
const bloques = MIGRACIONES.map(([version, ajuste]) => {
  const archivo = archivos.find((f) => f.startsWith(`${version}_`));
  if (!archivo) throw new Error(`No existe la migracion ${version}`);
  let sql = readFileSync(join(MIG_DIR, archivo), 'utf8').replace(/\r\n/g, '\n');
  if (/^\s*(begin|commit|rollback)\s*;/im.test(sql)) throw new Error(`${archivo} maneja su propia transaccion`);
  if (/concurrently/i.test(sql)) throw new Error(`${archivo} usa CONCURRENTLY (no corre en una transaccion)`);
  sql = sinVerificacionFinal(sql, archivo);
  if (ajuste) sql = ajuste(sql);
  return { version, archivo, nombre: archivo.replace(/^\d+_/, '').replace(/\.sql$/, ''), sql: sql.trimEnd() };
});

// ---------------------------------------------------------------------------
// Piezas propias del script de prod
// ---------------------------------------------------------------------------
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs) => `ARRAY[${xs.map(lit).join(', ')}]::text[]`;

const ENCABEZADO = (modo) => `-- ============================================================================
-- PASE A BR PRODUCCION — ENTREGA A — ${modo === 'simulacro' ? 'SIMULACRO (deshace todo al final)' : 'APLICACION REAL'}
-- ============================================================================
-- GENERADO por scripts/produccion/build-entrega-a.mjs. NO EDITAR A MANO:
-- cambiar la migracion o el generador y volver a generar.
--
-- Proyecto destino: ejiycfqxgtrzaysgpzmx (BR prod) o una COPIA de prod para el
-- ensayo. Aborta solo si ve que ya se aplico, o si el esquema de public no es
-- EXACTAMENTE el aprobado (scripts/produccion/esquema-prod-referencia.txt:
-- ${ESQUEMA_TABLAS} tablas, ${ESQUEMA_COLUMNAS} columnas con su tipo).
--
-- Como correrlo: pegar el archivo ENTERO en el SQL Editor, o psql -f.
--
-- POR QUE ES UNA SOLA SENTENCIA (un DO que ejecuta cada paso con EXECUTE):
-- el SQL Editor del dashboard NO mantiene una sesion entre sentencias, asi que
-- un BEGIN ... COMMIT escrito en el texto no garantiza nada (paso el
-- 2026-10-08: un script dio error y quedo aplicado entero). Una sentencia
-- unica es atomica en cualquier cliente: si falla cualquier paso —o el
-- simulacro llega al final— Postgres deshace TODO.
--
-- Garantias (ver docs/runbooks/produccion-entrega-a.md, seccion 11):
--   * Atomico: o se aplica todo, o nada.
--   * Cero UPDATE/DELETE sobre filas existentes. Ajustes A1-A7 aplicados.
--   * Guarda de datos: antes de tocar nada guarda, de CADA tabla de public, la
--     identidad fisica de cada fila (ctid + xmin) y las columnas con su tipo; al
--     final lo compara. Todo UPDATE —aunque deje los mismos valores—, DELETE,
--     INSERT o reescritura de tabla crea otra version de fila con otro ctid y
--     otro xmin, asi que si UNA sola fila preexistente fue escrita, ABORTA. No
--     depende del contenido: cubre igual un PDF de 2 MB que un booleano.
--   * Bloqueo: lock_timeout de 3 s limita cuanto se ESPERA para conseguir un
--     bloqueo, no cuanto se lo retiene. Desde el PASO 0 hasta el final, las
--     tablas alteradas (beneficiaries, sales, clients, ...) quedan bloqueadas
--     para lectura y escritura. El script informa esa duracion al terminar
--     (en el mensaje del SIMULACRO y como NOTICE en el real): medirla en el
--     ensayo y en el simulacro antes de elegir la ventana.
--
-- Si aborta por la guarda nombrando una tabla que el pase no toca (p. ej.
-- signature_links), es actividad concurrente de un usuario o de un cron entre
-- la foto de antes y la de despues: no se aplico nada, volver a correrlo. Los
-- crons de prod corren a los :00 y :30; evitar esos minutos.
-- ============================================================================
`;

const PRE = `
-- 0.a Precondiciones: que sea prod y que el pase no se haya aplicado
DO $pre$
BEGIN
  IF to_regclass('public.adherent_incorporations') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'beneficiaries'
                   AND column_name = 'status') THEN
    RAISE EXCEPTION 'El pase ya esta aplicado en esta base, o no es BR prod (US test ya tiene estos objetos). No se hizo nada.';
  END IF;
  IF to_regclass('public.commission_items') IS NOT NULL THEN
    RAISE EXCEPTION 'Esta base tiene el modulo de comisiones: no es BR prod. No se hizo nada.';
  END IF;
END
$pre$;

-- 0.a' El esquema de public tiene que ser EXACTAMENTE el aprobado: mismas
-- tablas, mismas columnas, mismos tipos. Identifica al destino (BR prod o una
-- copia restaurada) y garantiza que las migraciones corren sobre lo que se
-- ensayo. Si prod cambio desde la captura, revisar y recapturar la referencia.
DO $esquema$
DECLARE
  v_ref    text[] := string_to_array($esquema_ref$${ESQUEMA.join('\n')}$esquema_ref$, E'\\n');
  v_actual text[];
  v_faltan text[];
  v_sobran text[];
BEGIN
  SELECT coalesce(array_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)), '{}')
    INTO v_actual
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE c.relkind IN ('r', 'p');

  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_faltan FROM unnest(v_ref) x WHERE x <> ALL (v_actual);
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_sobran FROM unnest(v_actual) x WHERE x <> ALL (v_ref);

  IF cardinality(v_faltan) + cardinality(v_sobran) > 0 THEN
    RAISE EXCEPTION 'ESQUEMA DISTINTO DEL APROBADO (no es BR prod o prod cambio desde la captura). No se hizo nada. Faltan %: % | Sobran %: %',
      cardinality(v_faltan), array_to_string(v_faltan[1:10], ', '),
      cardinality(v_sobran), array_to_string(v_sobran[1:10], ', ');
  END IF;
END
$esquema$;
`;

const FOTO = `
-- 0.b Foto "antes", en un esquema propio que se borra al final
CREATE SCHEMA pe_scratch;

-- Columnas con su tipo: al final tienen que seguir todas, iguales. Atrapa un
-- DROP COLUMN, un RENAME o un cambio de tipo, que no siempre escriben filas.
CREATE TABLE pe_scratch.columnas (tabla text, columna text, tipo text, PRIMARY KEY (tabla, columna));
INSERT INTO pe_scratch.columnas
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r', 'p');

-- Huella de una tabla: conteo + md5 de la identidad fisica de cada fila
-- (ctid = donde esta la version de la fila, xmin = la transaccion que la
-- escribio). Cualquier escritura sobre una fila crea una version nueva, con
-- otro ctid y con el xmin de ESTA transaccion: un UPDATE con los mismos
-- valores, un cambio de contenido de un PDF que conserva el tamano, un DELETE
-- o una reescritura de la tabla cambian la huella. Un VACUUM concurrente no:
-- no mueve filas vivas y conserva su xmin original al congelarlas.
-- No lee el contenido de las columnas: en prod las 88 tablas tardan 0,08 s.
CREATE FUNCTION pe_scratch.huella(p_tabla text, p_where text DEFAULT '', OUT filas bigint, OUT huella text)
LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass(format('public.%I', p_tabla)) IS NULL THEN
    filas := -1;
    huella := 'LA TABLA YA NO EXISTE';
    RETURN;
  END IF;
  EXECUTE format(
    'SELECT count(*), md5(coalesce(string_agg(ctid::text || %L || xmin::text, %L ORDER BY ctid), %L)) FROM public.%I %s',
    ':', ',', '', p_tabla, p_where)
  INTO filas, huella;
END
$fn$;

CREATE TABLE pe_scratch.foto (tabla text PRIMARY KEY, filas bigint, huella text);
INSERT INTO pe_scratch.foto
SELECT c.relname, h.filas, h.huella
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pe_scratch.huella(c.relname) h
 WHERE c.relkind IN ('r', 'p');

-- Las plantillas son la unica tabla que gana filas: se guardan sus ids para
-- comparar la huella sobre las preexistentes.
CREATE TABLE pe_scratch.templates_antes (id uuid PRIMARY KEY);
INSERT INTO pe_scratch.templates_antes SELECT id FROM public.templates;

CREATE TABLE pe_scratch.esperado (clave text PRIMARY KEY, valor bigint);
INSERT INTO pe_scratch.esperado
SELECT 'plantillas_nuevas',
       (SELECT count(*) FROM public.companies) * ${PLANTILLAS_SEMBRADAS.length}
       - (SELECT count(*) FROM public.templates WHERE name = ANY (${arr(PLANTILLAS_SEMBRADAS)}));
`;

const PASO0 = `
-- PASO 0 (A1) — columnas que ninguna migracion crea y prod no tiene.
-- Con DEFAULT constante: en PG 17 no reescribe la tabla ni dispara triggers, y
-- deja a las filas existentes en 'active' sin un UPDATE. Por eso el
-- "UPDATE ... WHERE status IS NULL" de 20260908000004 encuentra 0 filas.
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beneficiaries_status_check') THEN
    -- Mismos valores que en US test: 'pending_addendum_signature' es del flujo
    -- legado sale_addendums y se mantiene para no divergir.
    ALTER TABLE public.beneficiaries
      ADD CONSTRAINT beneficiaries_status_check
      CHECK (status IN ('active', 'inactive', 'pending_addendum_signature'));
  END IF;
END
$chk$;

-- Fecha de baja: la escriben useCreateNominaTermination y
-- activate_adherent_incorporation. Sin ella, la primera baja falla.
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS coverage_end_date date;
`;

const COLUMNAS_ESPERADAS = [
  'beneficiaries.status', 'beneficiaries.coverage_end_date', 'beneficiaries.entry_date',
  'beneficiaries.immediate_coverage', 'beneficiaries.member_role', 'beneficiaries.parent_beneficiary_id',
  'beneficiaries.plan_id', 'beneficiaries.requires_adherents', 'beneficiaries.maternity_bonus',
  'clients.client_type', 'clients.razon_social', 'clients.ruc', 'clients.external_id',
  'clients.hr_contact_name', 'clients.hr_contact_phone', 'clients.hr_contact_email',
  'sales.employee_signature_mode', 'sales.maternity_bonus', 'sales.contract_end_date',
];

const TRIGGERS_ESPERADOS = [
  'beneficiaries.trg_beneficiaries_block_when_sale_signed',
  'beneficiaries.trg_beneficiaries_validate_nomina',
  'sales.trg_activate_adherent_incorporation',
  'sales.trg_activate_plan_change',
  'adherent_incorporations.trg_adherent_incorporations_guard_lifecycle',
  'plan_changes.trg_plan_changes_guard_lifecycle',
  'sales.trg_sales_validate_titular_amount',
];

const VERIFICACION = `
-- ############################################################################
-- VERIFICACION — aborta si falta algo
-- ############################################################################
DO $verif$
DECLARE
  v_faltas text[] := '{}';
  v_x text;
BEGIN
  FOREACH v_x IN ARRAY ${arr(COLUMNAS_ESPERADAS)} LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = split_part(v_x, '.', 1)
                      AND column_name = split_part(v_x, '.', 2)) THEN
      v_faltas := v_faltas || ('columna ' || v_x);
    END IF;
  END LOOP;

  FOREACH v_x IN ARRAY ${arr(TRIGGERS_ESPERADOS)} LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = format('public.%I', split_part(v_x, '.', 1))::regclass
                      AND tgname = split_part(v_x, '.', 2) AND NOT tgisinternal) THEN
      v_faltas := v_faltas || ('trigger ' || v_x);
    END IF;
  END LOOP;

  FOREACH v_x IN ARRAY ARRAY['adherent_incorporations', 'plan_changes'] LOOP
    IF NOT COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_x)), false) THEN
      v_faltas := v_faltas || ('tabla con RLS ' || v_x);
    END IF;
  END LOOP;

  IF pg_get_functiondef('public.recalculate_sale_total_amount(uuid)'::regprocedure)
     NOT LIKE '%COALESCE(status, ''active'') = ''active''%' THEN
    v_faltas := v_faltas || 'recalculate_sale_total_amount(uuid) sin filtro por status'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'recalculate_sale_total_amount'
                    AND pg_get_function_result(p.oid) = 'trigger'
                    AND p.prosrc LIKE '%PERFORM public.recalculate_sale_total_amount(%') THEN
    v_faltas := v_faltas || 'el trigger de total no delega en la version con argumento'::text;
  END IF;

  -- La trampa mas peligrosa del modulo (CLAUDE.md): sin este filtro, firmar una
  -- baja copia a la persona al contrato madre.
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.activate_adherent_incorporation()'::regprocedure)
     NOT LIKE '%COALESCE(movement_type, ''alta'') = ''alta''%' THEN
    v_faltas := v_faltas || 'activate_adherent_incorporation sin el filtro movement_type=alta'::text;
  END IF;

  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.generate_contract_number()'::regprocedure)
     NOT LIKE '%alta_adherente%' THEN
    v_faltas := v_faltas || 'generate_contract_number sin las series de anexos'::text;
  END IF;

  -- Sin esto, ningún anexo ni venta a empresa sale de borrador ni se firma.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.sales'::regclass
                AND conname = 'sales_titular_amount_positive_when_active') THEN
    v_faltas := v_faltas || 'sigue el CHECK sales_titular_amount_positive_when_active'::text;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-expiring-sales') THEN
    v_faltas := v_faltas || 'job notify-expiring-sales'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM public.beneficiaries WHERE status <> 'active') THEN
    v_faltas := v_faltas || 'hay beneficiarios que no quedaron en active'::text;
  END IF;

  IF cardinality(v_faltas) > 0 THEN
    RAISE EXCEPTION 'Verificacion fallida, no se aplico nada: %', array_to_string(v_faltas, '; ');
  END IF;
END
$verif$;

-- ############################################################################
-- GUARDA DE DATOS — ninguna fila preexistente cambio
-- ############################################################################
DO $guarda$
DECLARE
  r record;
  v_h record;
  v_errores text[] := '{}';
  v_nuevas bigint;
  v_esperadas bigint := (SELECT valor FROM pe_scratch.esperado WHERE clave = 'plantillas_nuevas');
  v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM pe_scratch.foto ORDER BY tabla LOOP
    v_n := v_n + 1;
    IF r.tabla = 'templates' THEN
      SELECT * INTO v_h FROM pe_scratch.huella('templates', 'WHERE id IN (SELECT id FROM pe_scratch.templates_antes)');
    ELSE
      SELECT * INTO v_h FROM pe_scratch.huella(r.tabla);
    END IF;

    IF v_h.filas <> r.filas OR v_h.huella <> r.huella THEN
      v_errores := v_errores || format('%s: %s filas -> %s%s', r.tabla, r.filas, v_h.filas,
                                       CASE WHEN v_h.filas = r.filas THEN ' (mismo conteo, filas reescritas)' ELSE '' END);
    END IF;
  END LOOP;

  -- Columnas preexistentes: todas siguen, con el mismo nombre y el mismo tipo.
  SELECT v_errores || coalesce(array_agg(format('columna %s.%s (%s) desaparecio o cambio de tipo', c.tabla, c.columna, c.tipo)
                                         ORDER BY c.tabla, c.columna), '{}')
    INTO v_errores
    FROM pe_scratch.columnas c
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass(format('public.%I', c.tabla))
                        AND a.attname = c.columna AND a.attnum > 0 AND NOT a.attisdropped
                        AND format_type(a.atttypid, a.atttypmod) = c.tipo);

  -- templates: ademas de las preexistentes intactas, exactamente las sembradas
  -- y todas inactivas.
  SELECT count(*) INTO v_nuevas FROM public.templates
   WHERE id NOT IN (SELECT id FROM pe_scratch.templates_antes);
  IF v_nuevas <> v_esperadas THEN
    v_errores := v_errores || format('templates: %s filas nuevas, se esperaban %s', v_nuevas, v_esperadas);
  END IF;
  IF EXISTS (SELECT 1 FROM public.templates
              WHERE id NOT IN (SELECT id FROM pe_scratch.templates_antes)
                AND (is_active OR name <> ALL (${arr(PLANTILLAS_SEMBRADAS)}))) THEN
    v_errores := v_errores || 'templates: hay filas nuevas activas o que no son las sembradas'::text;
  END IF;

  IF cardinality(v_errores) > 0 THEN
    RAISE EXCEPTION 'GUARDA DE DATOS: el pase modifico datos existentes. Se deshace todo. %', array_to_string(v_errores, ' | ');
  END IF;

  RAISE NOTICE 'Guarda OK: % tablas sin ninguna fila escrita; % plantillas nuevas, inactivas.', v_n, v_nuevas;
END
$guarda$;

-- ############################################################################
-- Ventas firmadas cuyo total guardado no sale de la formula (A2)
-- ############################################################################
-- No se tocaron, pero la proxima activacion de un anexo sobre ellas les
-- recalcularia el total. Si aparece una que no es de las 3 conocidas, hay que
-- mirarla antes de seguir.
DO $conocidas$
DECLARE
  v_distintas text[];
BEGIN
  SELECT coalesce(array_agg(s.contract_number ORDER BY s.contract_number), '{}')
    INTO v_distintas
    FROM public.sales s
   WHERE s.status::text IN ('firmado_parcial', 'firmado', 'completado')
     AND coalesce(s.total_amount, 0) IS DISTINCT FROM (
       CASE WHEN EXISTS (SELECT 1 FROM public.beneficiaries b
                          WHERE b.sale_id = s.id AND coalesce(b.is_primary, false))
            THEN coalesce((SELECT sum(coalesce(b.amount, 0)) FROM public.beneficiaries b WHERE b.sale_id = s.id), 0)
            ELSE coalesce(s.titular_amount, 0)
                 + coalesce((SELECT sum(coalesce(b.amount, 0)) FROM public.beneficiaries b WHERE b.sale_id = s.id), 0)
       END);

  IF NOT (v_distintas <@ ${arr(VENTAS_CONOCIDAS)}) THEN
    RAISE EXCEPTION 'Hay ventas firmadas con el total fuera de la formula que no son las 3 conocidas: %. Revisar antes de aplicar.',
      array_to_string(v_distintas, ', ');
  END IF;
END
$conocidas$;

-- ############################################################################
-- Historial de migraciones: solo las versiones aplicadas
-- ############################################################################
-- Para que un "db push" futuro no las reaplique. Las excluidas (comisiones,
-- 20260822000003) NO se registran.
DO $hist$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES
${bloques.map((b) => `      (${lit(b.version)}, ${lit(b.nombre)}, ARRAY['-- aplicada por sql/produccion-entrega-a.sql (variante de prod)'])`).join(',\n')}
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$hist$;
`;

// ---------------------------------------------------------------------------
// Ensamblado: UNA sentencia DO que ejecuta cada paso con EXECUTE
// ---------------------------------------------------------------------------
const piezas = (modo) => [
  ['0.a precondiciones', PRE],
  ['0.b foto antes', FOTO],
  ['PASO 0 (A1)', PASO0],
  ...bloques.map((b) => [b.archivo, b.sql]),
  ['verificacion, guarda de datos e historial', VERIFICACION],
  ...(modo === 'real' ? [['limpieza del esquema scratch', 'DROP SCHEMA pe_scratch CASCADE;']] : []),
];

// Mediciones que se informan al final (las dos variantes): cuanto estuvieron
// bloqueadas las tablas, los pasos mas lentos, y si la CLI sigue sin poder
// hacer "db push" contra esta base.
const MEDICIONES = `
  v_paso := 'mediciones';
  v_bloqueo := round(extract(epoch FROM clock_timestamp() - v_t_bloqueo)::numeric, 2);
  v_total := round(extract(epoch FROM clock_timestamp() - v_t_inicio)::numeric, 2);
  SELECT string_agg(format('%s %s s', n, round(d, 2)), ', ' ORDER BY d DESC) INTO v_lentos
    FROM (SELECT n, d FROM unnest(v_nombres, v_duraciones) u(n, d) ORDER BY d DESC LIMIT 3) s;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version <> ALL ($1)'
      INTO v_sin_archivo USING ${arr(VERSIONES_LOCALES)};
  END IF;
  v_medicion := format('Tablas bloqueadas %s s (desde el PASO 0 hasta el final; total %s s). Pasos mas lentos: %s. '
                       || 'db push: %s.',
                       v_bloqueo, v_total, v_lentos,
                       CASE WHEN coalesce(v_sin_archivo, 0) > 0
                            THEN format('BLOQUEADO por la CLI (%s versiones en el historial sin archivo en el repo)', v_sin_archivo)
                            ELSE 'ATENCION, la CLI podria aplicar migraciones excluidas (comisiones) con un db push' END);
`;

const FIN_SIMULACRO = `${MEDICIONES}
  -- FIN DEL SIMULACRO. El error de abajo ES el resultado esperado: llegar hasta
  -- aca significa que todo se aplico, la verificacion paso y la guarda no
  -- encontro cambios. Al abortar la sentencia, Postgres revierte TODO.
  v_paso := 'fin del simulacro';
  EXECUTE 'SELECT count(*) FROM pe_scratch.foto' INTO v_tablas;
  EXECUTE 'SELECT valor FROM pe_scratch.esperado WHERE clave = ''plantillas_nuevas''' INTO v_plantillas;
  RAISE EXCEPTION 'SIMULACRO OK — nada quedo aplicado. % tablas verificadas sin ninguna fila escrita, % plantillas nuevas (inactivas). %',
    v_tablas, v_plantillas, v_medicion;
`;

const FIN_REAL_DO = `${MEDICIONES}
  RAISE NOTICE 'PASE APLICADO. %', v_medicion;
`;

const FIN_REAL = `
-- Lectura posterior, para ver el resultado en el SQL Editor.
SELECT 'PASE APLICADO' AS estado,
       (SELECT count(*) FROM public.templates WHERE name = ANY (${arr(PLANTILLAS_SEMBRADAS)}) AND NOT is_active) AS plantillas_inactivas_a_activar,
       (SELECT count(*) FROM public.beneficiaries WHERE status = 'active') AS beneficiarios_activos,
       (SELECT count(*) FROM pg_namespace WHERE nspname = 'pe_scratch') AS scratch_restante;
`;

function salida(modo) {
  const pasos = piezas(modo).map(([nombre, sql], i) => {
    const tag = `$pase_${String(i).padStart(2, '0')}$`;
    if (sql.includes('$pase_')) throw new Error(`${nombre}: contiene el delimitador reservado $pase_`);
    // El primer bloqueo que frena a los usuarios es el ALTER TABLE del PASO 0:
    // desde ahi se cuenta la ventana de bloqueo.
    const marcaBloqueo = nombre.startsWith('PASO 0') ? '  v_t_bloqueo := clock_timestamp();\n' : '';
    return `
  -- ##########################################################################
  -- ${nombre}
  -- ##########################################################################
  v_paso := ${lit(nombre)};
${marcaBloqueo}  v_t := clock_timestamp();
  -- replace(chr(13)): el SQL Editor del dashboard en Windows convierte los
  -- saltos de linea a CRLF al pegar. Sin esto, la referencia de esquema no
  -- coincide (paso el 2026-11-15, abortando sin aplicar nada) y las funciones
  -- y plantillas quedarian con \\r. Las migraciones no tienen \\r propios (el
  -- generador las normaliza), asi que esto solo saca lo que agrega el editor.
  EXECUTE replace(${tag}
${sql.trim()}
${tag}, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;
`;
  }).join('');

  return `${ENCABEZADO(modo)}
DO $pase_entrega_a$
DECLARE
  v_paso        text := 'inicio';
  v_tablas      bigint;
  v_plantillas  bigint;
  v_t_inicio    timestamptz := clock_timestamp();
  v_t_bloqueo   timestamptz;
  v_t           timestamptz;
  v_nombres     text[] := '{}';
  v_duraciones  numeric[] := '{}';
  v_bloqueo     numeric;
  v_total       numeric;
  v_lentos      text;
  v_sin_archivo bigint;
  v_medicion    text;
BEGIN
  -- Tope de ESPERA para conseguir cada bloqueo (no de retencion): si una tabla
  -- esta en uso, se cancela todo en vez de encolar a los usuarios detras.
  PERFORM set_config('lock_timeout', '3s', true);
${pasos}${modo === 'simulacro' ? FIN_SIMULACRO : FIN_REAL_DO}
EXCEPTION WHEN OTHERS THEN
  -- Cualquier error deshace la sentencia ENTERA; esto solo agrega en que paso fue.
  RAISE EXCEPTION USING
    MESSAGE = SQLERRM || '  [paso: ' || v_paso || ']',
    ERRCODE = SQLSTATE;
END
$pase_entrega_a$;
${modo === 'real' ? FIN_REAL : ''}`;
}

writeFileSync(join(ROOT, 'sql', 'produccion-entrega-a-SIMULACRO.sql'), salida('simulacro'));
writeFileSync(join(ROOT, 'sql', 'produccion-entrega-a.sql'), salida('real'));
console.log(`OK: ${bloques.length} migraciones -> sql/produccion-entrega-a{,-SIMULACRO}.sql`);
