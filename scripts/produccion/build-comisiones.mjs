#!/usr/bin/env node
// Arma el script de pase a BR produccion del MODULO DE COMISIONES a partir de
// las 12 migraciones del repo, con las mismas garantias que el pase de la
// Entrega A (scripts/produccion/build-entrega-a.mjs).
//
//   node scripts/produccion/build-comisiones.mjs
//
// Genera dos archivos que difieren SOLO en el final:
//   sql/produccion-comisiones-SIMULACRO.sql  ejecuta todo y lo deshace
//   sql/produccion-comisiones.sql            ejecuta todo y lo deja aplicado
//
// Las migraciones se copian TAL CUAL (sin ajustes): son 100 % aditivas, solo
// crean y modifican objetos commission_* y no tocan ninguna tabla existente.
// El modulo queda instalado pero APAGADO (no se inserta ninguna fila de
// configuracion): habilitarlo es un paso aparte (sql/produccion-comisiones-HABILITAR.sql).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Esquema aprobado de prod (precondicion): el de DESPUES del pase de la Entrega A
// ---------------------------------------------------------------------------
const ESQUEMA_ARCHIVO = 'esquema-prod-referencia-post-entrega-a.txt';
const ESQUEMA_MD5 = '266a13700d5b7af5894c079fa4a9a450';
const ESQUEMA_TABLAS = 90;
const ESQUEMA_COLUMNAS = 1053;
const ESQUEMA = (() => {
  const txt = readFileSync(join(ROOT, 'scripts', 'produccion', ESQUEMA_ARCHIVO), 'utf8').replace(/\r\n/g, '\n');
  const cols = [];
  for (const linea of txt.split('\n')) {
    if (!linea.trim() || linea.startsWith('#')) continue;
    const [tabla, resto, sobra] = linea.split('|');
    if (!resto || sobra !== undefined) throw new Error(`${ESQUEMA_ARCHIVO}: linea mal formada: ${linea.slice(0, 60)}`);
    for (const c of resto.split(/,(?![^()]*\))/)) {
      const i = c.indexOf(':');
      cols.push({ tabla, columna: c.slice(0, i), tipo: c.slice(i + 1) });
    }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  cols.sort((a, b) => cmp(a.tabla, b.tabla) || cmp(a.columna, b.columna));
  const entradas = cols.map((c) => `${c.tabla}.${c.columna}:${c.tipo}`);
  const md5 = createHash('md5').update(entradas.join(',')).digest('hex');
  const tablas = new Set(cols.map((c) => c.tabla)).size;
  if (md5 !== ESQUEMA_MD5 || tablas !== ESQUEMA_TABLAS || entradas.length !== ESQUEMA_COLUMNAS) {
    throw new Error(`${ESQUEMA_ARCHIVO} no coincide con lo medido en prod: ${tablas} tablas, ${entradas.length} columnas, md5 ${md5}`);
  }
  return entradas;
})();

const VERSIONES_LOCALES = readdirSync(MIG_DIR)
  .map((f) => f.match(/^(\d{12,14})_.*\.sql$/)?.[1])
  .filter(Boolean)
  .sort();

// Orden de aplicacion (= orden lexicografico de los archivos).
const MIGRACIONES = [
  '202608040001', '202608040002', '202608040003', '202608040004',
  '20260804175027', '20260804175810', '20260804190000', '20260804200000',
  '20260804210000', '20260804220000',
  '20260819000003',
  '20261007000001',
];

const archivos = readdirSync(MIG_DIR);
const bloques = MIGRACIONES.map((version) => {
  const archivo = archivos.find((f) => f.startsWith(`${version}_`));
  if (!archivo) throw new Error(`No existe la migracion ${version}`);
  const sql = readFileSync(join(MIG_DIR, archivo), 'utf8').replace(/\r\n/g, '\n');
  if (/^\s*(begin|commit|rollback)\s*;/im.test(sql)) throw new Error(`${archivo} maneja su propia transaccion`);
  if (/concurrently/i.test(sql)) throw new Error(`${archivo} usa CONCURRENTLY`);
  if (/\btemp(orary)?\s+table\b/i.test(sql)) throw new Error(`${archivo} usa TEMP TABLE`);
  if (sql.includes('$pase_')) throw new Error(`${archivo} contiene el delimitador reservado $pase_`);
  // Ninguna sentencia de nivel superior puede alterar tablas que no sean commission_*.
  for (const m of sql.matchAll(/^\s*(ALTER|DROP|TRUNCATE)\s+TABLE\s+(IF\s+EXISTS\s+)?(public\.)?([a-z_0-9]+)/gim)) {
    if (!m[4].startsWith('commission_')) throw new Error(`${archivo}: ${m[1]} TABLE sobre ${m[4]} (no es del modulo)`);
  }
  return { version, archivo, nombre: archivo.replace(/^\d+_/, '').replace(/\.sql$/, ''), sql: sql.trimEnd() };
});

const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs) => `ARRAY[${xs.map(lit).join(', ')}]::text[]`;

const ENCABEZADO = (modo) => `-- ============================================================================
-- PASE A BR PRODUCCION — MODULO DE COMISIONES — ${modo === 'simulacro' ? 'SIMULACRO (deshace todo al final)' : 'APLICACION REAL'}
-- ============================================================================
-- GENERADO por scripts/produccion/build-comisiones.mjs. NO EDITAR A MANO.
--
-- Destino: ejiycfqxgtrzaysgpzmx (BR prod) o una COPIA de prod con la Entrega A
-- aplicada. Aborta solo si el modulo ya existe, si falta la Entrega A, o si el
-- esquema de public no es EXACTAMENTE el aprobado (${ESQUEMA_ARCHIVO}:
-- ${ESQUEMA_TABLAS} tablas, ${ESQUEMA_COLUMNAS} columnas con su tipo).
--
-- Como correrlo: pegar el archivo ENTERO en el SQL Editor, o psql -f.
-- Es UNA sola sentencia DO: atomica en cualquier cliente. Cada paso se ejecuta
-- con replace(..., chr(13), '') porque el SQL Editor en Windows pega con CRLF.
--
-- Garantias:
--   * Las 12 migraciones son 100 % aditivas: solo objetos commission_*.
--   * Guarda de datos: identidad fisica (ctid + xmin) de cada fila de cada tabla
--     preexistente de public, antes y despues. Si UNA sola fila cambio, ABORTA.
--   * El modulo queda instalado y APAGADO: no se inserta configuracion.
--   * lock_timeout 3 s: si una tabla esta en uso, se cancela en vez de encolar.
-- Evitar los minutos :00 y :30 (crons de prod).
-- ============================================================================
`;

const PRE = `
DO $pre$
BEGIN
  IF to_regclass('public.commission_settings') IS NOT NULL
     OR to_regclass('public.commission_items') IS NOT NULL THEN
    RAISE EXCEPTION 'El modulo de comisiones ya existe en esta base (o no es BR prod). No se hizo nada.';
  END IF;
  IF to_regclass('public.adherent_incorporations') IS NULL THEN
    RAISE EXCEPTION 'Falta el pase de la Entrega A en esta base. No se hizo nada.';
  END IF;
END
$pre$;

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
    RAISE EXCEPTION 'ESQUEMA DISTINTO DEL APROBADO. No se hizo nada. Faltan %: % | Sobran %: %',
      cardinality(v_faltan), array_to_string(v_faltan[1:10], ', '),
      cardinality(v_sobran), array_to_string(v_sobran[1:10], ', ');
  END IF;
END
$esquema$;
`;

const FOTO = `
CREATE SCHEMA pc_scratch;
CREATE TABLE pc_scratch.columnas (tabla text, columna text, tipo text, PRIMARY KEY (tabla, columna));
INSERT INTO pc_scratch.columnas
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r', 'p');

CREATE FUNCTION pc_scratch.huella(p_tabla text, OUT filas bigint, OUT huella text)
LANGUAGE plpgsql AS $fn$
BEGIN
  IF to_regclass(format('public.%I', p_tabla)) IS NULL THEN
    filas := -1; huella := 'LA TABLA YA NO EXISTE'; RETURN;
  END IF;
  EXECUTE format(
    'SELECT count(*), md5(coalesce(string_agg(ctid::text || %L || xmin::text, %L ORDER BY ctid), %L)) FROM public.%I',
    ':', ',', '', p_tabla)
  INTO filas, huella;
END
$fn$;

CREATE TABLE pc_scratch.foto (tabla text PRIMARY KEY, filas bigint, huella text);
INSERT INTO pc_scratch.foto
SELECT c.relname, h.filas, h.huella
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL pc_scratch.huella(c.relname) h
 WHERE c.relkind IN ('r', 'p');
`;

const TABLAS_NUEVAS = [
  'commission_settings', 'commission_salespeople', 'commission_plan_settings', 'commission_rules',
  'commission_periods', 'commission_items', 'commission_admin_fees', 'commission_period_adjustments',
];
const FUNCIONES_NUEVAS = [
  'commission_resolve_rule', 'commission_calculate_sale', 'commission_preview', 'commission_generate_period',
  'commission_close_period', 'commission_pay_period', 'commission_annul_period', 'commission_list_salespeople',
  'commission_add_adjustment', 'commission_delete_adjustment', 'commission_suggest_maternity_adjustments',
  'commission_export_rows', 'commission_admin_fee_for',
];

const VERIFICACION = `
DO $verif$
DECLARE
  v_faltas text[] := '{}';
  v_x text;
BEGIN
  FOREACH v_x IN ARRAY ${arr(TABLAS_NUEVAS)} LOOP
    IF to_regclass('public.' || v_x) IS NULL THEN
      v_faltas := v_faltas || ('tabla ' || v_x);
    ELSIF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_x)) THEN
      v_faltas := v_faltas || ('RLS apagada en ' || v_x);
    END IF;
  END LOOP;
  FOREACH v_x IN ARRAY ${arr(FUNCIONES_NUEVAS)} LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = v_x) THEN
      v_faltas := v_faltas || ('funcion ' || v_x);
    END IF;
  END LOOP;
  IF to_regclass('public.commission_period_payable') IS NULL THEN
    v_faltas := v_faltas || 'vista commission_period_payable'::text;
  END IF;
  IF to_regclass('public.commission_promoter_types') IS NOT NULL THEN
    v_faltas := v_faltas || 'sigue commission_promoter_types (debia eliminarse)'::text;
  END IF;
  IF to_regnamespace('cr_scratch') IS NOT NULL THEN
    v_faltas := v_faltas || 'quedo el esquema de trabajo cr_scratch'::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.commission_settings) THEN
    v_faltas := v_faltas || 'commission_settings no esta vacia (el pase no carga configuracion)'::text;
  END IF;
  -- Ningun permiso para anon sobre las tablas del modulo.
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE grantee = 'anon' AND table_schema = 'public' AND table_name LIKE 'commission%') THEN
    v_faltas := v_faltas || 'anon tiene permisos sobre tablas commission_*'::text;
  END IF;
  IF cardinality(v_faltas) > 0 THEN
    RAISE EXCEPTION 'Verificacion fallida, no se aplico nada: %', array_to_string(v_faltas, '; ');
  END IF;
END
$verif$;

DO $guarda$
DECLARE
  r record;
  v_h record;
  v_errores text[] := '{}';
  v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM pc_scratch.foto ORDER BY tabla LOOP
    v_n := v_n + 1;
    SELECT * INTO v_h FROM pc_scratch.huella(r.tabla);
    IF v_h.filas <> r.filas OR v_h.huella <> r.huella THEN
      v_errores := v_errores || format('%s: %s filas -> %s%s', r.tabla, r.filas, v_h.filas,
                                       CASE WHEN v_h.filas = r.filas THEN ' (mismo conteo, filas reescritas)' ELSE '' END);
    END IF;
  END LOOP;
  SELECT v_errores || coalesce(array_agg(format('columna %s.%s (%s) desaparecio o cambio de tipo', c.tabla, c.columna, c.tipo)
                                         ORDER BY c.tabla, c.columna), '{}')
    INTO v_errores
    FROM pc_scratch.columnas c
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass(format('public.%I', c.tabla))
                        AND a.attname = c.columna AND a.attnum > 0 AND NOT a.attisdropped
                        AND format_type(a.atttypid, a.atttypmod) = c.tipo);
  IF cardinality(v_errores) > 0 THEN
    RAISE EXCEPTION 'GUARDA DE DATOS: el pase modifico datos existentes. Se deshace todo. %', array_to_string(v_errores, ' | ');
  END IF;
  RAISE NOTICE 'Guarda OK: % tablas preexistentes sin ninguna fila escrita.', v_n;
END
$guarda$;

DO $hist$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES
${bloques.map((b) => `      (${lit(b.version)}, ${lit(b.nombre)}, ARRAY['-- aplicada por sql/produccion-comisiones.sql'])`).join(',\n')}
    ON CONFLICT (version) DO NOTHING;
  END IF;
END
$hist$;
`;

const piezas = (modo) => [
  ['0.a precondiciones', PRE],
  ['0.b foto antes', FOTO],
  ...bloques.map((b) => [b.archivo, b.sql]),
  ['verificacion, guarda de datos e historial', VERIFICACION],
  ...(modo === 'real' ? [['limpieza del esquema scratch', 'DROP SCHEMA pc_scratch CASCADE;']] : []),
];

const MEDICIONES = `
  v_paso := 'mediciones';
  v_total := round(extract(epoch FROM clock_timestamp() - v_t_inicio)::numeric, 2);
  SELECT string_agg(format('%s %s s', n, round(d, 2)), ', ' ORDER BY d DESC) INTO v_lentos
    FROM (SELECT n, d FROM unnest(v_nombres, v_duraciones) u(n, d) ORDER BY d DESC LIMIT 3) s;
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version <> ALL ($1)'
      INTO v_sin_archivo USING ${arr(VERSIONES_LOCALES)};
  END IF;
  v_medicion := format('Duracion total %s s. Pasos mas lentos: %s. db push: %s.', v_total, v_lentos,
                       CASE WHEN coalesce(v_sin_archivo, 0) > 0
                            THEN format('BLOQUEADO por la CLI (%s versiones en el historial sin archivo en el repo)', v_sin_archivo)
                            ELSE 'ATENCION, la CLI podria aplicar migraciones con un db push' END);
`;

const FIN_SIMULACRO = `${MEDICIONES}
  v_paso := 'fin del simulacro';
  EXECUTE 'SELECT count(*) FROM pc_scratch.foto' INTO v_tablas;
  RAISE EXCEPTION 'SIMULACRO OK — nada quedo aplicado. % tablas preexistentes sin ninguna fila escrita, % tablas del modulo creadas y verificadas. %',
    v_tablas, ${TABLAS_NUEVAS.length}, v_medicion;
`;

const FIN_REAL_DO = `${MEDICIONES}
  RAISE NOTICE 'MODULO DE COMISIONES INSTALADO (apagado). %', v_medicion;
`;

const FIN_REAL = `
SELECT 'COMISIONES INSTALADO (apagado)' AS estado,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'commission%') AS tablas_del_modulo,
       (SELECT count(*) FROM public.commission_settings) AS filas_de_configuracion,
       (SELECT count(*) FROM pg_namespace WHERE nspname IN ('pc_scratch', 'cr_scratch')) AS scratch_restante;
`;

function salida(modo) {
  const pasos = piezas(modo).map(([nombre, sql], i) => {
    const tag = `$pase_${String(i).padStart(2, '0')}$`;
    return `
  -- ##########################################################################
  -- ${nombre}
  -- ##########################################################################
  v_paso := ${lit(nombre)};
  v_t := clock_timestamp();
  EXECUTE replace(${tag}
${sql.trim()}
${tag}, chr(13), '');
  v_nombres := v_nombres || v_paso;
  v_duraciones := v_duraciones || extract(epoch FROM clock_timestamp() - v_t)::numeric;
`;
  }).join('');

  return `${ENCABEZADO(modo)}
DO $pase_comisiones$
DECLARE
  v_paso        text := 'inicio';
  v_tablas      bigint;
  v_t_inicio    timestamptz := clock_timestamp();
  v_t           timestamptz;
  v_nombres     text[] := '{}';
  v_duraciones  numeric[] := '{}';
  v_total       numeric;
  v_lentos      text;
  v_sin_archivo bigint;
  v_medicion    text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
${pasos}${modo === 'simulacro' ? FIN_SIMULACRO : FIN_REAL_DO}
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING
    MESSAGE = SQLERRM || '  [paso: ' || v_paso || ']',
    ERRCODE = SQLSTATE;
END
$pase_comisiones$;
${modo === 'real' ? FIN_REAL : ''}`;
}

writeFileSync(join(ROOT, 'sql', 'produccion-comisiones-SIMULACRO.sql'), salida('simulacro'));
writeFileSync(join(ROOT, 'sql', 'produccion-comisiones.sql'), salida('real'));
console.log(`OK: ${bloques.length} migraciones -> sql/produccion-comisiones{,-SIMULACRO}.sql`);
