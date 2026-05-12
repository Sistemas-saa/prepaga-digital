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
