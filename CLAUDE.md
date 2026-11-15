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

### `generate-base-pdf` la pisa Lovable — el repo es la copia de rescate

```
❌ NO dejar que un deploy de Lovable quede desplegado sobre generate-base-pdf
✅ SÍ: supabase/functions/generate-base-pdf/index.ts ES la v82 y se puede redesplegar
```

Esta función usa **tabla HTML con `<thead>/<tfoot>`** para el branding (encabezado y
zócalo), con `displayHeaderFooter: false` y `margin: 0`. Lovable la reescribe usando
`displayHeaderFooter: true` de Puppeteer con `headerTemplate`/`footerTemplate`, que **no
soporta imágenes base64** en el renderer actual: sólo renderiza texto, así que el header y
el footer salen **vacíos**.

Si el branding deja de aparecer en los PDFs, es porque Lovable sobreescribió la función
desplegada. Redesplegar (ver *Comandos Útiles*).

**Versión correcta de producción: v82+** (estrategia `thead/tfoot`, `displayHeaderFooter: false`, `margin: 0`)

> **Cambio 2026-09-07**: hasta esta fecha el archivo del repo era la versión **rota** de
> Lovable y la v82 sólo existía como función desplegada en prod. Eso rompió TEST: el deploy
> masivo del `2026-04-05` publicó el archivo del repo en `ykducvvcjzdpoojxlsig` (v62) y
> **ningún** PDF de test tuvo branding hasta que se restauró (v63). Por eso ahora la v82
> está commiteada: el repo y prod coinciden, y desplegar desde el repo es el camino seguro.
> Si volvés a modificar este archivo, que sea con intención — no como efecto colateral de
> un deploy de Lovable.

> Desde el **2026-11-15** (PR #9) la v82 también está en `main` de `DaltonP93` y de
> `Sistemas-saa`. Hasta esa fecha `main` tenía la versión rota de Lovable; si alguna vez
> se trabaja sobre un `main` anterior a `3e119d2`, **no desplegar `generate-base-pdf`
> desde ahí**.

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
| `generate-pdf` | 58 | Preview PDF con branding base64. **`verify_jwt: true`** en prod (el `config.toml` dice false: no desplegar por CLI sin flag) |
| `compose-template-pdf` | 52 | RUC/razón social para empresas (2026-11-15) |
| `create-user` | 55 | Timeout 8s en auth.getUser, deduplicación doble-click |
| `signature-otp` | 57 | OTP WhatsApp vía WAHA, API key desde DB |
| `get-document-download-url` | 51 | Prioriza print_versions sobre signed_pdf_url |
| `pades-sign-document` | 49 | Firma PAdES de documentos |
| `generate-evidence-certificate` | 49 | Genera certificado de evidencia |
| `send-whatsapp` | 49 | Envía mensajes vía WAHA usando templates de DB |
| `waha-health-check` | 21 | Health check del servicio WAHA |
| `waha-proxy` | 19 | Proxy para requests a WAHA |
| `bulk-regen` | 4 | Temporal — regeneración bulk de PDFs |

### ⚠️ Base de TEST (US, `ykducvvcjzdpoojxlsig`) — `finalize-signature-link` diverge del repo

Lo desplegado en TEST (**v54**) incluye la **incorporación de adherentes**
(`completeAdherentIncorporationIfNeeded` + RPC `complete_adherent_incorporation`), que **no existe
en ninguna rama de este repo** — se desplegó directo, sin commitear. Producción **no** tiene esa
tabla ni esa RPC (`adherent_incorporations` / `complete_adherent_incorporation` = 0 en BR), por eso
esa lógica **no** se incorporó a `main`.

> ⚠️ **Desplegar el archivo del repo sobre TEST borraría esa lógica.** Antes de redesplegar
> `finalize-signature-link` en TEST, bajar la versión viva con
> `mcp__claude_ai_Supabase__get_edge_function(project_id='ykducvvcjzdpoojxlsig', function_slug='finalize-signature-link')`
> y aplicar los cambios **encima** de esa, no encima del archivo del repo. En producción no aplica:
> ahí el archivo del repo es la fuente de verdad.

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

## Tipos de Venta y Anexos (`sales.sale_type`)

`sale_type` es **texto libre** (sin enum ni CHECK). El catálogo canónico vive en
`src/lib/saleTypes.ts` y hay dos familias:

| Familia | Valores | Quién los pone |
|---|---|---|
| **Manuales** | `venta_nueva`, `reingreso` | El vendedor, en el selector de Tipo de Venta |
| **De operación** | `alta_adherente`, `cambio_plan` | El SISTEMA, al crear una venta-operación sobre un contrato ya firmado |

Una **venta-operación** no es una venta comercial: es el vehículo para poder
firmar un anexo sobre un contrato existente y liquidar su comisión aparte.
Nunca deben aparecer en el selector ni inflar métricas — de eso se encarga
`excludeOperationSales` en `src/lib/saleFilters.ts`. Sí entran en comisiones.

### Los 3 formularios

Los originales en papel están en `Tipo_ventas/`. Cada uno tiene su plantilla HTML
en `docs/`, sembrada en `templates` por `20260822000002_seed_plantillas_tipos_venta.sql`:

| Formulario | `sale_type` | `template_type` | Plantilla |
|---|---|---|---|
| Anexo de Incorporación de Adherente | `alta_adherente` | `anexo_incorporacion` | `docs/plantilla-anexo-incorporacion.html` |
| Solicitud de Cambio de Plan | `cambio_plan` | `solicitud_cambio_plan` | `docs/plantilla-solicitud-cambio-plan.html` |
| Anexo Especial de Vigencia Inmediata | *(ninguno)* | `anexo_vigencia_inmediata` | `docs/plantilla-anexo-vigencia-inmediata.html` |

Vigencia Inmediata **no tiene tipo ni tabla propia**: se adjunta a cualquier venta
y lista los beneficiarios con `immediate_coverage`, vía el loop
`{{#beneficiarios_vi}}` de `src/lib/enhancedTemplateEngine.ts`.

Las tres llevan `{{firma_contratante}}`, así que `SaleTemplatesTab` las clasifica
como **`document_type = 'contrato'`**, NO `'anexo'`. **Es a propósito y no hay que
"corregirlo"**: `finalize-signature-link` saltea los documentos `'anexo'` y nunca
les generaría el PDF firmado — pasarlas a `'anexo'` haría que dejen de firmarse.
Que se muestren como "Anexo" es sólo una etiqueta de `normalizeDocumentType` en
`src/pages/Documents.tsx`.

### Cadena de activación (es automática, no hay click manual)

```
firma del último signature_link  →  status='completado'
   → trigger auto_advance_sale_status (ON signature_links)
   → sales.status='completado' de la venta-operación
      → trg_activate_adherent_incorporation  → suma los adherentes al contrato madre
      → trg_activate_plan_change             → aplica plan/fecha/montos al contrato madre
         → recalculate_sale_total_amount(parent_sale_id)
```

Está en la base y no en el front a propósito: el navegador puede no estar abierto
cuando se completa la última firma.

Las ventas-operación se crean con `audit_status = 'aprobado_para_templates'`: el
contrato madre ya pasó auditoría, y sin eso `SaleTemplatesTab` bloquearía adjuntar
la plantilla y el anexo no se podría emitir nunca.

### Estado por entorno

| | US test (`ykducvvcjzdpoojxlsig`) | BR prod (`ejiycfqxgtrzaysgpzmx`) |
|---|---|---|
| `adherent_incorporations`, `plan_changes` | ✅ | ✅ (2026-11-15) |
| `beneficiaries.entry_date` / `.immediate_coverage` / `.status` / `.coverage_end_date` | ✅ | ✅ |
| `clients.external_id`, `sales.employee_signature_mode` | ✅ | ✅ |
| Plantillas de los 3 formularios | ✅ | ✅ sembradas **inactivas** hasta el front nuevo |
| Nómina de empresa (`beneficiaries.member_role` / `.parent_beneficiary_id` / `.plan_id`) | ✅ | ✅ |
| Movimientos alta/baja (`adherent_incorporations.movement_type` y sus 8 columnas) | ✅ | ✅ |
| `clients.hr_contact_*` y las 2 plantillas de empresa | ✅ | ✅ (plantillas inactivas) |
| CHECK `sales_titular_amount_positive_when_active` → trigger `trg_sales_validate_titular_amount` | ? | ✅ |
| Comisiones (`commission_*`) | ✅ | ❌ **segunda vuelta** |

> **Aplicado en BR prod el 2026-11-15** con `sql/produccion-entrega-a.sql` (pegado en el
> SQL Editor; 0,46 s de bloqueo; guarda `ctid`+`xmin`: ninguna fila preexistente escrita).
> Prod quedó byte a byte igual al clon ensayado (md5 de columnas, funciones, triggers,
> constraints, políticas y plantillas). Vuelta atrás sin backup:
> `sql/produccion-entrega-a-REVERSO.sql` (interruptores, no borra nada; probado).
> **Las 10 plantillas se activan recién con el front nuevo arriba**: el front viejo lista
> toda plantilla activa sin filtrar por empresa (las mostraría duplicadas). Detalle en
> `docs/runbooks/produccion-entrega-a.md` §13.
>
> ⚠️ **Antes de cargar anexos** sobre 2026-000109, 000191 o 000207: su total guardado
> difiere de la fórmula y la activación lo duplicaría. Decisión de negocio pendiente.

---

## Venta a EMPRESA: nómina de empleados y movimientos de alta/baja

> Aplicado el **2026-09-08** en US test (migraciones `20260908000001`…`20260908000006`) y
> el **2026-11-15** en BR prod. Ver *Estado por entorno*.

### El modelo: UN contrato, empleados anidados

Un contrato corporativo es **una sola venta** (`clients.client_type='empresa'`)
cuyos `beneficiaries` forman **exactamente dos niveles**:

```
VENTA  titular_amount = 0 · plan_id = plan de referencia · total = suma de la nómina ACTIVA
├─ member_role='empleado'  parent=NULL  plan_id=ORO    amount=1.200.000
│    ├─ member_role='adherente'  parent=↑  plan_id=ORO    amount=300.000
│    └─ member_role='adherente'  parent=↑  plan_id=PLATA  amount=250.000
└─ member_role='empleado'  parent=NULL     plan_id=PLATA  amount=900.000
```

Una venta a **persona física no cambia en nada**: sus filas nacen con los
defaults `member_role='adherente'`, `parent_beneficiary_id=NULL`, `plan_id=NULL`.

**No hay `sale_type` nuevo.** Una venta de empresa sigue siendo `venta_nueva` o
`reingreso`; lo que la distingue es el `client_type` del titular.

**La empresa NO es beneficiaria de sí misma**: no hay fila de titular, no hay
`is_primary`, y `titular_amount` es 0. Por eso `enhancedTemplateEngine` saltea
el `titularFallback` cuando `isCompanyClient(client)` — sin eso imprimía una
fila fantasma con la razón social cobrando el total entero, encima de la nómina.

### Integridad de la jerarquía: una FK compuesta, no un trigger

```sql
CONSTRAINT uq_beneficiaries_id_sale UNIQUE (id, sale_id)
CONSTRAINT fk_beneficiaries_parent
  FOREIGN KEY (parent_beneficiary_id, sale_id)
  REFERENCES beneficiaries (id, sale_id) ON DELETE CASCADE
```

Esa FK expresa de forma **declarativa** que el empleado del que cuelga un
adherente pertenece a la MISMA venta, y el `ON DELETE CASCADE` hace que borrar
un empleado se lleve a sus adherentes sin código de aplicación. El `UNIQUE`
redundante con la PK es el requisito de Postgres para referenciar ese par.

Lo único que no entra en un CHECK ni en una FK (es entre filas) es "el padre
tiene que ser un empleado", y de eso se ocupa
`trg_beneficiaries_validate_nomina`, que además impide degradar a un empleado
que tiene gente a cargo. Corre **después** de
`trg_beneficiaries_block_when_sale_signed` por orden alfabético, que es lo
correcto.

### La baja NO borra

Dar de baja pone `beneficiaries.status='inactive'` + `coverage_end_date`. La
fila se conserva: es la historia de la nómina y es a lo que apunta el anexo
firmado. `'inactive'` ya estaba en `beneficiaries_status_check` desde antes —
**ese CHECK no se toca**, porque también admite
`'pending_addendum_signature'`, del flujo legado `sale_addendums`.

`recalculate_sale_total_amount(uuid)` ahora filtra
`COALESCE(status,'active')='active'` en sus dos lecturas. Sigue siendo la
**única fuente de verdad** del total. De paso se eliminó la quinta fórmula que
quedaba en el front: `SaleTabbedForm` → *Enviar a Auditoría* recalculaba en JS
y hacía un `UPDATE sales` (bug #10); ahora llama a la RPC.

### Movimientos: alta y baja comparten anexo, serie y `sale_type`

La pestaña *Incorporaciones* pasó a llamarse **Movimientos** (el `value` de la
tab sigue siendo `incorporaciones`, para no romper `tabOrder` ni los enlaces).
Las dos operaciones crean una venta-operación con
`sale_type='alta_adherente'` → serie `ANX-YYYY-NNNNNN`, y se distinguen por
`adherent_incorporations.movement_type` (`'alta'` | `'baja'`).

Al firmarse, `activate_adherent_incorporation()` bifurca:

- **alta**: copia la persona al contrato madre, ahora también con `member_role`,
  `plan_id` y el `parent_beneficiary_id` resuelto desde
  `parent_target_beneficiary_id`.
- **baja**: pasa a `inactive` al `target_beneficiary_id` y, si
  `cascade_dependents`, a sus adherentes; deja la traza en
  `deactivated_beneficiary_ids`.

> ⚠️ **La trampa más peligrosa de todo el módulo.** El loop de alta filtra
> `activated_beneficiary_id IS NULL AND parent_sale_id IS NOT NULL`, y eso
> **también matchea las filas de baja** (que tienen poblado
> `operation_beneficiary_id`). Sin el `AND COALESCE(movement_type,'alta')='alta'`
> que se le agregó, firmar una baja **copiaría a la persona al contrato madre**,
> en silencio y al revés de lo pedido. Si alguna vez se reescribe esa función,
> ese filtro no se puede perder.

> La función se reemplaza siempre con **el mismo nombre y la misma firma**: es
> una de las 4 que `trg_beneficiaries_block_when_sale_signed` exime por
> `PG_CONTEXT`. Por eso **no** hace falta `set_config`, y no se toca el regex.

#### Un alta puede traer un empleado CON su grupo familiar (2026-09-09)

Antes un alta era de un solo rol, y sumar a alguien con su familia costaba dos
movimientos y dos ceremonias de firma. Ahora el formulario de alta de empresa
anida los adherentes bajo cada empleado (`adherentesPorFila` en
`SaleIncorporationsTab`), y el vínculo se guarda **dentro de la venta-operación**:
el adherente nace con `parent_beneficiary_id` apuntando al empleado de esa misma
venta, que es lo único que la FK compuesta `fk_beneficiaries_parent` permite. Por
eso `useCreateAdherentIncorporation` inserta en **dos pasadas** (primero los
empleados, después sus adherentes).

`activate_adherent_incorporation` lo traduce al contrato madre
(`20260910000004`): activa los **empleados primero** (`ORDER BY`) y, si
`parent_target_beneficiary_id` no resuelve contra la madre, sigue el
`parent_beneficiary_id` del beneficiario de la operación hasta la fila hermana de
`adherent_incorporations` y de ahí a su `activated_beneficiary_id`. También copia
`requires_adherents` / `maternity_bonus`.

> `parent_target_beneficiary_id` (empleado que YA vive en la madre) y
> `parent_row_index` (empleado que entra en ESTE movimiento) son excluyentes: el
> primero no puede usarse para el segundo porque cuando se arma el alta ese
> empleado todavía no existe en ningún contrato.

### Por qué una baja inserta beneficiarios que no firman

`useCreateNominaTermination` inserta el snapshot de quienes salen como
beneficiarios de la venta-operación, con **`signature_required=false` y
`status='inactive'`**. Esa combinación es la que hace que el anexo funcione sin
motor de plantillas nuevo:

- `useCreateAllSignatureLinks.ts:101` y `SaleTemplatesTab.tsx` saltean a quien
  tiene `signature_required === false` → **no** se les genera DDJJ ni enlace de
  firma; firman sólo el representante de la empresa y la contratada;
- el loop `{{#beneficiarios}}` los imprime igual, que es lo que el anexo debe
  decir;
- `status='inactive'` hace que el total de la venta-operación quede en **0** sin
  pisarlo a mano — correcto, porque una baja no factura y `total_amount` es la
  base de cálculo de la comisión.

### Plantillas y motor

| Plantilla | `template_type` | Archivo |
|---|---|---|
| Contrato Colectivo de Empresa | `contrato_empresa` | `docs/plantilla-contrato-empresa.html` |
| Anexo de Movimiento de Nomina | `anexo_movimiento` | `docs/plantilla-anexo-movimiento.html` |

Placeholders nuevos: `{{rol}}`, `{{depende_de}}`, `{{plan_nombre}}` (por fila),
`{{movimiento}}` / `{{movimiento_fecha}}` (globales, los adosa
`attachGroupMonthlyTotal`), `{{titular_documento}}` /
`{{titular_documento_label}}` (RUC vs C.I.), y el loop anidado
`{{#empleados}}` … `{{#sus_adherentes}}` … `{{/sus_adherentes}}` …
`{{/empleados}}`, con `{{cantidadAdherentes}}` y `{{subtotalFormateado}}`.

El agrupador vive en **`src/lib/nomina.ts`** y lo comparten la pantalla y el
motor, para que la tabla que se ve al cargar y la que sale impresa no puedan
discrepar.

> Las dos plantillas llevan `{{firma_*}}`, así que `SaleTemplatesTab` las
> clasifica como `document_type='contrato'`. **Es correcto y no hay que
> "corregirlo"**: `finalize-signature-link` saltea los `'anexo'`.

### Cómo aplicarlo en una base

`sql/aplicar-nomina-empresa-test-PASO1.sql` (esquema, funciones y triggers) y
después `sql/aplicar-nomina-empresa-test-PASO2.sql` (las 2 plantillas). Los dos
son idempotentes y el PASO 1 **aborta solo** si el filtro por `status` fuera a
cambiar el total de alguna venta existente. Después, regenerar `types.ts`.

> **Aplicado en US test el 2026-09-08** (las 13 filas de verificación en `OK`) y
> `types.ts` regenerado. Para probar que las guardas de la jerarquía además
> *funcionan* —y no sólo que existen— está
> `sql/verificar-nomina-empresa-test.sql`, que corre entero dentro de
> `BEGIN … ROLLBACK` y no escribe nada.

> Un par de hooks leen `adherent_incorporations` con `select('*')` + cast en vez
> de enumerar columnas. Es deliberado: esa tabla ya cambió de forma tres veces y
> cada vez habría que tocar todos los selects. Además, encadenar un `.eq()` de
> más sobre `beneficiaries` hacía explotar la inferencia de PostgREST
> (*"Type instantiation is excessively deep"*), así que ese filtro se hace en
> memoria.

---

### ⚠️ Editar/cancelar un anexo: gatear por la VENTA-OPERACIÓN, nunca por el anexo

`adherent_incorporations.status` y `plan_changes.status` **nunca pasan por
`sent` ni `signed`**: nadie los escribe. El único salto real es
`draft → completed`, y lo hace el trigger recién cuando la venta-operación
llega a `completado`. O sea que mientras el titular ya firmó y falta la
contratada, la venta-operación está en `firmado` pero el anexo sigue en `draft`.

Gatear los botones Editar/Cancelar por el status del anexo deja esa ventana
abierta, y ahí:

- **Incorporación**: el UPDATE de `adherent_incorporations` pasa (el guard de
  `20260818000003` sólo mira `OLD.status <> 'draft'`) y después explota con
  **42501** al tocar el beneficiario del contrato firmado. Sin transacción:
  queda el snapshot editado y el beneficiario sin tocar.
- **Cambio de plan**: peor — el update sólo toca `plan_changes` y `sales`, no
  hay guard de base, así que **reescribe el `members_snapshot` de un formulario
  ya firmado en silencio**.

En ambos casos el PDF firmado no se regenera y queda diciendo otra cosa que la base.

**Se gatea por `operation_sale.status`** (`OP_EDITABLE = ['borrador']`,
`OP_CANCELABLE = ['borrador','enviado','pendiente']`), en los hooks Y en la UI.
Si algún día se escriben de verdad los estados `sent`/`signed` del anexo, esta
guarda puede simplificarse — hasta entonces, no sacarla.

### ⚠️ La RLS de `templates` no aísla por empresa

La política **"Gestors can manage templates"** es `FOR ALL` con
`USING (has_role(super_admin) OR has_role(admin) OR has_role(gestor))` —
**sin `company_id`**. Como las políticas permisivas se combinan con OR, esa
sola alcanza: cualquier admin o gestor ve (y puede editar) las plantillas de
**todas** las empresas, aunque exista también "Users can view company templates".

No se notaba porque las 9 plantillas históricas eran todas de la misma empresa.
Al sembrar las plantillas de los tipos de venta para cada empresa, el selector
de la venta pasó a mostrarlas **duplicadas**.

**Mitigado en el front**: `SaleTemplatesTab` recibe `companyId` (la empresa de
la venta) y filtra `availableTemplates` por ella. Es lo correcto para todos los
roles, super_admin incluido: el selector de UNA venta debe ofrecer sólo las
plantillas de SU empresa.

> La RLS sigue permisiva. Arreglarla es un cambio de seguridad aparte: habría
> que scopear esa política por `company_id` y verificar que no rompa al
> super_admin ni al diseñador de plantillas.

### Deuda conocida de este módulo

- **`auto_advance_sale_status` tiene DOS triggers** sobre `signature_links`
  (`auto_advance_sale_status_trigger` y `trg_auto_advance_sale_status`, misma
  función). Es idempotente y no rompe, pero es redundante.
- **`sale_addendums` / `sale_addendum_beneficiaries`**: flujo legado anterior a
  `adherent_incorporations`. Ningún componente los usa (sólo aparecen en
  `types.ts`), pero las funciones `approve_sale_addendum` y
  `try_complete_sale_addendum_for_link` sí los tocan y están **exentas** del guard
  `trg_beneficiaries_block_when_sale_signed`. **No borrar.**
- **`complete_adherent_incorporation(uuid)`** es legado: versión de UN solo
  adherente, sin recálculo del total. No la llama nadie; la activación real la
  hace el trigger. Versionada en `20260822000003` sólo porque `20260818000002`
  la exime por nombre y su preflight aborta si falta.
- **Una venta-operación de CAMBIO DE PLAN no tiene beneficiarios**: `CMB-*` lleva
  su importe directo en `sales.total_amount`, puesto por `useCreatePlanChange`.
  Dos consecuencias: (1) su total NO se puede validar contra la fórmula de
  `recalculate_sale_total_amount` —un control que lo intente marca falsos
  positivos, pasó al aplicar `20260908000004`—; y (2) llamar a esa RPC sobre una
  de esas ventas le pondría el total en **cero**. Hoy no ocurre: el trigger
  dispara sobre `beneficiaries` y esas ventas no tienen ninguno, y
  `activate_plan_change` recalcula el contrato **madre**, no la operación.
- **El historial de migraciones de test está divergente del repo**: hay 12
  versiones del repo sin registrar en `supabase_migrations.schema_migrations`
  (sus objetos SÍ existen, se aplicaron por SQL directo) y 5 versiones en test
  que el repo no tiene. Por eso las migraciones se aplican con scripts de `sql/`
  y no con `db push`.

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
Cada deploy de Lovable sobreescribe la función con su versión que no funciona con el renderer
(`displayHeaderFooter: true` + imágenes base64 → header/footer vacíos).

**Síntoma**: los PDFs salen sin encabezado ni zócalo. **No es específico de una plantilla**:
si la función está pisada, ningún PDF de ese entorno tiene branding.

**Fix**: redesplegar la v82. Desde el `2026-09-07` el archivo del repo **es** la v82, así que
alcanza con:

```bash
npx supabase@2.111.0 functions deploy generate-base-pdf --project-ref <ref> --no-verify-jwt
```

`<ref>` = `ejiycfqxgtrzaysgpzmx` (BR prod) o `ykducvvcjzdpoojxlsig` (US test). **Siempre
explícito**: `supabase/config.toml` apunta a BR, y un deploy sin `--project-ref` va a producción.

**Verificar antes de dar por hecho el diagnóstico** (no asumir que la función está bien):

```
mcp__claude_ai_Supabase__get_edge_function(project_id=..., function_slug='generate-base-pdf')
```
Debe contener `print-shell`, `table-header-group` y `displayHeaderFooter: false`. Si tiene
`headerTemplate` o `displayHeaderFooter: true`, está pisada.

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

### 10. `sales.total_amount` se calculaba en CUATRO lugares con fórmulas distintas

**Síntoma**: a una venta le falta plata en el total, típicamente **exactamente el monto del
titular**. Aparece y desaparece según el orden en que se guardó, así que es difícil de reproducir.

**Causa**: había cuatro implementaciones del mismo cálculo:

| Dónde | Fórmula | ¿Correcta? |
|---|---|---|
| `recalculate_sale_total_amount(p_sale_id uuid)` | contempla `is_primary` | ✅ |
| `useBeneficiaries.ts` (frontend) | idéntica a la anterior | ✅ |
| **`recalculate_sale_total_amount()`** (la del trigger) | **`SUM(amount)` a secas** | ❌ |
| **`SaleTabbedForm.tsx`** (al guardar la venta) | **`titular_amount + Σ(no primarios)`** | ❌ |

El trigger `trg_recalculate_sale_total` dispara en cada alta/edición/baja de adherente y pisaba
el total ignorando `titular_amount`: si el titular no existe como fila beneficiaria, **su monto
desaparece**. La cuarta fórmula sólo coincidía con la de la base cuando el monto del primario
era igual a `titular_amount`.

Verificado en test antes de arreglarlo: de 22 ventas, 2 tenían el total mal, y en una de ellas
faltaban exactamente los 275.000 del titular.

**Fix aplicado** (`20260818000001_fix_total_amount_single_source.sql`): la versión con argumento
queda como **única fuente de verdad**; la del trigger sólo delega en ella; las dos del frontend
se eliminaron (`SaleTabbedForm` ahora llama a la RPC). Incluye backfill con `RAISE NOTICE`.

> ⚠️ Si un deploy de Lovable reintroduce el cálculo en `useBeneficiaries.ts` o en
> `SaleTabbedForm.tsx`, el bug vuelve. El total lo calcula **sólo la base**.

### 11. Adherentes editables en contratos ya firmados

**Síntoma**: se podían agregar, editar o borrar adherentes de un contrato `firmado` o
`completado`, dejando la base diciendo una cosa y el PDF con firma PAdES otra.

**Causa**: el bloqueo era sólo visual (una prop `disabled` que escondía botones) y
`BeneficiariesManager` ni siquiera la recibía. Además `isSaleLocked` exime a 5 roles.

**Fix aplicado**, en tres capas: `canMutateBeneficiaries` (`src/lib/saleUtils.ts`, **sin
excepciones por rol**), una guarda en los hooks de `useBeneficiaries`, y el trigger
`trg_beneficiaries_block_when_sale_signed` (`20260818000002`).

> **2026-09-09** — faltaba la cuarta capa, la que se ve: `SaleTabbedForm` gateaba las
> pestañas Nómina/Adherentes con `isSaleLocked`, que **sí exime a los 5 roles
> privilegiados**, así que un admin llenaba el formulario entero sobre un contrato
> firmado y recién al grabar chocaba con el guard. Y como los `catch` de esas pestañas
> sólo hacían `console.error`, el usuario veía un botón mudo. Ahora se gatean con
> `canMutateBeneficiaries`, hay un banner que explica el motivo y lleva a Movimientos, y
> todos los `catch` muestran `toast.error`. Si un deploy de Lovable revierte esto, el
> síntoma vuelve a ser "el botón Guardar no hace nada".

Las 4 funciones del sistema que **deben** poder escribir en un contrato firmado
(`activate_adherent_incorporation`, `complete_adherent_incorporation`, `approve_sale_addendum`,
`try_complete_sale_addendum_for_link`) quedan eximidas **desde el propio trigger**, que mira la
pila de llamadas con `GET DIAGNOSTICS ... PG_CONTEXT`. Ninguna de las 4 se toca.

> El primer intento eximía con `ALTER FUNCTION ... SET app.allow_signed_beneficiary_mutation`,
> y **nunca se pudo aplicar**: esa GUC es un *placeholder* y PostgreSQL exige superusuario para
> fijarla por `ALTER FUNCTION/ROLE/DATABASE` → `42501: permission denied to set parameter`.
> El módulo de comisiones no sufre esto porque usa `set_config(..., true)` **dentro** del cuerpo
> de cada RPC, no `ALTER FUNCTION`. Acá no se podía copiar ese patrón: 3 de las 4 funciones no
> están en el repo (sólo existen en la base) y un `CREATE OR REPLACE` a ciegas las rompería.

> ⚠️ Si se agrega otra función del sistema que modifique adherentes de un contrato firmado, hay
> que sumarla al regex de exención del trigger o fallará con `42501`. Debe ser **PL/pgSQL**: una
> función en SQL plano no aparece en `PG_CONTEXT`. El preflight de la migración aborta si alguna
> de las exentas no lo es, así que el trigger nunca queda instalado sin salida.
### 12. Bucle de links fantasma de la contratada ("Pendiente" aunque ya firmó)

**Síntoma**: En **Gestionar Firma**, el card *Firma de la Contratada* muestra **Pendiente**
aunque la contratada ya firmó, y **el estado cambia al recargar la página**. La venta queda
`completado` y el contrato firmado, pero se generan contratos y WhatsApp duplicados.

**Caso testigo**: venta `2026-000214` (SHEILA MAGALI TOLEDO BAEZ) — 6 signature_links de
contratada, 2 contratos firmados, 2 avisos "documentación firmada" al titular.

**Causa (cadena de 3 bugs)**:

1. `useResendSignatureLink` (`src/hooks/useSignatureLinks.ts`) **no copiaba `step_order`** al
   recrear el link. La columna `signature_links.step_order` tiene `DEFAULT 1`, así que un link
   de **contratada regenerado nacía como step 1**.
2. Al firmarse ese link, `activateNextStep` en `finalize-signature-link` lo tomaba como
   "terminó el step 1" → activaba/creaba **otro** link de contratada step 2 pendiente → bucle.
   Además buscaba el step 2 existente con `.eq('is_active', false)`; como los links ya nacen
   `is_active=true`, nunca lo encontraba y caía en la rama "no existe → crear" (duplicaba).
3. `getActiveLinks` (`src/pages/SignatureWorkflow.tsx`) deduplicaba por `recipient_type`
   quedándose con **el primero** de un query ordenado sólo por `step_order` (sin desempate).
   Con varios links del mismo recipient, Postgres no garantiza el orden → el card mostraba un
   link distinto en cada recarga.

Bonus: al regenerar el link de la **contratada**, el bloque de reset de documentos caía en la
rama del *titular* y le ponía `is_final=false` + borraba sus documentos `firma`.

**Fix aplicado (2026-08-19, defensa en profundidad)**:
- `useSignatureLinks.ts`: hereda `step_order` y `recipient_name` del link viejo; no toca
  documentos cuando el que se regenera es la contratada.
- `SignatureWorkflow.tsx`: `getActiveLinks` prioriza `completado` > `pendiente` > `revocado`
  y desempata por `created_at` (determinístico); el tipo `SignatureWorkflowLink` lleva
  `step_order`/`recipient_name` para que el resend los pueda propagar.
- `finalize-signature-link` **v58**: guarda anti-bucle (si ya existe un link de contratada
  `completado`, no activa ni crea otro step 2) y se sacó el filtro `is_active=false`.
- **DB (migración `20260819210000_guard_contratada_signature_links.sql`, APLICADA)**: 3 triggers
  que hacen el fix independiente del código, para que **sobreviva a los deploys**:
  - `trg_enforce_contratada_step_order` (BEFORE INSERT en `signature_links`): un link de
    contratada siempre nace `step_order = 2`, aunque el front omita el campo. **Mata el bug raíz.**
  - `trg_revoke_stale_contratada_links` (AFTER UPDATE en `signature_links`): al completarse la
    contratada, revoca cualquier otro link de contratada vivo de esa venta.
  - `trg_protect_closed_sale_documents` (BEFORE UPDATE/DELETE en `documents`): si la contratada
    ya firmó, no se puede revertir `is_final`, borrar `signed_pdf_url` ni eliminar el documento.
    **Falla con `RAISE EXCEPTION` + `hint`, nunca en silencio** (un bloqueo mudo haría perder
    horas al que lo investigue).

Verificado en producción con transacciones + `ROLLBACK`: insert con `step_order=1` → queda 2;
el link hermano queda `revocado`/`is_active=false`; des-finalizar un doc de venta cerrada lanza
`P0001`. Y los flujos legítimos siguen pasando: limpiar `base_pdf_url` al firmar la contratada,
regenerar con branding, `is_final=true` idempotente, y el reset de documentos en ventas abiertas.

> ⚠️ El fix del front sólo aplica tras **rebuild de la imagen Docker** (falta también en el repo
> del cliente `Sistemas-saa/prepaga-digital`). Igual, con los 3 triggers el bug ya no se puede
> reproducir aunque el front viejo siga corriendo.
>
> ⚠️ Efecto visible: apretar "Regenerar" sobre una venta ya cerrada ahora muestra un **error en
> pantalla** en vez de resetear documentos en silencio. Es el comportamiento correcto.

Consulta para detectar ventas afectadas:
```sql
select sale_id, count(*) from signature_links
where recipient_type='contratada' and step_order = 1
group by sale_id;
```

### 13. Contrato final SIN la firma del titular + HTML corrupto `<div <div` + contratos duplicados

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

**Candado en DB** (migración `20260821120000`, sobrevive a un revert del front):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_contrato_final_por_venta
  ON public.documents (sale_id, name)
  WHERE document_type = 'contrato' AND is_final = true AND beneficiary_id IS NULL;
```

> ⚠️ La clave **incluye `name`, y eso NO es opcional**. Desde `4a5479b` un template con campos de
> firma nunca es anexo, así que **Plan Materno** se clasifica como `document_type='contrato'`: una
> venta con Plan Materno tiene **dos** contratos finales legítimos, ambos con `beneficiary_id IS NULL`.
> La versión original de este índice era sobre `(sale_id)` a secas y **rompía la firma de esas ventas**
> con violación de unicidad apenas se desplegara el front con Plan Materno. Si en alguna base aparece
> la variante vieja, reemplazarla: `DROP INDEX IF EXISTS public.uq_documents_contrato_final_por_venta;`
> y volver a crearla con `(sale_id, name)`.

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

Desde el `2026-09-07` **el archivo del repo es la v82**, así que restaurar es un solo comando:

```bash
# BR producción
npx supabase@2.111.0 functions deploy generate-base-pdf \
  --project-ref ejiycfqxgtrzaysgpzmx --no-verify-jwt

# US test
npx supabase@2.111.0 functions deploy generate-base-pdf \
  --project-ref ykducvvcjzdpoojxlsig --no-verify-jwt
```

> ⚠️ `--project-ref` **siempre explícito**: `supabase/config.toml` apunta a BR y un deploy
> sin ese flag va a producción. En PowerShell usar `npx.cmd` (los `.ps1` están bloqueados).
> No hace falta Docker: el CLI sube el archivo tal cual (avisa `WARNING: Docker is not running`
> y despliega igual).

Alternativa sin CLI: pedirle a Claude **"Restaurá generate-base-pdf"** — redespliega el
archivo del repo, o lo baja de prod con
`mcp__claude_ai_Supabase__get_edge_function(project_id='ejiycfqxgtrzaysgpzmx', function_slug='generate-base-pdf')`
si el archivo local estuviera pisado.

**Verificación post-restore**:

1. `get_edge_function` sobre el proyecto → el código debe contener `print-shell`,
   `table-header-group` y `displayHeaderFooter: false`. Si aparece `headerTemplate`, quedó
   la versión rota.
2. Generar un PDF de prueba y confirmar el encabezado/zócalo. En los logs de la función,
   la v82 imprime `[header] OK …b` y `[footer] OK …b`; un `FAIL` significa que no pudo
   descargar la imagen de branding de `company_settings`.
3. Los PDFs **ya firmados** con la versión rota no se arreglan solos: hay que regenerarlos
   con **"Regenerar con Encabezado"** (`admin_regeneration: true`), que crea una
   `document_print_versions` con branding sin tocar el PDF sellado con PAdES.

> ⚠️ Restaurar ≠ modificar. Si el archivo local difiere de la v82, no lo "mejores":
> comparalo contra la función desplegada en **prod**, que es la referencia.

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

## Módulo de Comisiones (solo en US test — NO está en producción)

> Estado al 2026-08-04: desplegado **únicamente** en `ykducvvcjzdpoojxlsig` (US test).
> En BR producción las tablas **no existen**. Plan y runbook completos en
> [docs/PLAN-COMISIONES.md](docs/PLAN-COMISIONES.md) y
> [docs/runbooks/commission-us-test.md](docs/runbooks/commission-us-test.md).

### Tablas

| Tabla | Descripción |
|---|---|
| `commission_settings` | Config por empresa: `is_enabled`, `accrual_event`, prefijo y secuencia de liquidación |
| `commission_salespeople` | Vendedores habilitados + `default_percent` / `default_base` de respaldo |
| `commission_plan_settings` | Mapeo plan → `INDIVIDUAL` / `GRUPAL`. **Sin UI todavía**: se carga por SQL |
| `commission_rules` | Matriz de reglas: vendedor, plan, tipo de venta, tipo de grupo |
| `commission_periods` | Liquidaciones |
| `commission_items` | Ítems liquidados, con snapshot inmutable |

### Reglas del módulo que NO hay que romper

- **`commission_items.sale_id` es `ON DELETE RESTRICT`**, a diferencia de todo lo
  demás que cascadea desde `sales`. Borrar una venta no puede borrar un ítem ya
  liquidado: es dato contable.
- **`commission_periods` y `commission_items` sólo se mutan vía RPC.** Un trigger
  (`commission_require_rpc_mutation`) rechaza cualquier INSERT/UPDATE/DELETE
  directo que no venga de las funciones del módulo.
- **Nunca se asume 0%.** Sin regla aplicable y sin `default_percent`, el cálculo
  devuelve `no_rule` y bloquea la generación del período.
- **Resolución de reglas**: `priority DESC`, luego especificidad, luego
  `valid_from DESC`, luego `id`. Determinista, sin empates al azar.
- **Redondeo** según `company_currency_settings.decimal_places`, default **0**
  (guaraníes enteros).
- `rule_snapshot.source` distingue `'rule'` de `'salesperson_default'`.

### Reporte de liquidación en Excel (aplicado en US test el 2026-10-08)

Reproduce la planilla "Comisiones <mes>.xlsx" (una hoja por vendedor + Resumen).
**Todo es aditivo** (`20261007000001_commission_report_additive.sql`, script
`sql/aplicar-comisiones-reporte-test.sql`): ninguna regla existente cambia de
resultado, y el script aborta si cambia un solo cálculo o un período.

| Pieza | Qué es |
|---|---|
| Base `net_of_fee_and_tax` | `(total − gasto adm.) / tax_divisor`. Es una rama **nueva** del `CASE`; las otras 3 bases quedan byte a byte. Requiere una fila vigente en `commission_admin_fees` (se carga **por SQL**, no hay UI): sin ella el cálculo da `admin_fee_not_configured` |
| `commission_period_adjustments` | viático / recupero / bonificación / adicional / descuento / otro. Sólo por RPC (`commission_add_adjustment`, `commission_delete_adjustment`, `commission_suggest_maternity_adjustments`) y **sólo con el período en `borrador`** |
| `commission_period_payable` | Vista: `total_a_cobrar = Σ ítems + Σ ajustes`. `commission_periods.total_amount` **no cambia**: sigue siendo Σ ítems |
| `commission_export_rows(uuid[])` | Filas del Excel (código de plan, vidas, snapshot de la base) |
| `commission_settings.tax_divisor` / `.maternity_extra_amount`, `commission_plan_settings.report_code` | Parámetros de presentación; se cargan por SQL |

- **Front**: `src/lib/commissions/exportLiquidacionXlsx.ts` (exceljs, import dinámico), botón
  *Exportar Excel* en el detalle y *Exportar Resumen* (rango de fechas) en la lista. Las FILAS
  llevan los valores del **snapshot** (lo liquidado es inmutable); subtotales, pie y Resumen
  son fórmulas. La plantilla de la Fase 1 es `scripts/comisiones/build_plantilla_liquidacion.py`
  y **comparten diseño**: si se cambia una, cambiar la otra.
- **El diseño es el de la planilla original del cliente** (desde el 2026-10-08; antes era un
  bloque fijo arriba con la tabla en la fila 13, y el cliente lo rechazó). Lleva bandas negra y
  gris arriba, columnas A–O (`Rec N°` … `Comision`, `Adicional`, `Obs`), subtotal gris y la sección
  `EMPRESARIALES` aparte para lo GRUPAL. Después van la franja negra y, abajo, el pie (etiqueta en
  K, valor en M) hasta `TOTAL A COBRAR`. El Resumen lleva `Bonif 8/12/15%`, `Otros` y `Prueba`.
  `Rec N°` sale vacío: el sistema no guarda el medio de cobro.
- ⚠️ **No copiar las fórmulas del Resumen viejo**: tenían las referencias corridas (`#REF!`, y la
  comisión de un vendedor se leía de la franja negra). El export apunta **directo** a la celda de
  cada hoja, porque el generador sabe dónde cae. La plantilla usa **nombres de ámbito hoja +
  `INDIRECT`**, porque ahí el usuario agrega filas y vendedores. `Prueba` suma los `TOTAL A COBRAR`
  de las hojas y se pinta de rojo si no coincide con el Total.
- Las lecturas del export **paginan de a 1000** (`max_rows` de PostgREST corta en silencio).
- Montos escritos a mano se parsean como es-PY (`"350.000"` = 350000): `src/lib/commissions/parseAmount.ts`.
- ⚠️ El SQL Editor del dashboard **no conserva la sesión** entre sentencias (las `TEMP TABLE` del
  preflight daban `42P01`), por eso la foto del "antes" vive en el esquema `cr_scratch`, que el
  propio script crea y borra. Para un rollback garantizado correrlo como UNA transacción
  (`psql -1` / `apply_migration`).
- ⚠️ `generate-commission-pdf` devolvía 500 en US test (2026-10-07/08) por una **función desplegada
  desactualizada**, no por el reporte ni por el renderer: la v2 de US test (deploy del 2026-08-04)
  todavía hace `select ... promoter_type_code, promoter_type_name` sobre `commission_periods`, columnas
  que `20260804210000_commission_remove_promoter_types.sql` eliminó (PostgREST 42703 → la función
  responde 500 "Could not load commission period"). El archivo del repo ya estaba bien (commit `be889a7`).
  **Corregido el 2026-10-08**: redesplegada (v3, por el MCP `claude_ai_Supabase`, con `verify_jwt=false` y
  `_shared/rate-limiter.ts`) y probado el PDF de `LIQ-PRUEBA000001`. Ojo: si se vuelve a refactorizar el
  esquema de comisiones, **hay que redesplegar esta función en US test**; nadie lo hace solo.
- Sigue **sin estar en BR producción**.

### Deploy — nunca a producción por accidente

> ⚠️ **`db push` contra BR**: hoy la CLI lo rechaza porque el historial de prod tiene 89
> versiones sin archivo en el repo (*"Remote migration versions not found…"*). Esa es la única
> barrera que impide aplicar en prod las migraciones de comisiones que el pase de la Entrega A
> excluye. **Nunca correr `supabase migration repair` contra `ejiycfqxgtrzaysgpzmx`**, aunque la
> CLI lo sugiera. El repo local suele estar linkeado a BR (`supabase/.temp/project-ref`):
> `npx supabase unlink` evita que un comando sin `--project-ref` vaya a prod.

`supabase/config.toml` apunta a **BR producción**, así que cualquier `db push` o
`functions deploy` sin `--project-ref` va a prod. Usar siempre los scripts:

```bash
npm.cmd run commission:db:dry-run:us
npm.cmd run commission:db:push:us
npm.cmd run commission:function:deploy:us
```

El wrapper `scripts/commission-us-guard.mjs` rechaza el ref de BR, exige
`CONFIRM_SUPABASE_US` y siempre corre un dry-run antes de aplicar.

> Notas de entorno Windows, aprendidas a golpes:
> - En PowerShell usar **`npm.cmd`/`npx.cmd`**: los `.ps1` están bloqueados por ExecutionPolicy.
> - `SUPABASE_US_DB_URL` debe ser la del **Session pooler** (puerto 5432). La conexión
>   directa `db.<ref>.supabase.co` sólo tiene registro IPv6 y no resuelve desde IPv4.
> - Al regenerar `types.ts` usar `| Out-File -Encoding utf8`; el `>` de PowerShell 5.1
>   escribe UTF-16LE y rompe el archivo.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
