import fs from 'node:fs';
import path from 'node:path';

const SOURCE = {
  name: 'BR production',
  ref: 'ejiycfqxgtrzaysgpzmx',
  url: 'https://ejiycfqxgtrzaysgpzmx.supabase.co',
};

const DEST = {
  name: 'US test',
  ref: 'ykducvvcjzdpoojxlsig',
  url: 'https://ykducvvcjzdpoojxlsig.supabase.co',
};

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const confirmedReset = args.has('--confirm-reset-us');
const skipStorage = args.has('--skip-storage');
const resumeOnly = args.has('--resume-only');

const BACKUP_DIR = path.join(process.cwd(), 'output', 'supabase-sync-backups');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

const SECRET_COLUMN_PATTERN = /(api[_-]?key|secret|token|password|auth[_-]?token|access[_-]?key|webhook[_-]?secret)/i;

const EXCLUDED_PUBLIC_TABLES = new Set([
  // Managed by Supabase/Auth or extension schemas, not app data.
]);

function log(message) {
  console.log(`[sync-br-to-us] ${message}`);
}

function readAccessToken() {
  const mcpPath = path.join(process.cwd(), '.mcp.json');
  if (fs.existsSync(mcpPath)) {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const servers = mcp.mcpServers || {};
    for (const name of ['supabase_br', 'supabase_us', 'supabase']) {
      const tokenIndex = servers[name]?.args?.indexOf('--access-token');
      if (tokenIndex >= 0 && servers[name].args[tokenIndex + 1]) {
        return servers[name].args[tokenIndex + 1];
      }
    }
  }

  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;

  throw new Error('Missing SUPABASE_ACCESS_TOKEN or .mcp.json access token');
}

const accessToken = readAccessToken();
let sourceServiceRoleKeyCache = null;
let destServiceRoleKeyCache = null;
const primaryKeyCache = new Map();

async function supabaseApi(pathname, options = {}) {
  const response = await fetch(`https://api.supabase.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`Supabase API ${pathname} failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

async function dbQuery(projectRef, query, { readOnly = true } = {}) {
  if (projectRef === SOURCE.ref && !readOnly) {
    throw new Error('Safety stop: attempted write-capable query against BR production');
  }

  return supabaseApi(`/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query, read_only: readOnly }),
  });
}

async function getServiceRoleKey(projectRef) {
  if (projectRef === SOURCE.ref && sourceServiceRoleKeyCache) return sourceServiceRoleKeyCache;
  if (projectRef === DEST.ref && destServiceRoleKeyCache) return destServiceRoleKeyCache;
  const keys = await supabaseApi(`/v1/projects/${projectRef}/api-keys`);
  const key = keys.find((item) => item.name === 'service_role' && item.api_key);
  if (!key) throw new Error(`No legacy service_role key found for ${projectRef}`);
  if (projectRef === SOURCE.ref) sourceServiceRoleKeyCache = key.api_key;
  if (projectRef === DEST.ref) destServiceRoleKeyCache = key.api_key;
  return key.api_key;
}

function dollarQuote(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let tag = '$samap_json$';
  while (text.includes(tag)) tag = `$samap_json_${Math.random().toString(36).slice(2)}$`;
  return `${tag}${text}${tag}`;
}

function sqlIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function getPublicBaseTables(projectRef) {
  const rows = await dbQuery(projectRef, `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name;
  `);
  return rows.map((row) => row.table_name).filter((table) => !EXCLUDED_PUBLIC_TABLES.has(table));
}

async function getColumns(projectRef, schema, table) {
  return dbQuery(projectRef, `
    select column_name, data_type, udt_name, is_nullable, column_default, is_generated, is_identity
    from information_schema.columns
    where table_schema = ${dollarQuote(schema)}
      and table_name = ${dollarQuote(table)}
    order by ordinal_position;
  `);
}

async function getRows(projectRef, schema, table) {
  const rows = await dbQuery(projectRef, `
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as rows
    from ${sqlIdent(schema)}.${sqlIdent(table)} t;
  `);
  return rows[0]?.rows || [];
}

async function getCounts(projectRef, tables) {
  const query = tables
    .map((table) => `select ${dollarQuote(table)} as table_name, count(*)::bigint as row_count from public.${sqlIdent(table)}`)
    .join('\nunion all\n');
  return dbQuery(projectRef, `${query}\norder by table_name;`);
}

async function getViewDefinitions(projectRef) {
  return dbQuery(projectRef, `
    select schemaname, viewname, definition
    from pg_views
    where schemaname = 'public'
    order by viewname;
  `);
}

async function getPrimaryKeyColumns(projectRef, schema, table) {
  const cacheKey = `${projectRef}:${schema}.${table}`;
  if (primaryKeyCache.has(cacheKey)) return primaryKeyCache.get(cacheKey);

  const rows = await dbQuery(projectRef, `
    select a.attname as column_name
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary
      and n.nspname = ${dollarQuote(schema)}
      and c.relname = ${dollarQuote(table)}
    order by array_position(i.indkey, a.attnum);
  `);
  const columns = rows.map((row) => row.column_name);
  primaryKeyCache.set(cacheKey, columns);
  return columns;
}

async function getForeignKeys(projectRef) {
  return dbQuery(projectRef, `
    select
      conrelid::regclass::text as child_table,
      confrelid::regclass::text as parent_table
    from pg_constraint
    where contype = 'f'
      and connamespace = 'public'::regnamespace
    order by conrelid::regclass::text, confrelid::regclass::text;
  `);
}

async function getStorageObjects(projectRef) {
  return dbQuery(projectRef, `
    select bucket_id, name, metadata
    from storage.objects
    order by bucket_id, name;
  `);
}

function orderTablesByDependencies(tables, foreignKeys) {
  const tableSet = new Set(tables);
  const incoming = new Map(tables.map((table) => [table, new Set()]));
  const outgoing = new Map(tables.map((table) => [table, new Set()]));

  for (const relation of foreignKeys) {
    const child = relation.child_table.replace(/^public\./, '');
    const parent = relation.parent_table.replace(/^public\./, '');
    if (!tableSet.has(child) || !tableSet.has(parent) || child === parent) continue;
    incoming.get(child).add(parent);
    outgoing.get(parent).add(child);
  }

  const queue = tables.filter((table) => incoming.get(table).size === 0).sort();
  const ordered = [];

  while (queue.length) {
    const table = queue.shift();
    ordered.push(table);
    for (const child of outgoing.get(table)) {
      const childIncoming = incoming.get(child);
      childIncoming.delete(table);
      if (childIncoming.size === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  const remaining = tables.filter((table) => !ordered.includes(table)).sort();
  return [...ordered, ...remaining];
}

async function backupDestinationState(publicTables) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `${RUN_ID}-us-test-inventory.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    source: SOURCE,
    destination: DEST,
    publicCounts: await getCounts(DEST.ref, publicTables),
    authCounts: await dbQuery(DEST.ref, `
      select 'auth.users' as table_name, count(*)::bigint as row_count from auth.users
      union all select 'auth.identities', count(*)::bigint from auth.identities
      order by table_name;
    `),
    storageObjects: await getStorageObjects(DEST.ref),
    companySettings: await getRows(DEST.ref, 'public', 'company_settings').catch(() => []),
  };
  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2));
  log(`US inventory backup written to ${backupPath}`);
  return payload;
}

async function reconcileSchema(sourceTables, destTables) {
  const sourceViewDefs = await getViewDefinitions(SOURCE.ref);
  const destViewDefs = await getViewDefinitions(DEST.ref);
  const destViews = new Set(destViewDefs.map((view) => view.viewname));

  const ddl = [];
  for (const table of sourceTables) {
    if (!destTables.includes(table)) {
      throw new Error(`Destination is missing base table public.${table}; full table DDL generation is not implemented`);
    }

    const [sourceColumns, destColumns] = await Promise.all([
      getColumns(SOURCE.ref, 'public', table),
      getColumns(DEST.ref, 'public', table),
    ]);
    const destColumnMap = new Map(destColumns.map((column) => [column.column_name, column]));

    for (const sourceColumn of sourceColumns) {
      if (!destColumnMap.has(sourceColumn.column_name)) {
        const type = sourceColumn.udt_name === 'jsonb' ? 'jsonb' : sourceColumn.udt_name === 'uuid' ? 'uuid' : sourceColumn.data_type;
        ddl.push(`alter table public.${sqlIdent(table)} add column if not exists ${sqlIdent(sourceColumn.column_name)} ${type};`);
      }
    }
  }

  const companyAutoWhatsapp = await Promise.all([
    getColumns(SOURCE.ref, 'public', 'company_settings'),
    getColumns(DEST.ref, 'public', 'company_settings'),
  ]);
  const sourceAuto = companyAutoWhatsapp[0].find((column) => column.column_name === 'contratada_auto_whatsapp');
  const destAuto = companyAutoWhatsapp[1].find((column) => column.column_name === 'contratada_auto_whatsapp');
  if (sourceAuto?.is_nullable === 'NO' && destAuto?.is_nullable !== 'NO') {
    ddl.push('update public.company_settings set contratada_auto_whatsapp = true where contratada_auto_whatsapp is null;');
    ddl.push('alter table public.company_settings alter column contratada_auto_whatsapp set default true;');
    ddl.push('alter table public.company_settings alter column contratada_auto_whatsapp set not null;');
  }

  for (const view of sourceViewDefs) {
    if (!destViews.has(view.viewname)) {
      ddl.push(`create or replace view public.${sqlIdent(view.viewname)} as\n${view.definition};`);
    }
  }

  if (!ddl.length) {
    log('Schema reconciliation: no DDL needed');
    return;
  }

  log(`Schema reconciliation prepared ${ddl.length} statements`);
  if (!execute) return;
  await dbQuery(DEST.ref, ddl.join('\n'), { readOnly: false });
  log('Schema reconciliation applied to US');
}

async function resetDestination(publicTables, bucketIds) {
  const statements = [];
  if (publicTables.length) {
    statements.push(`truncate table ${publicTables.map((table) => `public.${sqlIdent(table)}`).join(', ')} restart identity cascade;`);
  }
  statements.push('delete from auth.identities;');
  statements.push('delete from auth.users;');

  if (!execute) {
    log(`Dry-run: would reset US auth users and ${publicTables.length} public tables; Storage reset is handled through Storage API for ${bucketIds.length} buckets`);
    return;
  }

  if (!confirmedReset) {
    throw new Error('Refusing to reset US without --confirm-reset-us');
  }

  await dbQuery(DEST.ref, statements.join('\n'), { readOnly: false });
  log('US database rows reset');
}

async function insertRows(schema, table, rows) {
  if (!rows.length) return;
  const destinationColumns = await getColumns(DEST.ref, schema, table);
  const insertableColumns = destinationColumns
    .filter((column) => column.is_generated !== 'ALWAYS')
    .map((column) => column.column_name);
  const filteredRows = rows.map((row) => {
    const output = {};
    for (const column of insertableColumns) {
      if (Object.prototype.hasOwnProperty.call(row, column)) output[column] = row[column];
    }
    return output;
  });
  const columnList = insertableColumns.map(sqlIdent).join(', ');
  const initialChunkSize = schema === 'auth' ? 100 : 25;

  if (schema === 'public') {
    const serviceRoleKey = await getServiceRoleKey(DEST.ref);
    const primaryKeyColumns = await getPrimaryKeyColumns(DEST.ref, schema, table);
    const onConflict = primaryKeyColumns.join(',');

    async function insertRestChunk(chunk) {
      const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      const response = await fetch(`${DEST.url}/rest/v1/${encodeURIComponent(table)}${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      });

      if (response.ok) return;

      const message = `${response.status} ${await response.text()}`;
      if (chunk.length > 1 && response.status === 413) {
        const midpoint = Math.ceil(chunk.length / 2);
        await insertRestChunk(chunk.slice(0, midpoint));
        await insertRestChunk(chunk.slice(midpoint));
        return;
      }
      if (chunk.length > 1 && response.status === 409 && (message.includes('23503') || message.includes('23505'))) {
        const midpoint = Math.ceil(chunk.length / 2);
        await insertRestChunk(chunk.slice(0, midpoint));
        await insertRestChunk(chunk.slice(midpoint));
        return;
      }
      if (chunk.length === 1 && response.status === 409 && message.includes('23503')) {
        log(`Skipped orphan row in public.${table}: ${message}`);
        return;
      }
      if (chunk.length === 1 && response.status === 409 && message.includes('23505')) {
        log(`Skipped duplicate row in public.${table}: ${message}`);
        return;
      }
      throw new Error(`PostgREST insert failed for public.${table}: ${message}`);
    }

    for (let index = 0; index < filteredRows.length; index += initialChunkSize) {
      await insertRestChunk(filteredRows.slice(index, index + initialChunkSize));
    }
    return;
  }

  async function insertChunk(chunk) {
    const json = dollarQuote(chunk);
    const sql = `
      insert into ${sqlIdent(schema)}.${sqlIdent(table)} (${columnList})
      select ${columnList}
      from jsonb_populate_recordset(null::${sqlIdent(schema)}.${sqlIdent(table)}, ${json}::jsonb);
    `;
    try {
      await dbQuery(DEST.ref, sql, { readOnly: false });
    } catch (error) {
      const message = String(error?.message || error);
      if (chunk.length > 1 && message.includes('(413)')) {
        const midpoint = Math.ceil(chunk.length / 2);
        await insertChunk(chunk.slice(0, midpoint));
        await insertChunk(chunk.slice(midpoint));
        return;
      }
      throw error;
    }
  }

  for (let index = 0; index < filteredRows.length; index += initialChunkSize) {
    await insertChunk(filteredRows.slice(index, index + initialChunkSize));
  }
}

async function copyAuth() {
  if (!execute) {
    const counts = await dbQuery(SOURCE.ref, `
      select 'auth.users' as table_name, count(*)::bigint as row_count from auth.users
      union all select 'auth.identities', count(*)::bigint from auth.identities
      order by table_name;
    `);
    log(`Dry-run auth counts: ${counts.map((row) => `${row.table_name}=${row.row_count}`).join(', ')}`);
    return;
  }

  const users = await getRows(SOURCE.ref, 'auth', 'users');
  const identities = await getRows(SOURCE.ref, 'auth', 'identities');

  log(`Auth prepared: users=${users.length}, identities=${identities.length}`);

  await insertRows('auth', 'users', users);
  await insertRows('auth', 'identities', identities);
  log('Auth copied to US');
}

function restoreDestinationSecrets(table, sourceRows, destinationBackup) {
  if (table !== 'company_settings') return sourceRows;

  const destinationRows = destinationBackup.companySettings || [];
  const destinationByCompany = new Map(destinationRows.map((row) => [row.company_id || row.id, row]));

  return sourceRows.map((row) => {
    const output = { ...row };
    const destinationRow = destinationByCompany.get(row.company_id || row.id);
    for (const column of Object.keys(output)) {
      if (!SECRET_COLUMN_PATTERN.test(column)) continue;
      output[column] = destinationRow?.[column] ?? null;
    }
    return output;
  });
}

async function copyPublicTables(publicTables, destinationBackup) {
  const orderedTables = orderTablesByDependencies(publicTables, await getForeignKeys(SOURCE.ref));

  if (!execute) {
    const counts = await getCounts(SOURCE.ref, orderedTables);
    for (const row of counts) log(`Dry-run public.${row.table_name}: ${row.row_count} rows`);
    return;
  }

  for (const table of orderedTables) {
    let rows = await getRows(SOURCE.ref, 'public', table);
    rows = restoreDestinationSecrets(table, rows, destinationBackup);
    log(`Prepared public.${table}: ${rows.length} rows`);
    await insertRows('public', table, rows);
    log(`Copied public.${table}`);
  }
}

async function removeDestinationStorageObjects(destServiceRoleKey, bucketIds) {
  for (const bucketId of bucketIds) {
    const objects = await dbQuery(DEST.ref, `
      select name
      from storage.objects
      where bucket_id = ${dollarQuote(bucketId)}
      order by name;
    `);
    const names = objects.map((object) => object.name);
    for (let index = 0; index < names.length; index += 100) {
      const batch = names.slice(index, index + 100);
      if (!batch.length) continue;
      const response = await fetch(`${DEST.url}/storage/v1/object/${bucketId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${destServiceRoleKey}`,
          apikey: destServiceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: batch }),
      });
      if (!response.ok) {
        throw new Error(`Failed to delete US storage batch ${bucketId}: ${response.status} ${await response.text()}`);
      }
    }
    log(`Removed ${names.length} existing US storage objects from ${bucketId}`);
  }
}

async function copyStorage(sourceServiceRoleKey, destServiceRoleKey, sourceObjects) {
  const bucketIds = [...new Set(sourceObjects.map((object) => object.bucket_id))];
  if (!execute || skipStorage) {
    log(`Dry-run: would copy ${sourceObjects.length} storage objects across ${bucketIds.length} buckets`);
    return;
  }

  if (!resumeOnly) {
    await removeDestinationStorageObjects(destServiceRoleKey, bucketIds);
  }

  async function fetchWithRetry(url, options, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        const text = await response.text();
        lastError = new Error(`${label}: ${response.status} ${text}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw lastError;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
    throw lastError;
  }

  const existingDestinationObjects = new Set(
    resumeOnly
      ? (await getStorageObjects(DEST.ref)).map((object) => `${object.bucket_id}/${object.name}`)
      : [],
  );

  let copied = 0;
  for (const object of sourceObjects) {
    const objectKey = `${object.bucket_id}/${object.name}`;
    if (resumeOnly && existingDestinationObjects.has(objectKey)) {
      copied += 1;
      continue;
    }

    const sourcePath = `${SOURCE.url}/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
    const download = await fetchWithRetry(sourcePath, {
      headers: {
        Authorization: `Bearer ${sourceServiceRoleKey}`,
        apikey: sourceServiceRoleKey,
      },
    }, `Failed to download BR storage object ${object.bucket_id}/${object.name}`);

    const contentType = object.metadata?.mimetype || download.headers.get('content-type') || 'application/octet-stream';
    const bytes = await download.arrayBuffer();
    const destPath = `${DEST.url}/storage/v1/object/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
    await fetchWithRetry(destPath, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${destServiceRoleKey}`,
        apikey: destServiceRoleKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    }, `Failed to upload US storage object ${object.bucket_id}/${object.name}`);
    copied += 1;
    if (copied % 50 === 0) log(`Copied ${copied}/${sourceObjects.length} storage objects`);
  }
  log(`Storage copied: ${copied}/${sourceObjects.length}`);
}

async function reconcileUserRolesExactly() {
  const sourceRows = await getRows(SOURCE.ref, 'public', 'user_roles');
  if (!execute) {
    log(`Dry-run user_roles exact reconcile: ${sourceRows.length} source rows`);
    return;
  }
  await dbQuery(DEST.ref, 'truncate table public.user_roles restart identity cascade;', { readOnly: false });
  await insertRows('public', 'user_roles', sourceRows);
  log(`user_roles reconciled exactly: ${sourceRows.length} rows`);
}

async function validate(publicTables) {
  const [sourceCounts, destCounts] = await Promise.all([
    getCounts(SOURCE.ref, publicTables),
    getCounts(DEST.ref, publicTables),
  ]);
  const sourceByTable = new Map(sourceCounts.map((row) => [row.table_name, Number(row.row_count)]));
  const destByTable = new Map(destCounts.map((row) => [row.table_name, Number(row.row_count)]));
  const mismatches = publicTables
    .map((table) => ({ table, source: sourceByTable.get(table) ?? 0, dest: destByTable.get(table) ?? 0 }))
    .filter((row) => row.source !== row.dest);

  const integrity = await dbQuery(DEST.ref, `
    select 'profiles_without_auth_users' as check_name, count(*)::bigint as failures
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
    union all
    select 'user_roles_without_profiles', count(*)::bigint
    from public.user_roles ur
    left join public.profiles p on p.id = ur.user_id
    where p.id is null
    union all
    select 'document_paths_missing_storage', count(*)::bigint
    from public.documents d
    left join storage.objects o on o.bucket_id = 'documents' and o.name = d.file_url
    where d.file_url is not null and d.file_url !~ '^https?://' and o.id is null;
  `);

  log(`Validation mismatched public tables: ${mismatches.length}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, `${RUN_ID}-validation.json`), JSON.stringify({ mismatches, integrity }, null, 2));
  return { mismatches, integrity };
}

async function main() {
  log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  log(`Source is locked read-only: ${SOURCE.name} ${SOURCE.ref}`);
  log(`Destination: ${DEST.name} ${DEST.ref}`);

  const [sourceTables, destTables, sourceStorageObjects, sourceServiceRoleKey, destServiceRoleKey] = await Promise.all([
    getPublicBaseTables(SOURCE.ref),
    getPublicBaseTables(DEST.ref),
    getStorageObjects(SOURCE.ref),
    getServiceRoleKey(SOURCE.ref),
    getServiceRoleKey(DEST.ref),
  ]);

  const bucketIds = [...new Set(sourceStorageObjects.map((object) => object.bucket_id))];
  log(`Source public tables=${sourceTables.length}; source storage objects=${sourceStorageObjects.length}; buckets=${bucketIds.join(', ')}`);

  const destinationBackup = await backupDestinationState(destTables);
  if (!resumeOnly) {
    await reconcileSchema(sourceTables, destTables);
    await resetDestination(sourceTables, bucketIds);
    await copyAuth();
    await copyPublicTables(sourceTables, destinationBackup);
    await reconcileUserRolesExactly();
  }
  await copyStorage(sourceServiceRoleKey, destServiceRoleKey, sourceStorageObjects);

  if (execute) {
    const result = await validate(sourceTables);
    if (result.mismatches.length) {
      throw new Error(`Validation failed: ${result.mismatches.length} public table count mismatches`);
    }
  }

  log('Done');
}

main().catch((error) => {
  console.error(`[sync-br-to-us] ERROR: ${error.stack || error.message}`);
  process.exitCode = 1;
});
