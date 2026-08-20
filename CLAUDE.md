# CLAUDE.md — SAMAP Prepaga Digital

> **Guía de contexto para Claude y agentes de IA trabajando en este proyecto.**
> Leer este archivo completo antes de hacer cualquier cambio en el código o en la base de datos.

---

## Identificación del Proyecto

| Campo | Valor |
|---|---|
| **Nombre** | SAMAP Prepaga Digital |
| **Supabase Project ID** | `ejiycfqxgtrzaysgpzmx` |
| **Supabase Nombre** | Seguro Digital CyD |
| **Región** | sa-east-1 (São Paulo) |
| **Frontend URL** | https://prepaga.saa.com.py |
| **GitHub** | https://github.com/DaltonP93/prepaga-digital |
| **Company ID** | `0a1dc0e5-7378-4d14-b7bc-646b3e652bc6` |
| **Stack** | React + TypeScript + Vite + Tailwind + shadcn/ui + Supabase |

---

## ⚠️ REGLA CRÍTICA — NUNCA VIOLAR

### `generate-base-pdf` está administrada externamente

```
❌ NO tocar supabase/functions/generate-base-pdf/index.ts
❌ NO redesplegar generate-base-pdf en ningún deploy de Lovable
❌ NO incluirla en push o CI/CD automático
```

Esta función tiene una implementación específica de producción que usa **tabla HTML con `<thead>/<tfoot>`** para el branding (encabezado y zócalo). Lovable usa `displayHeaderFooter: true` de Puppeteer que **no soporta imágenes base64** en el renderer actual.

Si el branding deja de aparecer en los PDFs, es porque Lovable sobreescribió esta función. Contactar al administrador del sistema para restaurarla.

**Versión correcta de producción: v82+** (estrategia `thead/tfoot`, `displayHeaderFooter: false`, `margin: 0`)

---

## Arquitectura del Sistema

### Stack Backend

- **Supabase** (PostgreSQL 15, Edge Functions Deno, Storage, Auth, Realtime)
- **Renderer PDF**: servicio externo via `RENDER_URL` + `RENDER_KEY` (Puppeteer/Chromium)
- **Firma PAdES**: servicio externo `pades-signer` en Docker
- **WhatsApp**: WAHA (WhatsApp HTTP API) en `https://waha.saa.com.py`
- **Redis**: para caché y jobs

### Infraestructura Docker (Portainer)

| Servicio | Imagen |
|---|---|
| Frontend | `samap-digital-2-prepaga-web:latest` |
| WAHA | `devlikeapro/waha:latest` |
| HTML→PDF renderer | `html2pdf-html2pdf:latest` |
| PAdES signer | `pades-signer-pades-signer:latest` |
| PostgreSQL | `postgres:17` |
| Redis | `redis:7.2-alpine` |
| Portainer | `portainer/portainer-ce:latest` |

---

## Edge Functions — Estado de Producción

| Función | Versión | Notas críticas |
|---|---|---|
| `generate-base-pdf` | **82** | ⚠️ ADMINISTRADA EXTERNAMENTE — no tocar |
| `finalize-signature-link` | 56 | Activa contratada, notifica titular vía WhatsApp |
| `generate-pdf` | 57 | Preview PDF con branding base64 |
| `create-user` | 55 | Timeout 8s en auth.getUser, deduplicación doble-click |
| `signature-otp` | 57 | OTP WhatsApp vía WAHA, API key desde DB |
| `get-document-download-url` | 51 | Prioriza print_versions sobre signed_pdf_url |
| `pades-sign-document` | 49 | Firma PAdES de documentos |
| `generate-evidence-certificate` | 49 | Genera certificado de evidencia |
| `send-whatsapp` | 49 | Envía mensajes vía WAHA usando templates de DB |
| `waha-health-check` | 21 | Health check del servicio WAHA |
| `waha-proxy` | 19 | Proxy para requests a WAHA |
| `bulk-regen` | 4 | Temporal — regeneración bulk de PDFs |

---

## Configuración WAHA / WhatsApp

```
whatsapp_provider = 'qr_session'
whatsapp_api_key = 'c36d16ca62914cc0bb0a1779e02bb27d'
whatsapp_gateway_url = 'https://waha.saa.com.py'
otp_whatsapp_provider = 'qr_session'
otp_whatsapp_gateway_url = 'https://waha.saa.com.py'
```

**Normalización de teléfonos**: Los números paraguayos se guardan **sin el 0 inicial**.
- ✅ Correcto: `984800303`
- ❌ Incorrecto: `0984800303`

Hay triggers automáticos en `signature_links`, `beneficiaries` y `clients` que eliminan el `0` inicial al guardar.

---

## Flujo de Firma de Documentos

```
1. Titular firma (step_order=1)
   → DDJJ del titular: generate-base-pdf → pades-sign-document
   → Contrato: NO se genera todavía

2. Adherentes firman (step_order=1, cada uno su DDJJ)
   → DDJJ del adherente: generate-base-pdf → pades-sign-document

3. Todos step_order=1 completados:
   → Se activa signature_link de la contratada (step_order=2)
   → WhatsApp AUTOMÁTICO a la contratada con su link de firma

4. Contratada firma (step_order=2):
   → Contrato: base_pdf_url = null → generate-base-pdf (con firma contratada) → pades-sign-document
   → WhatsApp AUTOMÁTICO al TITULAR con link de descarga del contrato completo (válido 7 días)
```

**Importante**: El CONTRATO solo se genera cuando firma la CONTRATADA — necesita incluir el bloque de firma de la contratada en el HTML antes de sellar el PDF.

---

## Storage — Estructura de Paths

```
documents/contracts/base/{sale_id}/{doc_id}.pdf          → antes de firmar
documents/contracts/signed/{sale_id}/{doc_id}.pdf        → firmado PAdES (NUNCA sobreescribir)
documents/contracts/print-versions/{sale_id}/{doc_id}/v{N}.pdf → versiones admin con branding
company-assets/{company_id}/branding/{timestamp}.png     → logos/branding de empresa
```

---

## Branding PDF (Encabezado y Zócalo)

Las imágenes se configuran en `company_settings`:
```
pdf_header_image_url = URL de Supabase Storage (bucket público)
pdf_footer_image_url = URL de Supabase Storage (bucket público)
```

**Cómo funciona `generate-base-pdf` v82:**
1. Lee las URLs de `company_settings`
2. Descarga las imágenes y las convierte a `data:base64`
3. Las incluye en una tabla HTML con `<thead>` (header) y `<tfoot>` (footer)
4. `thead/tfoot` se repiten en cada página del PDF automáticamente
5. `displayHeaderFooter: false` — Puppeteer NO controla el header/footer
6. `margin: 0` — la tabla cubre toda la página A4

**Por qué NO usar `displayHeaderFooter: true`**: El renderer actual no soporta imágenes `data:base64` en `headerTemplate/footerTemplate`. Solo renderiza texto.

---

## Versiones de Impresión (`document_print_versions`)

Tabla que registra versiones del PDF con branding generadas por admins:

```sql
id, document_id, sale_id, version_number, pdf_url, pdf_hash,
is_current, reason, generated_by, created_at
```

- Solo puede haber **una** `is_current = true` por documento (constraint UNIQUE PARTIAL)
- `get-document-download-url` prioriza la print_version actual sobre `signed_pdf_url`
- El botón "Regenerar con Encabezado" en el admin llama a `generate-base-pdf` con `admin_regeneration: true`

---

## Roles del Sistema

| Rol | Permisos |
|---|---|
| `super_admin` | Todo — puede eliminar cualquier venta, ver todos los perfiles |
| `admin` | Gestión completa de su empresa |
| `supervisor` | Supervisión de ventas y documentos de su empresa |
| `auditor` | Auditoría de ventas |
| `gestor` | Gestión operativa |
| `vendedor` | Carga ventas, puede auditar y aprobar sus propias ventas |

**Importante**: El `vendedor` puede auditar y aprobar sus propias ventas (las que él cargó, donde `salesperson_id = auth.uid()`).

---

## Usuarios del Sistema

| Email | Rol |
|---|---|
| cacosta.ma@gmail.com | super_admin |
| dalton9302@gmail.com | super_admin |
| admin.samap@hotmail.com | admin |
| eder.arguello@samap.com.py | admin |
| dalton.perez@saa.com.py | auditor |
| sistemas@saa.com.py | vendedor |
| vendedor@saap.com.py | vendedor |

---

## Variables de Entorno Requeridas

```env
SUPABASE_URL=https://ejiycfqxgtrzaysgpzmx.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
RENDER_URL=<URL del renderer PDF>
RENDER_KEY=<API key del renderer>
STORAGE_BUCKET=documents
PUBLIC_APP_URL=https://prepaga.saa.com.py
BOOTSTRAP_SECRET=<secreto para crear super admin inicial>
```

---

## Tablas Principales de la DB

| Tabla | Descripción |
|---|---|
| `sales` | Ventas / contratos |
| `clients` | Titulares de los contratos |
| `beneficiaries` | Adherentes (cónyuge, hijos, etc.) |
| `documents` | Documentos generados (contratos, DDJJ) |
| `document_print_versions` | Versiones PDF con branding |
| `signature_links` | Links de firma con token JWT |
| `signatures` | Firmas electrónicas capturadas |
| `signature_events` | Eventos del flujo de firma |
| `signature_evidence_bundles` | Paquetes de evidencia |
| `templates` | Plantillas de documentos (HTML) |
| `template_versions` | Versiones históricas de plantillas |
| `company_settings` | Configuración por empresa (branding, WAHA, etc.) |
| `companies` | Empresas (multi-tenant) |
| `profiles` | Perfiles de usuario |
| `user_roles` | Roles por usuario |
| `notifications` | Notificaciones internas |
| `sale_workflow_states` | Estados del flujo de ventas |
| `whatsapp_messages` | Log de mensajes WhatsApp enviados |
| `whatsapp_templates` | Templates de mensajes WhatsApp |
| `audit_logs` | Log de auditoría general |
| `process_traces` | Trazas de procesos |
| `hash_anchors` | Anclas de hash para evidencia |

---

## Índices de Performance Aplicados

```sql
idx_templates_company_updated       ON templates(company_id, updated_at DESC)
idx_templates_active_company        ON templates(is_active, company_id)
idx_template_versions_template_created ON template_versions(template_id, created_at DESC)
idx_documents_sale_created          ON documents(sale_id, created_at DESC)
idx_documents_final_type            ON documents(is_final, document_type)
idx_document_print_versions_document_id ON document_print_versions(document_id)
idx_document_print_versions_sale_id ON document_print_versions(sale_id)
uq_document_print_versions_current  UNIQUE PARTIAL ON document_print_versions(document_id) WHERE is_current=true
idx_signature_links_sale            ON signature_links(sale_id)
idx_signature_links_status          ON signature_links(status)
```

---

## FK en Cascada (para DELETE de ventas)

Las siguientes tablas tienen `ON DELETE CASCADE` desde `sales`:

- `documents` → CASCADE
- `beneficiaries` → CASCADE
- `signature_links` → CASCADE
- `signatures` → CASCADE
- `signature_events` → CASCADE
- `signature_evidence_bundles` → CASCADE
- `hash_anchors` → CASCADE (desde `signature_evidence_bundles`)
- `legal_evidence_certificates` → CASCADE
- `document_print_versions` → CASCADE
- `whatsapp_messages` → SET NULL
- `sale_workflow_states` → (tiene RLS con policies)

---

## Consideraciones de RLS

- `auditor_sales_view` usa `security_invoker = true`
- `sales_completed_view` filtra solo estados productivos (excluye borrador, enviado, pendiente, rechazado, cancelado)
- Los perfiles de la misma empresa son visibles entre usuarios del mismo `company_id`
  - Esto depende de la política `profiles_select_same_company_or_admin` en `profiles`. Si esa política desaparece (queda solo `... select own`), todo query de perfil ajeno devuelve 0 filas y rompe el front (ver Bug Conocido #5). Restaurar con el SQL del bug #5.
- El vendedor solo puede ver/editar sus propias ventas

---

## Bugs Conocidos del Frontend (Lovable)

### 1. Fechas de nacimiento (timezone off-by-1)
Al parsear fechas ISO (`"1981-05-09"`) con `new Date()`, JavaScript lo interpreta como UTC medianoche y en Paraguay (UTC-4) retrocede un día.

**Fix**: Usar `dateStr.split('-')` para parsear, nunca `new Date(dateStr)`.

### 2. `generate-base-pdf` sobreescrita en cada deploy
Cada deploy de Lovable sobreescribe la función con su versión que no funciona con el renderer.

**Fix**: El administrador del sistema debe restaurar la función v82 después de cada deploy de Lovable.

### 3. Nombre del firmante en minúscula
Al escribir el bloque de firma en `documents.content`, el nombre del firmante a veces se lowercasea.

**Fix**: Preservar las mayúsculas de `clients.first_name` + `clients.last_name` sin ninguna transformación.

### 4. Beneficiario titular duplicado
Al crear ventas, el sistema puede agregar al titular como beneficiario con `relationship = 'Titular'`, lo que genera un signature_link de adherente fantasma.

**Fix**: No crear beneficiarios con `relationship = 'Titular'` — el titular ya está en `sales.client_id`.

### 5. RLS de `profiles` se reduce a "solo mi perfil" → 406 y pantalla en blanco

**Síntoma**: La consola se inunda de `GET /rest/v1/profiles?select=first... 406 (Not Acceptable)` y al hacer clic en "Gestionar Firma" (u otras vistas que muestran el vendedor) la página se queda igual / en blanco.

**Causa**: Un deploy o migración deja en `profiles` solo la política `... select own` (`user_id = auth.uid()`). Entonces leer el perfil de **otro** usuario (ej. el vendedor de una venta ajena) devuelve 0 filas; con `.single()` PostgREST responde **406** y el query de la venta lanza, dejando `selectedSale` vacío.

**Fix (2 capas, defensa en profundidad)**:

1. **DB** — restaurar las 3 políticas (no borran datos). Optimizadas con `(select auth.uid())`
   para no disparar los advisors `auth_rls_initplan` / `multiple_permissive_policies`:
```sql
-- INSERT propio
DROP POLICY IF EXISTS "DebtOut profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = (select auth.uid()));

-- SELECT: propio + misma empresa + super_admin (arregla 406 y nombres en blanco)
DROP POLICY IF EXISTS "DebtOut profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_same_company_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_same_company_or_admin"
ON public.profiles FOR SELECT
USING (
  user_id = (select auth.uid())
  OR (company_id IS NOT NULL AND company_id = (select public.get_user_company_id((select auth.uid()))))
  OR (select public.get_user_role((select auth.uid()))) = 'super_admin'::app_role
);

-- UPDATE: admin/super_admin editan/desactivan usuarios de su empresa
-- (sin esto, useUpdateUser/useDeleteUser actualizan 0 filas EN SILENCIO).
DROP POLICY IF EXISTS "DebtOut profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin_same_company" ON public.profiles;
CREATE POLICY "profiles_update_admin_same_company"
ON public.profiles FOR UPDATE
USING (
  user_id = (select auth.uid())
  OR (select public.get_user_role((select auth.uid()))) = 'super_admin'::app_role
  OR ((select public.get_user_role((select auth.uid()))) = 'admin'::app_role
      AND company_id IS NOT NULL AND company_id = (select public.get_user_company_id((select auth.uid()))))
)
WITH CHECK (
  user_id = (select auth.uid())
  OR (select public.get_user_role((select auth.uid()))) = 'super_admin'::app_role
  OR ((select public.get_user_role((select auth.uid()))) = 'admin'::app_role
      AND company_id IS NOT NULL AND company_id = (select public.get_user_company_id((select auth.uid()))))
);
```
> Nota: la creación de usuarios la hace la edge function `create-user` con service role (bypassa RLS).
> Las viejas políticas `DebtOut profiles ...` (de otra app que comparte el proyecto) se reemplazan;
> el acceso "propio" queda cubierto por `user_id = (select auth.uid())` en cada política.
2. **Front** — leer perfiles de solo-visualización con `.maybeSingle()` (nunca `.single()`) y degradar con gracia (ya aplicado en `useSale.ts` y `useSales.ts`). Así, aunque la RLS se rompa de nuevo, la página no se queda en blanco.

### 6. Warnings de performance de Supabase (`auth_rls_initplan` + `duplicate_index`)

**Síntoma**: El panel de advisors de Supabase muestra cientos de warnings de performance.

**Limpieza aplicada (2026-05, sin pérdida de datos, sin cambio de comportamiento)**:

- **`auth_rls_initplan`** (eran 164 en ~78 tablas): toda llamada `auth.uid()` dentro de las
  políticas RLS se envolvió en un sub-select `(select auth.uid())`. Esto hace que Postgres la
  evalúe **una vez por query** (InitPlan) en lugar de **una vez por fila**. Es puramente de
  performance: la lógica de acceso es idéntica (`auth.uid()` es STABLE). Se aplicó con
  `ALTER POLICY` (no DROP/CREATE → nunca hay una ventana sin la política). Verificación:
  `0 políticas con auth.uid() sin envolver`.
- **`duplicate_index`** (eran 4): se eliminaron índices byte-idénticos redundantes con
  `DROP INDEX CONCURRENTLY`, conservando el documentado de cada par
  (`audit_comments`: se quedó `_sale_id`/`_user_id`; `document_print_versions`: se quedó
  `idx_document_print_versions_document_id`/`_sale_id`). Cada FK conserva exactamente un índice.
- También se envolvió `current_setting('request.headers', true)` en `(select ...)` en las 2
  políticas públicas por token de `signature_links` (acceso anónimo del firmante intacto).

**Resultado**: warnings de performance ~498 → ~326. Los 168 eliminados son 100% behavior-preserving.

> **Qué NO se tocó (a propósito, son invasivos / cambian semántica)**:
> - `unindexed_foreign_keys` (86): agregar índices es invasivo y puede no aportar nada si la FK no se filtra.
> - `unused_index` (34): las estadísticas pueden engañar; borrar un índice puede degradar queries reales.
> - `multiple_permissive_policies` (205): fusionar políticas cambia la lógica de seguridad → riesgo alto.
> - `auth_db_connections_absolute` (1): informativo, no accionable por SQL.

> ⚠️ Si un deploy de Lovable o una migración vuelve a dejar `auth.uid()` "desnudo" en las políticas,
> los warnings `auth_rls_initplan` reaparecen. Re-aplicar el envoltorio con el `DO` block que recorre
> `pg_policies` y reemplaza `auth.uid()` → `(select auth.uid())` vía `ALTER POLICY` (ejecutar por
> `execute_sql`, NO por `apply_migration` — esa capa rompe los backslashes del regex).

### 7. Firmante anónimo → `42501 permission denied for table profiles` ("Enlace no válido")

**Síntoma**: Al abrir un enlace de firma válido (`/firmar/{token}`), la página muestra
**"Enlace no válido, ha expirado o ya fue utilizado"** aunque el `signature_link` esté
`pendiente`, `is_active=true` y NO expirado. La consola muestra
`Error fetching sale data: {code: '42501', message: 'permission denied for table profiles'}`
y `401` en `GET /rest/v1/sales?select=...`.

**Causa (NO es por el wrap de `auth.uid()` — el form "desnudo" falla igual)**: El firmante
público usa el rol **`anon`** (`useSignatureLinkPublic.ts`, cliente con la publishable key +
header `x-signature-token`). La consulta de `sales` (y sus embeds `clients`, `companies`,
`beneficiaries`, `plans`) evalúa políticas RLS `TO public` como **"Users can view company sales"**,
cuyo `USING` referencia `profiles` con un subquery (`company_id IN (SELECT company_id FROM profiles ...)`).
Postgres verifica el privilegio sobre `profiles` **en tiempo de plan** para cualquier política
aplicable, y `anon` **no tenía** `GRANT SELECT` sobre `profiles` (sí lo tiene sobre `sales`,
`clients`, etc.) → `42501`. El grant de `anon` sobre `profiles` se perdió en algún deploy/migración.

**Fix (1 línea, sin cambiar lógica ni exponer datos)**:
```sql
GRANT SELECT ON public.profiles TO anon;
```
Es seguro: `profiles` tiene RLS activo y sus 3 políticas exigen `auth.uid()` (que es `NULL` para
`anon`), por lo que **`anon` sigue viendo 0 filas de `profiles`** (verificado). El grant solo
permite que el chequeo de permisos en tiempo de plan pase, para que el disyunto del token
(`id = get_sale_id_from_signature_token()`) haga visible la venta. Verificación como `anon` con
el header del token: `profiles` visibles = 0, `sales/clients/companies/beneficiaries` = 1.

> ⚠️ Si la firma pública vuelve a romperse con `42501 permission denied for table profiles`,
> re-aplicar el `GRANT SELECT ON public.profiles TO anon;`. Alternativa más quirúrgica (no aplicada):
> scopear las políticas "company" `{public}` que referencian `profiles` a `{authenticated}` — pero
> son muchas (sales, clients, companies, beneficiaries, documents...) y el GRANT las arregla todas.

### 8. "Disk IO Budget depleting" / CPU-RAM altas en `t4g.micro` (Realtime + polling 24/7)

**Síntoma**: El panel muestra **"Project is depleting its Disk IO Budget"**, CPU/RAM ~59% y
~48k **Database Requests/24h** con una barra **constante todo el día** (incluso de madrugada),
aunque la actividad de negocio sea mínima.

**Diagnóstico (con `pg_stat_statements`)**: La base está ocupada **~0,4%** — NO está
sobrecargada. El mayor consumidor (≈49% del tiempo) es el **poller de Supabase Realtime
leyendo el WAL** (`SELECT wal->>... `), que sondea sin parar **mientras haya una suscripción
Realtime activa**. El segundo es el **polling REST** del Flujo de Firmas. El cuello de botella
real es el **presupuesto de E/S (IOPS) del `t4g.micro`**, drenado por ese goteo constante.

**Causa raíz**: `useRealTimeNotifications` (montado en `NotificationCenter`, presente en TODAS
las páginas) abre un canal con ~17 suscripciones `postgres_changes`. Cualquier pestaña logueada
abierta —aunque esté en segundo plano— mantenía a Realtime sondeando el WAL las 24 h.

**Fix aplicado (código, sin costo, sin tocar la DB)**:
- `useRealTimeNotifications.ts`: la suscripción Realtime ahora se **suelta cuando la pestaña
  está oculta** (`visibilitychange`) y se retoma al volver. Es el cambio decisivo (es global).
- `SignatureWorkflow.tsx`: idem para su canal Realtime; además el polling de respaldo bajó de
  **10s → 60s** y se omite con la pestaña oculta.

> ⚠️ Si Lovable revierte estos archivos y el warning de E/S reaparece: re-aplicar el pausado por
> `document.visibilityState`/`visibilitychange` en ambos. Mitigación operativa inmediata: **no
> dejar pestañas del sistema abiertas 24/7**. Si aun así persiste con uso real alto, recién ahí
> evaluar subir de `MICRO` → `SMALL` (más IOPS base) — es lo único que cuesta dinero.

### 9. Desarrollo local pegaba contra PRODUCCIÓN (causa real del consumo 24/7)

**Síntoma**: Carga constante 24/7 en la base productiva (Realtime + polling) incluso de
madrugada, sin usuarios reales. Causa: el **entorno local** (`npm run dev`) se conectaba a la
base de **producción** porque `src/integrations/supabase/client.ts` tenía la URL/anon-key de
prod **hardcodeadas** (no leía variables de entorno). Dejar el dev server local levantado =
mandar Realtime/polling a prod sin querer.

**Fix aplicado**: `client.ts` usa los valores de prod hardcodeados en **cualquier `vite build`**
(producción), y SOLO en `vite dev` (`import.meta.env.DEV === true`) permite sobreescribir con
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` desde `.env.local`. Así es **imposible** que
un build de producción (Docker/Lovable, modos default/us/br) apunte a otra base por accidente.
Verificado en el bundle (`npm run build`): solo aparece la URL de prod (ejiy) como conexión;
`.env.local`/localhost NO se filtran al build (`.dockerignore` excluye `*.local`).

**Cómo aislar dev de prod en tu máquina** (elegir UNA opción):
- **Supabase local (recomendado, ya hay `supabase/config.toml`)**: `supabase start` levanta
  Postgres+API locales; tomar la URL (`http://localhost:54321`) y la anon key que imprime, y
  ponerlas en `.env.local` (ya ignorado por `*.local` en `.gitignore`).
- **Proyecto Supabase de dev aparte (free)**: crear otro proyecto y poner sus URL/anon-key en
  `.env.local`.

`.env.local` tiene prioridad sobre `.env` en Vite, así que `npm run dev` usará la base de dev.
Mitigación inmediata sin setup: **no dejar `npm run dev` corriendo** apuntando a prod.

> ⚠️ La clave que aparece en `client.ts`/`.env` es la `anon` **pública** (protegida por RLS), no
> es un secreto. NO poner nunca la `service_role` key en el front ni en archivos versionados.

### 10. Contrato final SIN la firma del titular + HTML corrupto `<div <div` + contratos duplicados

**Síntoma**: una venta muestra **varios contratos "finales"** (caso real: 2026-000207 con 5, y hasta
20 filas de contrato) y en todos el bloque de firma dice solo *"Firmado electrónicamente por: Eder
Arguello / CONTRATADA"* — **la firma del cliente no aparece**. El HTML de esos documentos contiene el
literal roto `<div <div class="text-center...">Firma del Cliente</div>`.

**Causa A — regex que se comía el `>` de cierre** (`src/hooks/useSignatureLinkPublic.ts`):
```ts
// ❌ ANTES: [^<]* consume TODO hasta el siguiente '<', incluido el '>' de la etiqueta
const rawAttrRegex = /data-signature-field\s*=\s*["']true["'][^<]*/gi;
```
Sobre un placeholder no reemplazado `<div data-signature-field="true" ... style="...">` borraba los
atributos **y el `>`**, dejando `<div ` sin cerrar. Solo dañaba el campo que NO había sido
reemplazado, por eso aparecía únicamente cuando firmaba la contratada sobre un contrato sin la firma
del titular. **Fix**: usar `[^<>]*` + una guarda que descarta el replace si el resultado matchea
`/<\w+\s+</`.

**Causa B — fallback que reconstruía el contrato desde la plantilla en blanco**: si la búsqueda del
contrato final del titular no encontraba nada, el código caía en un fallback que borraba los finales y
rearmaba la firma de la contratada sobre el contrato **v1 sin firmar**. El gatillo era
`useSignatureLinks.ts` (`useResendSignatureLink`, rama titular), que hacía
`update({ is_final: false })` sobre **todos** los documentos generados, incluidos los ya firmados.
**Fix**: (1) la búsqueda ya no filtra por `is_final`, elige el contrato cuyo `content` contenga
`data-signer="titular"`; (2) con `recipientType === 'contratada'` y merge fallido se **lanza un error
visible** en vez de borrar y regenerar, revirtiendo antes el CAS del `signature_link` para que la
contratada pueda reintentar; (3) el reset del reenvío usa
`.or('is_final.is.null,is_final.eq.false')` — ojo: `.neq('is_final', true)` NO alcanza las filas
con `is_final IS NULL`, porque en SQL `NULL <> true` es NULL.

**Causa C — "Enviar documentos" no era idempotente** (`SaleTemplatesTab.tsx`): `insert` plano sin
candado; N clics = N contratos + N anexos + N signature_links. **Fix**: helper compartido
`deleteUnsignedGeneratedDocuments()` (el mismo que ya usaba "Regenerar"), llamado también desde
`handleSendDocuments` con el orden **validar → construir en memoria → borrar → insertar**, más un
`useRef` anti-doble-clic y deduplicación de `signature_links`.

> ⚠️ Las guardas `.is('signature_data', null)` y `.is('signed_at', null)` del helper son
> **load-bearing**, no redundantes: `finalize-signature-link` sella con PAdES la DDJJ de adherente
> aunque tenga `is_final` false/null, y `pades-sign-document` recién al final setea `signed_pdf_url`.
> En ese intervalo el documento sería borrable y se perdería evidencia de una firma real.

**Candado en DB** (sobrevive a un revert de Lovable):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_contrato_final_por_venta
  ON public.documents (sale_id)
  WHERE document_type = 'contrato' AND is_final = true AND beneficiary_id IS NULL;
```

**Queries de detección** (deben dar 0):
```sql
-- HTML corrupto
SELECT count(*) FROM documents WHERE document_type='contrato' AND is_final=true AND content LIKE '%<div <%';
-- Contrato final sin la firma del titular
SELECT count(*) FROM documents WHERE document_type='contrato' AND is_final=true
  AND content LIKE '%data-signer="contratada"%' AND content NOT LIKE '%data-signer="titular"%';
-- Más de un contrato final por venta
SELECT count(*) FROM (SELECT sale_id FROM documents WHERE document_type='contrato' AND is_final=true
                      GROUP BY 1 HAVING count(*)>1) t;
-- Bloque de contratada duplicado dentro del mismo documento
SELECT count(*) FROM documents WHERE is_final=true
  AND (length(content)-length(replace(content,'data-signer="contratada"','')))/24 > 1;
```

**Notas de la reparación (2026-08-20)**: se repararon 6 ventas (2026-000207, 000109, 000214, 000182,
000033, 000005) creando un documento **nuevo** con el contenido correcto en vez de reutilizar ids
existentes, para no sobrescribir ningún PDF ya sellado en `contracts/signed/`. Los duplicados se
**archivaron** (`is_final=false` + sufijo `(ANULADO - duplicado)`), no se borraron. Backup completo en
la tabla `documents_backup_20260820`. El trigger `trg_protect_closed_sale_documents` bloquea
desmarcar `is_final` en ventas cerradas: para la reparación hay que deshabilitarlo y **reactivarlo
dentro de la misma transacción**.

> ⚠️ Ese mismo trigger también neutraliza la reconciliación automática que hace el flujo de firma
> (marcar `is_final=false` los contratos sobrantes tras el merge de la contratada): falla y queda
> logueada en consola. No es grave — la prevención real es la idempotencia de la Causa C — pero
> tenerlo presente si aparece ese `console.error`.

---

## Comandos Útiles

### Restaurar generate-base-pdf (cuando Lovable la sobreescribe)

**Síntoma**: Los PDFs salen sin encabezado ni zócalo.
**Causa**: Lovable usa `displayHeaderFooter: true` en el renderer, que no soporta imágenes base64. La versión correcta de producción (v82+) usa **tabla HTML con `<thead>/<tfoot>`** y `displayHeaderFooter: false`.

Hay 3 caminos para restaurarla, en orden de preferencia:

#### Opción A — Pedírselo a Claude (más simple)
Decirle: **"Restaurá generate-base-pdf"**

Claude tiene el código correcto guardado en contexto y lo redespliega usando la API de Supabase MCP (`mcp__supabase__deploy_edge_function`) en ~30 segundos.

#### Opción B — Supabase CLI (recomendada si Claude no está disponible)

Tener el código correcto guardado localmente y desplegar con:

```bash
supabase functions deploy generate-base-pdf \
  --project-ref ejiycfqxgtrzaysgpzmx \
  --no-verify-jwt
```

#### Opción C — Script de restauración rápida

Crear `restore-generate-pdf.sh`:

```bash
#!/bin/bash
echo "Restaurando generate-base-pdf v82 (thead/tfoot con branding)..."

supabase functions deploy generate-base-pdf \
  --project-ref ejiycfqxgtrzaysgpzmx \
  --no-verify-jwt \
  --import-map ./supabase/functions/generate-base-pdf/deno.json

echo "✅ Función restaurada correctamente"
```

Ejecutar: `bash restore-generate-pdf.sh`

**Verificación post-restore**: generar un PDF de prueba y confirmar que el encabezado/zócalo aparecen. Si no aparecen, la versión desplegada NO es la correcta — revisar que el archivo local tenga `displayHeaderFooter: false` y `margin: 0` con tabla `thead/tfoot`.

> ⚠️ **No commitear cambios a `supabase/functions/generate-base-pdf/index.ts`** después de restaurar. La fuente de verdad es la **versión desplegada**, no el archivo del repo. Si el archivo local difiere de v82+, descartar los cambios locales con `git checkout supabase/functions/generate-base-pdf/`. Restaurar ≠ modificar.

### Regenerar PDFs con branding
```
GET https://ejiycfqxgtrzaysgpzmx.supabase.co/functions/v1/bulk-regen
```
(Actualizar la lista de document_ids en la función `bulk-regen` antes de ejecutar)

### Ver estado de la DB
```sql
SELECT 
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as activas,
  (SELECT count(*) FROM pg_stat_activity) as total,
  pg_size_pretty(pg_database_size('postgres')) as db_size;
```

---

## Protocolo de Trabajo con Múltiples Agentes (OBLIGATORIO)

> Para CUALQUIER corrección o cambio no trivial, seguir el flujo de 6 fases
> definido en [AGENTS.md](AGENTS.md#protocolo-de-trabajo--múltiples-agentes-obligatorio).

**Resumen rápido**:

1. **Analizar** — agente `Explore` mapea el bug e inventaria puntos afectados.
2. **Planificar** — agente `Plan` diseña estrategia, orden, riesgos.
3. **Desarrollar** — agente implementa.
4. **Testear** — agente `Explore` **independiente** verifica regresiones.
5. **Corregir** — aplicar lo que el test encontró.
6. **Deploy** — el agente principal hace migration + commit + push (no se delega infra).

**Reglas clave**:

- Paralelizar agentes cuando son independientes (una sola tool call con múltiples `Agent` blocks).
- Cada prompt de agente debe ser **autocontenido**: paths absolutos, líneas exactas, qué reportar, límite de palabras.
- El agente de Fase 4 (Test) **NO puede ser el mismo** que hizo Fase 3 (Develop).
- Cambios triviales (1 línea, typo, rename obvio) están exentos.
- Fixes en **defensa en profundidad** siempre que se pueda (UI + lógica + DB constraint).
- Datos sensibles (DB writes, migrations, push) los maneja el agente principal, no se delegan.

Ver detalles completos, ejemplos y tabla de "aplica/no aplica" en [AGENTS.md](AGENTS.md).

---

## Configuración de la Contratada

```
contratada_signer_name: Eder Arguello González
contratada_signer_dni: 3616083
contratada_signature_mode: link
contratada_signer_phone: 976122957
```
