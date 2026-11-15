# Plan — Módulo de Liquidación de Comisiones

> **Estado**: **implementado y desplegado en US test.** Producción sin tocar.
> **Fecha del plan**: 2026-08-03 · **Última actualización**: 2026-08-04
> **Rama**: `feat/liquidacion-comisiones`
> **Entorno de desarrollo**: Supabase **US test** (`ykducvvcjzdpoojxlsig`)
> **Destino final**: Supabase **BR producción** (`ejiycfqxgtrzaysgpzmx`) — ver §9

---

## 0. Estado de implementación (2026-08-04)

Las secciones 1-9 son el plan original. Esta sección registra **qué se construyó
de verdad** y en qué se apartó del plan. Ante una diferencia, manda esta sección.

### Desplegado en US test

7 tablas `commission_*`, 15 funciones RPC, políticas RLS por rol y la edge
function `generate-commission-pdf`. Verificado el 2026-08-04: en test las tablas
responden **401** (existen, sin acceso anónimo) y en **producción 404** (no
existen). El frontend de pruebas corre en http://194.26.100.138:9292 apuntando a
US test.

### Tres desvíos del plan original

**1. El "tipo de promotor" se eliminó por completo.** El plan lo proponía como
dimensión de la matriz (§4.1.1, §4.1.3) tomándolo del reporte legado
("Tip Prom 86"). Decisión de negocio: en SAMAP **el promotor es el vendedor**, la
categoría no representa nada. Se borró la tabla y las columnas en
`commission_salespeople`, `commission_rules` y `commission_periods`, más el
bloque "Tip Prom" del PDF. La matriz quedó en **cuatro** dimensiones: vendedor,
plan, tipo de venta y tipo de grupo.

**2. Porcentaje por defecto por vendedor.** No estaba en el plan. Cuando ninguna
regla cubre una venta, se aplica `commission_salespeople.default_percent` sobre
`default_base`. **La regla siempre manda**; el defecto es sólo respaldo. Sin
porcentaje cargado se sigue devolviendo `no_rule` y la liquidación queda
bloqueada — nunca se asume 0% en silencio. El ítem guarda
`rule_snapshot.source = 'salesperson_default'` para poder auditarlo.

**3. Redondeo a los decimales de la moneda.** El cálculo redondeaba a 2 decimales
aunque el guaraní es entero, así que los ítems impresos no sumaban el total
impreso. Ahora usa `company_currency_settings.decimal_places` con **default 0**.

### Preguntas de §5, resueltas

- **Base del cálculo**: parametrizable por regla. En la práctica hay que usar
  *Monto total de la venta*, porque **4 de los 6 planes tienen `price = 0`**.
- **"Sec"**: sigue sin significado confirmado. Se persiste `NULL` a propósito, en
  vez de inventarle un sentido.
- **"Tip Prom"**: eliminado, ver desvío 1.
- **Promotores externos**: no aplica; todos son vendedores del sistema.

### Bugs encontrados y corregidos durante la puesta en marcha

| Síntoma | Causa real |
|---|---|
| HTTP 400 en `list_salespeople`, selector de vendedor vacío | `profiles.email` es `varchar` y el `RETURNS TABLE` lo declaraba `text`. `RETURN QUERY` exige tipos exactos → `42804` → 400 |
| "Dry-run failed" sin ninguna causa | `spawnSync` no puede ejecutar `.cmd` en Windows desde el parche de CVE-2024-27980; el guard además descartaba `result.error` |
| `getaddrinfo ENOTFOUND` contra la base | `db.<ref>.supabase.co` sólo publica AAAA (IPv6). Desde IPv4 hay que usar el **Session pooler** |
| `types.ts` ilegible tras regenerarlo | El `>` de Windows PowerShell 5.1 escribe UTF-16LE. Usar `Out-File -Encoding utf8` |
| Ítems sin regla desaparecían al generar el período | `commission_generate_period` hacía `JOIN` sobre `commission_rules`; ahora es `LEFT JOIN` |

### Lo que falta

- **UI para `commission_plan_settings`** (mapeo plan → INDIVIDUAL/GRUPAL). Es la
  única configuración que todavía exige SQL: ver
  [seeds/commission_bootstrap_us_test.sql](../supabase/seeds/commission_bootstrap_us_test.sql).
- **`per_adherent`** sigue declarado como base pero sin fórmula: devuelve
  `per_adherent_not_defined`. Es el caso "alta de adherentes" a futuro.
- Cargar precio a los 4 planes que están en 0, si se quiere usar base
  *Precio del plan*.
- Promoción a producción: el runbook de §9 sigue vigente, con la salvedad de que
  ya no hay tabla de tipos de promotor que crear.

---

## 1. Objetivo

Cerrar el flujo de ventas con un módulo de **liquidación de comisiones**: calcular
cuánto comisiona cada vendedor por cada venta, agruparlo en una liquidación por
período, y emitir el PDF con el formato del reporte legado
(`REP_LIQUIDACION_COMISION.pdf`).

El cálculo debe ser **parametrizable**, no hardcodeado:

- No todos los vendedores comisionan igual.
- No todos los planes comisionan igual (en el reporte legado conviven 20 %, 30 % y 50 %).
- A futuro, no todos los **tipos de venta** comisionan igual (hoy `venta_nueva` y
  `reingreso`; mañana `alta_adherente`).

---

## 2. Lo que ya existe (verificado en el repo y en la DB)

| Hecho | Detalle |
|---|---|
| **No hay nada de comisiones** | `grep -ri "comision\|commission"` en `src/`, `supabase/functions/` y `supabase/migrations/` → **0 resultados**. Es 100 % greenfield. |
| **Rol `financiero` ya existe** | Está en el enum `app_role` (`types.ts:4532`) pero sin uso. Es el dueño natural del módulo. |
| **`sales.total_amount` está poblado** | 173/173 ventas tienen `total_amount > 0`. |
| **`plans.price` existe** | Pero **4 de 6 planes tienen `price = 0`** (solo Alfa=180.000 y Beta=310.000 cargados). Ver riesgo R3. |
| **`sales.sale_type`** | Valores reales: `venta_nueva` (167), `reingreso` (6). |
| **`sales.status`** | `completado` (163), `borrador` (6), `enviado` (2), `aprobado_para_templates` (2). |
| **`sales.signature_completed_at`** | 163 ventas con firma completa. |
| **No hay módulo de cobranzas de esta app** | Existen `payments`, `payment_events`, `subscriptions`, pero son de **otra app** que comparte el proyecto (usan Paddle + `user_id`/`product_id`, sin `company_id` ni `sale_id`) y están **todas vacías**. → El devengamiento **no puede** basarse en "cuota cobrada". Ver §4.3. |
| **`company_currency_settings`** | Ya tiene `currency_code`, `currency_symbol`, `decimal_places`, separadores. Reusar, no reinventar. |
| **US test es un clon de esquema de prod** | Ver §2.1 — esquema al día, **datos congelados en abril**. |

---

## 2.1 Verificación de entornos (2026-08-04)

Chequeo hecho **antes** de arrancar, a pedido, usando "plan materno" como caso testigo.

### Esquema: test está al día ✅

Se compararon las **80 tablas** de prod contra test (sondeo REST tabla por tabla) y
las **41 columnas** de `sales`.

- **Todas las tablas de esta app existen en test, con las mismas columnas.**
- Las 9 que faltan en test (`debts`, `debt_plans`, `debt_scenarios`, `payments`,
  `payment_events`, `subscriptions`, `products`, `user_purchases`, `pdf_reports`)
  son de **otra aplicación** que comparte el proyecto de producción, y están **vacías**.
  Su ausencia en test es correcta, no es drift.

**Conclusión: no hace falta migrar esquema a test antes de empezar.**

### Datos: test está congelado hace ~3 meses ⚠️

Última sincronización BR→US: **2026-04-27** (`output/supabase-sync-backups/`).

| Tabla | Test (27-abr) | Prod (hoy) | Gap |
|---|---:|---:|---:|
| `sales` | 21 | 173 | +152 |
| `clients` | 23 | 185 | +162 |
| `beneficiaries` | 32 | 216 | +184 |
| `documents` | 167 | 1.315 | +1.148 |
| `signature_links` | 64 | 464 | +400 |
| `templates` | 8 | 9 | **+1 ← Plan Materno** |
| `plans` | 5 | 6 | +1 |
| `profiles` | 14 | 16 | +2 |

**155 de las 173 ventas de producción se cargaron después del último sync.** Para
probar comisiones con volumen realista hay que refrescar test con
`scripts/sync-br-to-us-test.mjs` (ver R8: redacta columnas sensibles).

La validación de ese sync dejó 4 discrepancias sin resolver:
`template_responses` (364 → 0), `whatsapp_notifications` (10 → 0),
`audit_comments` (1 → 0) y `user_roles` (14 → 23, test tiene **más**).

### "Plan Materno": es un TEMPLATE, no un plan ⚠️ Importante para comisiones

| | |
|---|---|
| **Qué es** | Fila en `templates`, id `95b3d3ec-f570-4cb8-a173-01b3df696cdc` |
| **Creado** | 2026-06-17, actualizado 2026-06-19 |
| **Usos en ventas** | **0** — está configurado pero nunca se vendió |
| **En test** | **No existe** (posterior al sync de abril) |
| **En `plans`** | **No existe** — `plans` solo tiene Alfa, Beta, Beta Kids, Plan Alfa Ambulatorio, Senior Plus, Seven |

Esto **impacta el diseño del §4.1.3**. La matriz de comisiones que propuse se indexa
por `plan_id`, pero el negocio nombra los productos por **template/anexo**, y ahí hay
9 nombres contra 6 planes. Hoy las 173 ventas tienen `plan_id` (0 nulos) y en promedio
**2,92 templates por venta** — o sea, la venta apunta a un plan y le cuelga varios
anexos.

**Pregunta nueva (§5.7): ¿"Plan Materno" comisiona como un producto propio?** Si la
respuesta es sí, la matriz necesita una dimensión `template_id` además de `plan_id`, o
hay que crear la fila correspondiente en `plans`. Es más barato decidirlo ahora que
después de escribir las migraciones.

### Repo local: 2 commits atrás ⚠️

`origin/main` avanzó a `3b3c626` mientras el local está en `86422b6`.

- `a460bd6` — fix: reemplazar `position:fixed` por tabla `thead`/`tfoot` en preview de
  documentos y priorizar `base_pdf_url`/`signed_pdf_url` en Descargar
  (`DocumentsManager.tsx`, `SignatureView.tsx`, `SignatureWorkflow.tsx`)
- `3b3c626` — Merge PR #3 desde `fix/pdf-branding-overlap`

Toca `SignatureWorkflow.tsx`, que es justo donde vive el pausado de Realtime del bug #8.
**Hacer `git pull` antes de crear la rama** y verificar que ese pausado siga presente.

### Deuda encontrada de paso (no bloquea, conviene anotar)

- **`types.ts` está desactualizado.** A `sales` le faltan `titular_amount`,
  `signer_email` y `signer_phone`, que **sí existen** en prod. Regenerar con
  `supabase gen types`.
- **[AuditSaleDetails.tsx:200](../src/components/AuditSaleDetails.tsx) lee 3 columnas
  que no existen en ninguna de las dos bases**: `maternity_bonus`,
  `signature_modality`, `immediate_validity`. Son `undefined` siempre → la UI muestra
  *"Prima de Maternidad: No"* y *"Vigencia Inmediata: No"* para todas las ventas, sin
  fallar. La columna real de vigencia se llama `immediate_coverage`.

---

## 3. Respuesta a las tres preguntas

### 3.1 ¿Se puede hacer? — Sí

Es aditivo. Ver §4: **cero `ALTER TABLE` sobre tablas existentes**, cero cambios al
flujo de firma, cero cambios a `generate-base-pdf`. Todo el módulo vive en tablas,
funciones y rutas nuevas.

### 3.2 ¿En una rama nueva? — Sí, y conviene

```bash
git checkout -b feat/liquidacion-comisiones
```

Nota sobre las ramas existentes: `origin/codex/v2.0` y
`origin/claude/fix-signature-link-contratada` están 34-35 commits atrás de `main`.
**No partir de ellas** — salir de `main` limpio.

### 3.3 ¿Apuntar a test (US)? — Ya está configurado, pero con un hueco

El frontend **ya apunta a test en desarrollo**. [.env.local](../.env.local) tiene la
URL del proyecto US, y [client.ts:14-19](../src/integrations/supabase/client.ts)
respeta esas variables **solo** en `vite dev`. O sea: `npm run dev` pega contra
`ykducvvcjzdpoojxlsig`, y **ningún `vite build` puede apuntar ahí por accidente**
(los valores de prod están hardcodeados como fuente de verdad). Eso ya es correcto y
no hay que tocarlo.

**El hueco está en el backend**, y hay que resolverlo antes de empezar:

1. **El MCP de Supabase NO ve el proyecto US.** `list_projects` devuelve únicamente
   `ejiycfqxgtrzaysgpzmx` (org `dvnilemqcjuxwhdeoges`). No puedo aplicar migraciones
   ni desplegar edge functions a test por esa vía.
2. **`supabase/config.toml` tiene `project_id = "ejiycfqxgtrzaysgpzmx"`** — o sea,
   **producción**. Cualquier `supabase db push` o `functions deploy` sin
   `--project-ref` explícito **va a producción**. Éste es el riesgo operativo más
   grande de todo el proyecto (ver R1).
3. El CLI no está instalado global (`supabase: command not found`), pero
   `npx supabase` funciona (v2.111.0).

**Mitigación obligatoria antes de la primera migración** — agregar a `package.json`
scripts con el ref de test *baked in*, para que nunca se tipee a mano:

```json
"db:push:test":   "supabase db push --project-ref ykducvvcjzdpoojxlsig",
"fn:deploy:test": "supabase functions deploy --project-ref ykducvvcjzdpoojxlsig"
```

Y conseguir un `SUPABASE_ACCESS_TOKEN` con acceso a la organización del proyecto US
(hoy no está seteado). Alternativa sin token: pegar el SQL a mano en el **SQL Editor
del proyecto US** — funciona para las migraciones, pero no para desplegar edge
functions.

---

## 4. Diseño

### 4.0 Principio rector: solo aditivo

> **Cero `ALTER TABLE` sobre tablas existentes. Cero `DROP`. Cero cambios de RLS
> en tablas existentes.**

Todo lo nuevo va en tablas con prefijo `commission_`. La consecuencia es que la
promoción a producción es puramente aditiva: si el módulo falla, se apaga la ruta y
el sistema de ventas queda exactamente como estaba.

La única excepción justificable sería agregar `group_type` a `plans` (INDIVIDUAL /
GRUPAL). **Se evita** con la tabla `commission_plan_settings` (§4.1.2).

### 4.1 Tablas nuevas

#### 4.1.1 `commission_promoter_types` — "Tip Prom" del reporte

El reporte legado muestra `Tip Prom 86` en la cabecera. Es una categoría de promotor.

```
id, company_id, code ('86'), name, default_percent, is_active, created_at
```

#### 4.1.2 `commission_plan_settings` — mapeo plan → INDIVIDUAL/GRUPAL

Evita tocar `plans`.

```
id, company_id, plan_id -> plans, group_type ('INDIVIDUAL'|'GRUPAL'), is_active
```

#### 4.1.3 `commission_rules` — el corazón parametrizable

Matriz de dimensiones. **`NULL` = comodín** ("aplica a todos").

```
id, company_id

-- DIMENSIONES (todas nullable)
salesperson_id     -> profiles.user_id     -- vendedor específico
promoter_type_id   -> commission_promoter_types
plan_id            -> plans
sale_type          text    -- 'venta_nueva'|'reingreso'|'alta_adherente'(futuro)
group_type         text    -- 'INDIVIDUAL'|'GRUPAL'

-- CÁLCULO
calc_mode          text    -- 'percent' | 'fixed'
percent            numeric(5,2)
fixed_amount       numeric(14,2)
base               text    -- 'plan_price'|'sale_total_amount'|'per_adherent'

-- VIGENCIA
valid_from date NOT NULL, valid_to date NULL

-- RESOLUCIÓN
priority int, specificity int (generado), is_active bool
created_by, created_at, updated_at
```

**Resolución determinista** (función `commission_resolve_rule(sale_id)`):

1. Filtrar reglas activas donde cada dimensión sea `NULL` **o** coincida con la venta.
2. Filtrar por vigencia contra `sales.sale_date`.
3. Ordenar por `priority DESC, specificity DESC, valid_from DESC`.
4. Tomar la primera. Si no hay ninguna → la venta queda **"sin regla"** y se reporta
   como excepción; **nunca** se asume 0 % en silencio.

`specificity` = cantidad de dimensiones no nulas → una regla para "vendedor X + plan Y"
siempre gana sobre "plan Y" y sobre la regla global.

Constraint `UNIQUE` sobre la tupla de dimensiones + `valid_from` para que no existan
dos reglas empatadas (ambigüedad silenciosa).

Esto cubre los tres requisitos del pedido:
- *"no todos los vendedores comisionan igual"* → `salesperson_id`
- *"no todos los planes comisionan igual"* → `plan_id` / `group_type`
- *"a futuro tipos de ventas, agregar nuevos adherentes"* → `sale_type`, sin migración

#### 4.1.4 `commission_periods` — la liquidación

```
id, company_id
liquidation_number text     -- "N° Liquidacion" del reporte
period_start date, period_end date
status text  -- 'borrador'|'cerrada'|'pagada'|'anulada'
concept text default 'COMISION VENTA PRE-PAGA'
salesperson_id              -- una liquidación por promotor (como el reporte)
total_amount numeric(14,2), currency_code text
closed_at, closed_by, paid_at, paid_by, created_at, created_by, notes
```

`UNIQUE (company_id, liquidation_number)`.

#### 4.1.5 `commission_items` — una fila por venta, **con snapshot**

Corresponde 1:1 a las filas del PDF.

```
id, period_id -> commission_periods, company_id, salesperson_id
sale_id  -> sales                    ⚠ ON DELETE RESTRICT (ver abajo)
item_number int          -- "Item"
group_type text          -- "Tipo": INDIVIDUAL/GRUPAL
sale_date date           -- "Fecha"
client_display_id text   -- "Id Cliente"
client_sequence int      -- "Sec"
client_name text         -- "Cliente"   (snapshot)
plan_name text           -- "Plan"      (snapshot)
percent numeric(5,2)     -- "%"
base_amount numeric(14,2)
commission_amount numeric(14,2)  -- "Monto Comision"
concept text default 'COMISION'
rule_id uuid, rule_snapshot jsonb   -- trazabilidad: qué regla y con qué valores
is_settled bool default false
created_at
```

Dos garantías que hay que escribir explícitamente:

- **`ON DELETE RESTRICT` hacia `sales`.** Todo el esquema actual cascadea desde
  `sales` (ver CLAUDE.md → "FK en Cascada"). Acá **no**: borrar una venta no puede
  borrar un ítem de una liquidación ya pagada. Es dato contable.
- **Anti doble pago.** `UNIQUE (period_id, sale_id)` + índice único parcial
  `UNIQUE (sale_id) WHERE is_settled` → una venta no puede liquidarse dos veces. Un
  trigger setea `is_settled` cuando el período pasa a `cerrada`/`pagada`.

- **Snapshot inmutable.** Nombre, plan, %, montos y la regla aplicada se congelan en
  el ítem. Cambiar una regla mañana **no** altera una liquidación de ayer.

#### 4.1.6 `commission_settings` — config del módulo por empresa

Tabla propia, **no** columnas en `company_settings` (Lovable la sobreescribe).

```
company_id, accrual_event, liquidation_prefix, next_liquidation_number, is_enabled
```

### 4.2 Funciones (RPC, `SECURITY DEFINER` con chequeo de rol)

| Función | Qué hace |
|---|---|
| `commission_resolve_rule(sale_id)` | Devuelve la regla que aplica + % + base. Pura, sin escritura. |
| `commission_preview(company, salesperson, from, to)` | **Vista previa sin escribir nada.** Lista qué se liquidaría y qué ventas quedan sin regla. |
| `commission_generate_period(...)` | Crea el período en `borrador` + sus ítems. |
| `commission_close_period(period_id)` | Congela: `status='cerrada'`, `is_settled=true`, calcula total. Irreversible salvo `anulada`. |
| `commission_annul_period(period_id, motivo)` | Anula (no borra) y libera los `is_settled`. |

### 4.3 Momento de devengamiento (parametrizable)

Como **no hay módulo de cobranzas**, no se puede comisionar "sobre cuota cobrada".
`commission_settings.accrual_event` acepta:

- `firma_completa` → `sales.signature_completed_at IS NOT NULL` (163 ventas hoy)
- `venta_completada` → `sales.status = 'completado'` (163 ventas hoy) ← **default propuesto**

Si mañana entra un módulo de cobranzas, se agrega un tercer valor sin migrar nada.

### 4.4 RLS (desde el día 1, con el patrón correcto)

Aplicar ya el envoltorio `(select auth.uid())` — bug conocido #6 de CLAUDE.md — para
no generar warnings `auth_rls_initplan` nuevos.

| Rol | Permiso |
|---|---|
| `super_admin` | Todo |
| `admin`, `financiero` | Todo dentro de su `company_id` |
| `supervisor`, `auditor` | Lectura de su empresa |
| `vendedor` | **Solo sus propios ítems**, y solo de períodos `cerrada`/`pagada` |
| `anon` | **Nada.** Ningún GRANT. No es dato público. |

### 4.5 Frontend

Nueva ruta `/comisiones`, lazy-loaded. Impacto en archivos existentes: **2 líneas**
(una ruta en `App.tsx`, un ítem de menú gated por rol).

- `CommissionRulesPanel` — ABM de la matriz de reglas, con simulador ("si vendo el
  plan X siendo el vendedor Y, ¿cuánto comisiono?").
- `CommissionPeriodList` / `CommissionPeriodDetail` — liquidaciones y su detalle.
- `CommissionPreview` — vista previa antes de generar, resaltando **ventas sin regla**.
- Hooks: `useCommissionRules`, `useCommissionPeriods`, `useCommissionItems`.

Reusar `formatCurrency()` de [utils.ts:10](../src/lib/utils.ts) + `company_currency_settings`.

⚠ Al mostrar fechas, usar `split('-')`, nunca `new Date(isoStr)` — bug conocido #1.

### 4.6 PDF de la liquidación

> ⛔ **NO tocar `generate-base-pdf`.** Regla crítica del proyecto.

Edge function **nueva**: `generate-commission-pdf`. Usa el mismo renderer externo
(`RENDER_URL` / `RENDER_KEY`) y la misma técnica de branding que v82: tabla HTML con
`<thead>`/`<tfoot>`, `displayHeaderFooter: false`, `margin: 0`.

Columnas a reproducir del formato legado: `Item`, `Tipo`, `Fecha`, `Monto Comisión`,
`Id Cliente`, `Sec`, `Cliente`, `Plan`, `%`, `Concepto`. Cabecera con nombre del
promotor, `Tip Prom`, `N° Liquidacion`, concepto y datos de la empresa. Pie con
`Total x Concepto` y el **importe en letras** (helper nuevo número→letras en español,
guaraníes sin decimales).

---

## 5. Preguntas abiertas (no bloquean el arranque, sí el cálculo final)

1. **Base del cálculo.** El % ¿se aplica sobre `plans.price`, sobre
   `sales.total_amount`, o sobre la primera cuota? El diseño lo deja parametrizable
   (`commission_rules.base`), pero hay que fijar el default. Dato del reporte legado:
   43.364 al 30 % ⇒ base 144.546; 95.455 al 50 % ⇒ base 190.910.
2. **Qué es la columna "Sec"** (valores 1, 3, 11, 6…). ¿Cantidad de miembros del
   grupo familiar? ¿Número de cuota? ¿Secuencia del cliente? Define si un ítem es por
   venta o por adherente.
3. **Qué es "Tip Prom 86"** — ¿código de categoría de promotor? ¿legajo?
4. **Promotores externos.** ¿Todos los que comisionan son usuarios del sistema
   (`profiles`), o hay promotores que no se loguean? Si los hay, `salesperson_id`
   necesita un camino alternativo.
5. **Periodicidad y corte.** ¿Mensual? El reporte dice 27/07/17 con ventas de todo
   julio. ¿Qué pasa con una venta firmada después del cierre?
6. **Planes con `price = 0`.** 4 de 6 planes no tienen precio cargado (solo Alfa y
   Beta). Si la base es `plan_price`, hay que cargarlos antes de liquidar.
7. **¿"Plan Materno" comisiona como producto propio?** Hoy es un `template` sin fila
   en `plans` y sin ventas. Si comisiona distinto, la matriz necesita dimensión
   `template_id`. Ver §2.1.

---

## 6. Fases de trabajo (protocolo de AGENTS.md)

| # | Fase | Entregable |
|---|---|---|
| 0 | **Habilitar test** | `git pull` (2 commits atrás) → token de acceso al proyecto US → scripts `:test` en `package.json` → refrescar datos de test con el sync (§2.1). **Bloqueante.** |
| 1 | **Analizar** (`Explore`) | Confirmar que ninguna tabla/función nueva colisiona; mapear puntos de integración. |
| 2 | **Planificar** (`Plan`) | Orden de migraciones, contratos de las RPC. |
| 3 | **Desarrollar** | Migraciones → RPC → hooks → UI → edge function PDF. En ese orden. |
| 4 | **Testear** (`Explore` **independiente**) | Regresiones sobre ventas/firma + casos borde del cálculo. Agente distinto al de la fase 3. |
| 5 | **Corregir** | Lo que salga de la fase 4. |
| 6 | **Deploy a test** | Migraciones + edge function en US. Validación con datos reales clonados. |
| 7 | **Promoción a prod** | §9. Solo con fase 6 al 100 %. |

**Casos de prueba mínimos para la fase 4:**

- Venta sin regla aplicable → aparece como excepción, no como 0.
- Dos reglas empatadas → rechazado por el `UNIQUE`, no resolución al azar.
- Regla específica de vendedor gana sobre regla de plan.
- Cambiar una regla **después** de cerrar un período no altera el histórico.
- Intentar liquidar dos veces la misma venta → bloqueado por el índice parcial.
- Intentar borrar una venta con ítem liquidado → bloqueado por `RESTRICT`.
- Vendedor autenticado no ve comisiones de otro vendedor (RLS).
- Vendedor no ve períodos en `borrador`.
- PDF con 60+ ítems → branding repetido en ambas páginas (como el legado).
- **Regresión**: el flujo de firma completo sigue funcionando igual.

---

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| **R1** | **`config.toml` apunta a PROD.** Un `db push` sin `--project-ref` migra producción. | Scripts `:test` en `package.json` con el ref fijo. Nunca tipear el comando a mano. |
| **R2** | Sin token para la org del proyecto US → no se pueden desplegar edge functions a test. | Conseguir el token en la fase 0. Fallback parcial: SQL Editor para migraciones. |
| **R3** | 4/6 planes con `price = 0`. | Cargar precios antes de liquidar, o usar `sale_total_amount` como base. |
| **R4** | Lovable sobreescribe archivos en cada deploy. | El módulo no toca archivos que Lovable regenera. `generate-base-pdf` intacta. |
| **R5** | Un cambio de regla altera liquidaciones históricas. | Snapshot inmutable en `commission_items` + `rule_snapshot`. |
| **R6** | Doble pago de una comisión. | `UNIQUE (period_id, sale_id)` + índice parcial sobre `is_settled`. |
| **R7** | Drift entre test y prod al momento de promover. | Al 2026-08-04 el **esquema no tiene drift** (§2.1); los **datos** sí (test congelado en abril). Refrescar con `scripts/sync-br-to-us-test.mjs` antes de empezar; re-verificar el diff de esquema antes de promover. |
| **R8** | Datos reales de clientes en test. | El script de sync ya redacta columnas sensibles (`api_key`, `secret`, `token`, `password`). Verificar antes de clonar. |

---

## 8. Lo que **no** se toca

Registro explícito, para que la promoción sea auditable:

- ❌ `supabase/functions/generate-base-pdf/` — regla crítica del proyecto.
- ❌ Tablas `sales`, `clients`, `beneficiaries`, `plans`, `profiles`, `documents`,
  `signature_links`, `signatures` — ni columnas, ni constraints, ni RLS.
- ❌ El flujo de firma (`finalize-signature-link`, `pades-sign-document`, `signature-otp`).
- ❌ `client.ts` — la separación test/prod ya es correcta.
- ❌ Políticas RLS existentes.
- ❌ `company_settings` — la config del módulo va en tabla propia.

---

## 9. Runbook de promoción a producción

> Ejecutar **solo** cuando la fase 6 esté validada al 100 % en test.

### 9.1 Inventario de lo que se promueve

**A. Migraciones SQL** (aditivas, en este orden):

1. `commission_promoter_types`
2. `commission_plan_settings`
3. `commission_rules` (+ constraint UNIQUE de dimensiones)
4. `commission_periods`
5. `commission_items` (+ FK `RESTRICT` a `sales`, + índice parcial anti doble pago)
6. `commission_settings`
7. Funciones RPC (`resolve_rule`, `preview`, `generate_period`, `close_period`, `annul_period`)
8. Políticas RLS de las 6 tablas (con `(select auth.uid())`)
9. GRANTs a `authenticated` — **ninguno a `anon`**
10. Índices de performance

**B. Edge function**: `generate-commission-pdf` (**nueva**; no se redespliega ninguna existente)

**C. Frontend**: componentes y hooks nuevos + 2 líneas en `App.tsx` (ruta + menú)

**D. Datos semilla en prod** (carga manual, no migración):
- `commission_settings` de la empresa `0a1dc0e5-7378-4d14-b7bc-646b3e652bc6`
- Tipos de promotor
- Mapeo plan → INDIVIDUAL/GRUPAL
- La matriz inicial de reglas ← **requiere las respuestas de §5**

### 9.2 Orden de ejecución

1. Backup / snapshot de la DB de producción.
2. Diff de esquema test vs prod — abortar si hay drift inesperado.
3. Migraciones 1-10 (aditivas; no hay ventana de indisponibilidad).
4. Verificar que el flujo de ventas y firma sigue OK — **antes** de exponer la UI.
5. Desplegar `generate-commission-pdf`.
6. Desplegar el frontend con la ruta **oculta** (`commission_settings.is_enabled = false`).
7. Cargar los datos semilla.
8. Correr `commission_preview` sobre un mes cerrado y **contrastar contra el cálculo
   manual actual**. No liquidar hasta que cuadre.
9. Activar `is_enabled = true` para los roles `admin`/`financiero`.
10. Verificar advisors de Supabase — que no aparezcan warnings nuevos.

### 9.3 Rollback

- **Nivel 1** (inmediato): `commission_settings.is_enabled = false` → la UI
  desaparece, los datos quedan. Sin deploy.
- **Nivel 2**: revertir el deploy del frontend. Las tablas quedan huérfanas pero
  inertes — no las lee nadie.
- **Nivel 3** (solo si nunca se liquidó nada): `DROP` de las 6 tablas en orden
  inverso. **Si ya hay liquidaciones cerradas, no se dropea**: es dato contable.

Como todo es aditivo, **ningún rollback afecta ventas, firmas ni documentos**.

### 9.4 Post-deploy

- [ ] Advisors de Supabase sin warnings nuevos de `auth_rls_initplan`
- [ ] Anotar en CLAUDE.md las tablas nuevas y las FK que **no** cascadean
- [ ] `graphify update .`
- [ ] Confirmar que `generate-base-pdf` sigue en v82 (branding en los PDF de contrato)
