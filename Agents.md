# Agents.md — SAMAP Prepaga Digital

> **Instrucciones de comportamiento para agentes de IA (Claude, Lovable, Copilot, etc.)
> trabajando en este proyecto.**

---

## Reglas Absolutas (NUNCA violar)

### 🔴 NUNCA tocar `generate-base-pdf`

```
PROHIBIDO modificar el código: supabase/functions/generate-base-pdf/index.ts
PROHIBIDO incluir en CI/CD: push hooks, deploy automatizado, scripts de build
PROHIBIDO commitear cambios al archivo local — la versión desplegada es la
fuente de verdad, no el archivo del repo.

PERMITIDO solamente: RESTAURAR la versión v82+ correcta cuando Lovable
la pise. "Restaurar" significa redesplegar la versión conocida-buena
v82+ (thead/tfoot, displayHeaderFooter:false). NO es modificación.
Ver procedimiento en "Diagnóstico de Problemas Comunes → PDFs sin
encabezado/zócalo".
```

Esta función está administrada externamente. Tiene una implementación específica
que usa `<thead>/<tfoot>` HTML para repetir header/footer en PDFs.
La versión del repo ES INCOMPATIBLE con el renderer de producción.

Si necesitás modificar la generación de PDFs, consultar al administrador del sistema
antes de hacer cualquier cambio.

---

### 🔴 NUNCA guardar fechas con `new Date(dateString)` para fechas sin hora

```typescript
// ❌ MAL — introduce bug de timezone (off-by-1 day en Paraguay UTC-4)
const date = new Date("1981-05-09")
const iso = date.toISOString() // → "1981-05-08T20:00:00.000Z" en PY

// ✅ BIEN — guardar el string directamente del input
const dateInput = form.birth_date // → "1981-05-09"
await supabase.from('clients').insert({ birth_date: dateInput })
```

```typescript
// ❌ MAL — mostrar fecha con timezone
const display = new Date(record.birth_date).toLocaleDateString('es-PY')

// ✅ BIEN — parsear sin conversión
const [year, month, day] = record.birth_date.split('-')
const display = `${day}/${month}/${year}`
```

---

### 🔴 NUNCA crear beneficiarios con `relationship = 'Titular'`

El titular ya está referenciado en `sales.client_id`. Solo van en `beneficiaries`
las personas que son adherentes reales (cónyuge, hijo, padre, etc.).

Si se crea un beneficiario "titular", el sistema genera un signature_link de
adherente fantasma y el flujo de firmas queda roto.

---

### 🔴 NUNCA lowercasear el nombre del firmante

Al escribir el bloque de firma en `documents.content`:

```typescript
// ❌ MAL
const signerBlock = `Firmado electrónicamente por: <strong>${name.toLowerCase()}</strong>`

// ✅ BIEN — preservar capitalización original de la DB
const signerBlock = `Firmado electrónicamente por: <strong>${name}</strong>`
```

---

## Reglas de Comportamiento para Agentes

### Antes de hacer cualquier cambio

1. Leer `CLAUDE.md` para entender el contexto completo
2. Si el cambio afecta edge functions, verificar si es una de las administradas externamente
3. Si el cambio afecta RLS, verificar que no crea recursión infinita (ver nota abajo)
4. Si el cambio afecta la tabla `sales`, verificar que no rompe el flujo de firma

### Al modificar políticas RLS en `profiles`

```sql
-- ❌ MAL — genera recursión infinita
-- profiles RLS → subconsulta a sales → sales RLS → subconsulta a profiles → ♾️
CREATE POLICY "test" ON profiles FOR SELECT
USING (id IN (SELECT salesperson_id FROM sales WHERE ...));

-- ✅ BIEN — usar funciones SECURITY DEFINER que no pasan por RLS
CREATE POLICY "test" ON profiles FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));
```

### Al crear políticas RLS

Siempre verificar que incluyen todos los roles necesarios:
- `super_admin` — acceso total
- `admin` — su empresa
- `supervisor`, `auditor`, `gestor` — su empresa con restricciones
- `vendedor` — sus propias ventas/recursos

### Al modificar el flujo de firma

El orden de firma es estricto:
1. `step_order = 1`: titular + adherentes (en paralelo)
2. `step_order = 2`: contratada (se activa SOLO cuando todos del step 1 completaron)

El contrato (`document_type = 'contrato'`) se genera cuando firma la contratada.
Las DDJJ (`document_type = 'ddjj_salud'`) se generan cuando firma cada titular/adherente.

### Al modificar templates de documentos

- NO agregar campos de fecha automáticos que no estén en el template
- Los campos dinámicos usan sintaxis `{{variable.subvariable}}`
- El bloque de firma se inyecta automáticamente, no hardcodearlo en el template

### Al modificar la tabla `beneficiaries`

```typescript
// Al mostrar el teléfono del adherente
const phone = beneficiary.phone // ya viene sin el 0 inicial por trigger automático

// Al guardar teléfono (el trigger lo normaliza, pero igual enviarlo sin 0)
const phoneToSave = phone.replace(/^0+/, '')
```

---

## Flujo de Trabajo Recomendado para Agentes

### Para cambios en frontend (Lovable)

1. Hacer el cambio en el editor de Lovable
2. **NO** tocar nada en `supabase/functions/generate-base-pdf/`
3. Antes de hacer deploy, verificar que `generate-base-pdf` no está en los archivos modificados
4. Después del deploy, si los PDFs pierden el branding → avisar al administrador

### Para cambios en DB (migraciones)

1. Crear migración con nombre descriptivo en snake_case
2. Siempre usar `IF NOT EXISTS` / `IF EXISTS` para idempotencia
3. Para DDL usar `apply_migration`, para queries usar `execute_sql`
4. Después de crear/modificar tablas con RLS, correr `get_advisors(type='security')`

### Para cambios en edge functions

1. Verificar que la función NO está en la lista de administradas externamente
2. Hacer el cambio
3. Desplegar con `verify_jwt: false` para las funciones que lo requieren
4. Probar con un curl o desde la app

---

## Diagnóstico de Problemas Comunes

### PDFs sin encabezado/zócalo

**Síntoma**: Los contratos y DDJJ se generan SIN logo de encabezado y SIN zócalo. El cuerpo del PDF está bien, pero falta el branding de la empresa.

**Causa**: Lovable sobreescribió `generate-base-pdf` con su versión que usa `displayHeaderFooter: true`. El renderer Puppeteer/Chromium actual **no soporta imágenes `data:base64`** en `headerTemplate/footerTemplate` — solo renderiza texto. Por eso desaparece el branding.

**Diagnóstico**:
1. Ver versión actual de la función:
   ```
   mcp__supabase__get_edge_function(name='generate-base-pdf')
   ```
2. Si usa `displayHeaderFooter: true` o `headerTemplate`/`footerTemplate` → fue sobreescrita.
3. La versión correcta (v82+) tiene:
   - `displayHeaderFooter: false`
   - `margin: 0`
   - Una **tabla HTML con `<thead>` y `<tfoot>`** que contiene las imágenes en `data:base64`
   - `thead/tfoot` se repiten automáticamente en cada página del PDF

**Restauración** — 3 caminos posibles, en orden de preferencia:

#### A) Vía Claude (recomendado, ~30 segundos)
Pedirle a Claude: **"Restaurá generate-base-pdf"**. El agente principal tiene el código correcto y lo redespliega con `mcp__supabase__deploy_edge_function`.

#### B) Supabase CLI
```bash
supabase functions deploy generate-base-pdf \
  --project-ref ejiycfqxgtrzaysgpzmx \
  --no-verify-jwt
```
(Requiere tener el código correcto local en `supabase/functions/generate-base-pdf/index.ts`).

#### C) Script de restauración

```bash
#!/bin/bash
# restore-generate-pdf.sh
echo "Restaurando generate-base-pdf v82 (thead/tfoot con branding)..."

supabase functions deploy generate-base-pdf \
  --project-ref ejiycfqxgtrzaysgpzmx \
  --no-verify-jwt \
  --import-map ./supabase/functions/generate-base-pdf/deno.json

echo "✅ Función restaurada correctamente"
```

Ejecutar: `bash restore-generate-pdf.sh`

**Verificación post-restore**:
1. Generar un PDF de prueba (cualquier contrato existente).
2. Confirmar que aparecen el encabezado (`pdf_header_image_url`) y zócalo (`pdf_footer_image_url`) de `company_settings`.
3. Si NO aparecen → la versión desplegada no es la correcta. Revisar que el archivo local tenga:
   - `displayHeaderFooter: false`
   - `margin: 0`
   - Tabla con `<thead>`/`<tfoot>` conteniendo `<img src="data:image/png;base64,..." />`

**Para agentes**:
- ⚠️ NUNCA hacer cambios a `generate-base-pdf` por iniciativa propia, ni siquiera "mejoras".
- ⚠️ Si un deploy de Lovable está por correr, asumir que esta función será pisada y planificar la restauración inmediatamente después.
- ⚠️ El código correcto v82+ se considera "fuente de verdad" — cualquier diff vs lo desplegado se restaura, no se merge.

---

### La contratada no se activa automáticamente

**Causa**: Hay un signature_link de `adherente` con `status != 'completado'` que no debería existir (duplicado del titular).

**Diagnóstico**:
```sql
SELECT recipient_type, status, step_order
FROM signature_links
WHERE sale_id = '<id>'
ORDER BY step_order;
```

**Solución**: Revocar el link de adherente fantasma y activar manualmente el de contratada.

---

### Error 403 al aprobar venta (vendedor)

**Causa**: Falta política RLS en `sale_workflow_states` o `notifications` para el rol `vendedor`.

**Diagnóstico**: Ver policies de esas tablas y verificar que incluyen `vendedor`.

---

### Error 409 Conflict al eliminar venta

**Causa**: FK con `NO ACTION` que bloquea el cascade (ej: `hash_anchors → signature_evidence_bundles`).

**Solución**: Cambiar a `ON DELETE CASCADE`.

---

### Nombre del firmante en minúscula en el PDF

**Causa**: El frontend lowercasea el nombre antes de escribirlo en `documents.content`.

**Solución temporal**: `UPDATE documents SET content = REPLACE(content, 'nombre minuscula', 'Nombre Correcto')`.

**Solución permanente**: Fix en el frontend para preservar capitalización.

---

### WhatsApp no llega (OTP o link de firma)

**Causa más común**: El teléfono tiene el `0` inicial (`0984800303` en lugar de `984800303`).

**Diagnóstico**:
```sql
SELECT recipient_phone FROM signature_links WHERE id = '<id>';
```

**Solución**:
```sql
UPDATE signature_links
SET recipient_phone = REGEXP_REPLACE(recipient_phone, '^0+', '')
WHERE id = '<id>';
```

---

## Templates WhatsApp en la DB

Los templates se guardan en `whatsapp_templates` con estas claves:

| template_key | Uso |
|---|---|
| `signature_link` | Link de firma para titular/adherente |
| `contratada_signature_link` | Link de firma para la contratada |
| `contract_complete` | Notificación al titular cuando contratada firma |
| `otp_verification` | OTP para verificación |

Variables disponibles en templates: `{{clientName}}`, `{{companyName}}`, `{{signatureUrl}}`, `{{downloadUrl}}`, `{{contractNumber}}`, `{{expirationDate}}`

---

## Protocolo de Trabajo — Múltiples Agentes (OBLIGATORIO)

> **Regla operativa**: Toda corrección o cambio NO TRIVIAL debe seguir este flujo
> usando agentes especializados. No avanzar a la siguiente fase sin completar la previa.

### Las 6 fases

| Fase | Agente recomendado | Rol |
|---|---|---|
| **1. Analizar** | `Explore` o `general-purpose` | Mapear el bug en el codebase, inventariar TODOS los puntos afectados, identificar edge cases. |
| **2. Planificar** | `Plan` | Diseñar la estrategia de fix: orden de cambios, archivos, migraciones, riesgos, rollback. |
| **3. Desarrollar** | `general-purpose` (o el agente principal si es chico) | Implementar los cambios. |
| **4. Testear** | `Explore` **independiente** del que desarrolló | Verificar consistencia, buscar regresiones, validar que el fix resuelve el bug raíz, no solo el síntoma. |
| **5. Corregir** | `general-purpose` | Aplicar lo que el agente de test encontró. |
| **6. Deploy** | Agente principal (no delegar) | Migration + commit + push + verificación post-deploy. |

### Reglas

1. **Paralelizar fases independientes** — ej: analizar frontend + DB schema simultáneamente en una sola tool call con múltiples agentes.
2. **Cada agente con prompt autocontenido** — paths absolutos, líneas exactas, qué buscar, qué reportar, límite de palabras.
3. **Nunca delegar la SÍNTESIS** — el agente principal sintetiza los hallazgos antes de pasar a la siguiente fase. Prohibido escribir prompts tipo "basado en tus hallazgos, implementá".
4. **Verificación independiente** — el agente de Fase 4 (Test) NO puede ser el mismo que hizo Fase 3 (Develop). Evita sesgo de confirmación.
5. **Cambios triviales (1 línea, typo, rename obvio) están exentos** — gastar agentes ahí es ruido. Ante la duda, usar agentes.
6. **Datos sensibles los maneja el agente principal** — DB writes, migrations, `git push`, secrets. Los subagentes pueden leer/proponer, no ejecutar en infraestructura.
7. **Siempre con red de seguridad** — los fixes deben aplicarse en defensa en profundidad cuando sea posible (UI + lógica + DB constraint), no en un solo punto.

### Ejemplo de invocación correcta

```
# Fase 1: dos agentes Explore en PARALELO (una sola tool call con dos Agent blocks)
- Agent 1: inventario de puntos donde se lee/escribe campo X en frontend
- Agent 2: inventario de puntos donde se lee/escribe campo X en edge functions

# Fase 4: agente Explore independiente verifica el commit
- Lee archivos modificados, busca regresiones, reporta hallazgos
```

### Cuándo SÍ y cuándo NO

| Aplica el protocolo | NO aplica |
|---|---|
| Bug en producción | Cambiar un copy/texto |
| Refactor de >1 archivo | Renombrar una variable local |
| Cambio de schema DB | Agregar console.log temporal |
| Nueva edge function | Bump de versión en package.json |
| Cambio que toca firma/PDF/WhatsApp | Formateo (prettier/eslint --fix) |

---

## Contactos del Proyecto

| Rol | Email |
|---|---|
| Super Admin | dalton9302@gmail.com |
| Super Admin | cacosta.ma@gmail.com |
| Admin SAMAP | admin.samap@hotmail.com |
| Representante Legal | eder.arguello@samap.com.py |
