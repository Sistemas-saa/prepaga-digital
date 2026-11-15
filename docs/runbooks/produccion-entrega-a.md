# Pase a producción — Entrega A

> **Documento de contexto y plan.** No contiene código ni SQL ejecutable.
> Relevado el **2026-10-18** con consultas de **sólo lectura**: nada de lo descrito acá
> se aplicó todavía en producción.

---

## 1. Objetivo y reglas innegociables

Llevar a **BR producción** (`ejiycfqxgtrzaysgpzmx`) lo que hoy sólo vive en **US test**
(`ykducvvcjzdpoojxlsig`), desde la rama `codex/incorporacion-entrega-a`:

- anexos de incorporación de adherentes (altas y bajas)
- cambio de plan y anexo de vigencia inmediata
- venta a empresa: nómina de empleados y movimientos
- vigencia del contrato y aviso de vencimiento
- comisiones *(a confirmar si entra en esta vuelta)*

**Reglas:**

1. **No se borra ningún dato.**
2. **El sistema no se cae.** El único corte son 2 a 5 segundos al cambiar el front, de noche.
3. **Orden obligatorio: base → edge functions → front.** Nunca puede quedar "front nuevo + base vieja".
4. **Nada se aplica en prod sin haberlo ensayado antes** sobre una copia de prod.

---

## 2. Foto del estado actual

### Repositorios

| Rama | Último commit | Situación |
|---|---|---|
| `Sistemas-saa/prepaga-digital` · `main` | `6853893` (31/08, PR #6) | **Es lo que corre en prod.** `build-version.json` → `buildAt 2026-08-31T20:41Z` |
| `Sistemas-saa/prepaga-digital` · `TEST` | `ec7e889` (07/04) | Abandonada; no sirve de referencia |
| `DaltonP93/prepaga-digital` · `main` | `031d474` (PR #7) | 3 commits adelante del cliente |
| `codex/incorporacion-entrega-a` | — | 65 commits sobre `main`: 227 archivos, 37 migraciones |

**Conclusión:** el repo del cliente está **atrás** y no tiene commits propios. El pase es
*fast-forward*, sin conflictos y sin código que se pierda.

El **PR #7** (la DDJJ del responsable de pago sólo si el declarante es menor) es sólo front y
no depende de la base. Se puede subir antes y por separado.

### Base de producción frente a lo que asumen las migraciones

| Objeto | US test | BR prod |
|---|---|---|
| `beneficiaries.status` | ✅ | ❌ **la columna no existe** |
| `sale_addendums`, `approve_sale_addendum`, `try_complete_sale_addendum_for_link` | ✅ | ❌ |
| Tablas `commission_*` | ✅ | ❌ (0 tablas) |
| `sales.maternity_bonus`, `sales.contract_end_date` | ✅ | ❌ |
| `trg_beneficiaries_block_when_sale_signed` | ✅ | ❌ |
| Los 3 guards de la contratada | ✅ | ✅ |
| `uq_documents_contrato_final_por_venta (sale_id, name)` | ✅ | ✅ (variante correcta) |
| Plantillas con nombre duplicado por empresa | — | 0 (el UNIQUE de `20260822000001` pasa) |
| Última migración registrada | — | `20260828013425` |
| `pg_cron` / `pg_net` | ✅ | sólo está una de las dos → **verificar** |

**Consecuencia: las migraciones del repo NO corren tal cual en prod.**

- `20260818000002` aborta en su preflight, porque exime por nombre a funciones que en prod no existen.
- `20260908000004` filtra por `beneficiaries.status`, una columna que en prod no existe.

En test esos objetos los creó Lovable o SQL directo, y ninguna migración del repo los crea.
Hace falta un **PASO 0** que cree lo que falta antes de aplicar el módulo.

### Edge functions

| Función | Acción |
|---|---|
| `generate-pdf` | Desplegar (cambió `_shared/client-document.ts`) |
| `compose-template-pdf` | Desplegar (mismo motivo) |
| `generate-commission-pdf` | Desplegar **sólo si va comisiones**; en prod no existe |
| `generate-base-pdf` | **EXCLUIDA del pase: no se redespliega.** Sólo verificar que la de prod siga teniendo `table-header-group` |

> ⚠️ **`generate-base-pdf` difiere entre `main` y esta rama, y el lado roto es `main`.** En
> `main` está la versión de Lovable (`headerTemplate`, `displayHeaderFooter: true`: PDFs sin
> encabezado ni zócalo). La v82 correcta, igual a la de prod, entró al repo en `af7ba59`, que
> **sólo está en esta rama**. Mientras no se mergee, **nunca desplegar `generate-base-pdf` desde
> `main`**. El pase no la despliega: el paso de edge functions nombra las funciones una por una
> (nunca `functions deploy` sin nombre).

---

## 3. Riesgo sobre los datos

Análisis de las migraciones pendientes contra los datos reales de prod.

- **Ninguna migración tiene `DELETE` ni `TRUNCATE`** sobre datos existentes.
- Los `DROP TABLE` / `DROP COLUMN` son sobre objetos de comisiones que **en prod no existen**,
  así que ahí no hacen nada.
- **No se toca Storage:** los PDFs firmados están a salvo.

### ⚠️ Hallazgo crítico: `20260818000001` (backfill de totales)

Simulado contra prod, el backfill cambiaría **3 ventas `completado`**, y en las tres
**les duplicaría el total**:

| Venta | Total hoy | Total después |
|---|---|---|
| 2026-000109 | 90.000 | **180.000** |
| 2026-000191 | 275.000 | **550.000** |
| 2026-000207 | 250.000 | **500.000** |

En las tres, `titular_amount` es igual al monto del único adherente. No se sabe si el titular
paga y ese adherente no, o si es un dato mal cargado. **La decisión es de negocio.**

Mientras tanto, el script de prod **excluye del backfill las ventas firmadas y completadas**.
Un contrato con firma PAdES no puede quedar diciendo un total distinto al de la base.

### Otros cambios sobre datos existentes

- `status = 'active'` sobre la columna nueva `beneficiaries.status`: inocuo.
- `requires_adherents` sólo afecta a `member_role = 'empleado'`. En prod no hay ninguno, así que no hace nada.

### Cambio de comportamiento visible para los usuarios

Con `trg_beneficiaries_block_when_sale_signed`, **un admin ya no puede editar adherentes de un
contrato firmado**. Antes el front viejo se lo permitía; ahora va a dar error. Es el
comportamiento correcto (bug #11 de `CLAUDE.md`), pero **hay que avisarles**.

---

## 4. Garantías de que no se pierde ningún dato

1. El script **no contiene `DELETE`, `TRUNCATE` ni `DROP`** sobre nada que exista hoy en prod. Se revisa a mano antes de correrlo.
2. **Guarda automática:** antes de tocar nada guarda la identidad física (`ctid` + `xmin`) de **cada fila de cada tabla** y las columnas con su tipo. Si al final **una sola fila preexistente fue escrita** (aunque sea con los mismos valores), borrada, o desapareció una columna, **aborta**. Detalle en §11.
3. **Una sola sentencia:** si falla cualquier paso, no queda nada aplicado.
4. **`lock_timeout` corto:** si una tabla está en uso **al pedir el bloqueo**, el script se cancela en vez de encolar a los usuarios. Ojo: limita la espera, no cuánto dura el bloqueo una vez tomado (ver §5).
5. **Destino verificado:** el esquema de `public` tiene que coincidir columna por columna con la referencia aprobada de prod; si no, aborta sin hacer nada.
6. **No se modifican los totales de ventas firmadas.**
7. **Backup `pg_dump` descargado** antes del ensayo y otro inmediatamente antes del cambio real. El `pg_dump` **no incluye Storage** (los PDFs): el pase no toca Storage, así que restaurar la base no los afecta, pero tampoco los protege. Ver §8.
8. **Foto de controles** antes y después: filas por tabla, suma de totales, cantidad de documentos firmados. Tiene que dar idéntica, salvo lo previsto.

---

## 5. Garantías de que el sistema no se cae

Cada estado intermedio funciona:

```
front viejo + base vieja   ✅  (hoy)
front viejo + base nueva   ✅  (la base sólo AGREGA cosas)   ← se prueba en el ensayo
front nuevo + base nueva   ✅
```

Nunca se pasa por **front nuevo + base vieja**, que es lo único que rompería.

| Paso | ¿Se corta? | Detalle |
|---|---|---|
| Base de datos | **Pausa breve, a medir** | Desde el `ALTER TABLE` del PASO 0 hasta el final del script, las tablas alteradas (`beneficiaries`, `sales`, `clients`, `templates`…) quedan con bloqueo exclusivo: **se frenan lecturas y escrituras** (esperan, no fallan). Tablas chicas (306 ventas) y guarda de 0,08 s; en PGlite la ventana fue 0,13 s, pero **en prod hay que medirla**: el SIMULACRO la informa (`Tablas bloqueadas X s`). `lock_timeout = 3s` sólo limita la espera para *conseguir* cada bloqueo |
| Edge functions | No | Supabase cambia la versión de forma atómica |
| Front | **2 a 5 s** | `docker-compose.yml` publica un solo contenedor (`prepaga-web`, puerto `8080`). Se construye la imagen **antes**, con el viejo atendiendo, y recién después se recrea el contenedor. De noche y sin firmas en curso |

- Quien tenga la página abierta sigue con el front viejo hasta recargar. No es problema: el front viejo funciona con la base nueva.
- **Corte cero es posible:** contenedor nuevo en otro puerto, probarlo y cambiar el proxy. Requiere saber qué proxy está delante de `prepaga.saa.com.py`.

---

## 6. Fases

### Fase 0: preparación (prod no se toca) · 2 días

- Merge de `codex/incorporacion-entrega-a` a `main` por PR.
- Backup `pg_dump` de prod descargado.
- Comparación de esquema test ↔ prod, objeto por objeto (tablas, columnas, funciones, triggers, políticas, grants, extensiones, cron).
- Escribir **un único script de producción**: PASO 0, migraciones del módulo, plantillas por empresa (prod tiene 2 empresas) y foto de controles final.
- Verificar `pg_cron` y `pg_net`; el aviso de vencimiento (`20260910000003`) programa un job.

### Fase 1: ensayo con una copia de prod · 2 a 3 días

- Restaurar el backup en una base aparte: `supabase start` local o un proyecto Supabase de prueba.
- **Aislar la copia ANTES de abrirle cualquier front** (tiene teléfonos reales de clientes):
  ```sql
  -- en la COPIA, nunca en prod
  UPDATE public.company_settings SET whatsapp_gateway_url = NULL, whatsapp_api_key = NULL,
         contratada_auto_whatsapp = false, email_api_key = NULL, sms_api_key = NULL,
         twilio_auth_token = NULL, signwell_api_key = NULL;
  UPDATE public.company_otp_policy SET otp_whatsapp_gateway_url = NULL, smtp_host = NULL,
         smtp_relay_url = NULL;
  SELECT cron.unschedule(jobid) FROM cron.job;  -- los 2 de prod son UPDATE internos, pero
                                                -- disparan falsos abortos de la guarda
  ```
  Las edge functions leen la configuración de WAHA **de la base**: con eso vacío, una firma de
  prueba no puede mandar WhatsApp a un cliente real. Los secrets del proyecto de la copia
  (`RENDER_URL`, etc.) se cargan a mano y **sin** credenciales de WAHA de prod.
- Aislar la copia cambia filas de configuración, no columnas: la precondición de esquema del
  script sigue pasando.
- Correr el script y revisar la foto de controles.
- **Cómo apuntar un front a la copia sin tocar `client.ts`**: cualquier `vite build` apunta a
  prod a propósito, y el build de test sólo acepta el proyecto US. Para el ensayo se usa
  `vite dev`, que es el único modo que acepta otra base:
  1. `.env.local` con `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` de la copia.
  2. Front nuevo: `npm run dev` en esta rama. Front viejo: `git worktree add ../pd-main main` y
     `npm run dev` ahí, con el mismo `.env.local` (el `client.ts` de `main` también acepta el
     override en dev).
  3. **Antes de loguearse**, verificar en DevTools → Network que los pedidos van a
     `<ref-de-la-copia>.supabase.co` y no a `ejiycfqxgtrzaysgpzmx`.
- **Front nuevo** contra la copia, con el recorrido completo:
  - abrir ventas viejas y ver sus PDFs
  - firma titular → contratada
  - alta de adherente
  - cambio de plan
  - venta a empresa
- **Front viejo** contra la copia ya migrada: confirma la red de seguridad del rollback.
- Corregir y repetir. **Hasta que el ensayo no salga limpio, no se avanza.**

### Fase 2: simulacro sobre prod · 2 horas

- `sql/produccion-entrega-a-SIMULACRO.sql`: ejecuta todo y **deshace todo** (es una sola
  sentencia, no un `BEGIN … ROLLBACK`; ver §11). El resultado esperado es el error
  `SIMULACRO OK`, que además informa **cuántos segundos estuvieron bloqueadas las tablas** y
  si `db push` sigue bloqueado. Con esa medición se decide la ventana de la Fase 3.

### Fase 3: el cambio real (de noche) · 3 a 4 horas

1. Confirmar que no haya firmas en curso.
2. Nuevo backup.
3. Script de base con `COMMIT` y revisión de la foto de controles.
4. Edge functions, **una por una y por nombre** (`generate-pdf`, `compose-template-pdf`), siempre
   con `--project-ref ejiycfqxgtrzaysgpzmx` (`supabase/config.toml` apunta a BR). **Nunca
   `generate-base-pdf`** (ver §2) ni un `functions deploy` sin nombre.
5. Push de `main` a `Sistemas-saa/prepaga-digital` (*fast-forward*).
6. **Etiquetar la imagen actual del front** para el rollback.
7. Construir la imagen nueva y recién después recrear el contenedor:
   `docker compose build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) --build-arg GIT_BRANCH=main`.
   El Dockerfile ya no cae a `npm install` si el lock no coincide: si falla ahí, se corrige el
   lock en el repo, no en el servidor.
8. Venta de prueba completa.
9. Verificar con `build-version.json`, no mirando la UI (la PWA cachea): `commit` tiene que
   ser el SHA desplegado, no `unknown`.

### Fase 4: seguimiento · 1 a 2 días

- Logs de edge functions y de Postgres, advisors y reportes de los usuarios.

### Comisiones (si entra) · +3 días

- 10 migraciones propias.
- Configuración por SQL: `commission_settings`, `commission_plan_settings` (incluye `report_code`), `commission_admin_fees`, `tax_divisor`.
- Prueba de una liquidación completa con el Excel.

---

## 7. Estimación

| | Sin comisiones | Con comisiones |
|---|---|---|
| Días de trabajo efectivo | **5 a 7** | **8 a 10** |
| Calendario (con esperas y aprobaciones) | **~1,5 a 2 semanas** | **~2,5 a 3 semanas** |

**Lo que puede alargarlo:**

- Que la comparación de esquema encuentre más diferencias de las conocidas. Es el riesgo principal y se sabe al final del primer día.
- Problemas con Docker local en Windows. La alternativa es un proyecto Supabase de prueba.
- Esperas: las decisiones de negocio, el push al repo del cliente y el rebuild en Portainer.

---

## 8. Rollback

| Si falla… | Qué pasa | Cómo se vuelve |
|---|---|---|
| El script de base | Se cancela entero | Nada que hacer: prod queda igual |
| Una edge function | Ese PDF falla | Redesplegar la versión anterior |
| El front nuevo | Pantallas con error | Volver a la imagen etiquetada (2 a 5 s) |
| La base, después del `COMMIT` | — | Restaurar el backup. Sólo es necesario si el ensayo no atrapó algo |

> **Probar la restauración en la Fase 1**, no descubrirla en la noche del pase: restaurar el
> `pg_dump` en la copia, abrir una venta vieja y descargar su PDF firmado. Los PDFs viven en
> Storage, que el `pg_dump` no incluye: después de restaurar la base, los `signed_pdf_url` tienen
> que seguir resolviendo contra los mismos objetos (el pase no escribe ni borra en Storage).

**Punto de no retorno:** cuando los usuarios empiezan a cargar datos con las funciones nuevas
(anexos, nóminas). A partir de ahí, restaurar el backup perdería esos datos. Por eso la prueba
completa se hace la misma noche, **antes de abrir el sistema a los usuarios**.

---

## 9. Decisiones pendientes

1. **¿Comisiones entra en esta vuelta?** Recomendado: dejarlo para una segunda vuelta.
2. **¿Cuál es el total correcto de 2026-000109, 2026-000191 y 2026-000207?** Lo decide negocio.
3. **¿Qué proxy está delante del contenedor?** Sólo hace falta si se quiere corte cero.
4. **¿Se sube el PR #7 ya, por separado?**
5. **¿Quién hace el push a `Sistemas-saa/prepaga-digital` y el rebuild en Portainer?**

---

## 10. Referencias

- `CLAUDE.md`: *Estado por entorno*, bugs #10 (total), #11 (adherentes en contratos firmados) y #13 (contratos duplicados).
- `docs/runbooks/commission-us-test.md`
- `sql/verificar-*.sql`: verificaciones usadas en test, reutilizables como base de la foto de controles.
- Migraciones del módulo: `supabase/migrations/20260804*` … `20261007000001`.
- En el repo local quedó agregado el remote `saa` (sólo fetch). Se quita con `git remote remove saa`.

---

## 11. Plan de ajustes al script de producción (2026-10-25)

> Segundo relevamiento de **sólo lectura** sobre BR prod. Hoy: **306 ventas** (280 `completado`),
> 372 beneficiarios (270 titulares/primarios), 322 clientes, 10 plantillas, 2 empresas, PostgreSQL 17.6.
> Este apartado reemplaza al §3 donde se contradigan.

### Principio: el script no escribe ni una fila que ya exista

Sólo se permite: `ADD COLUMN` con default constante, `CREATE TABLE/FUNCTION/TRIGGER/INDEX/POLICY`
e `INSERT` de filas **nuevas** (las plantillas). **Cero `UPDATE`/`DELETE` sobre filas existentes.**

No es por prolijidad. En prod `beneficiaries` tiene 4 triggers, y cualquier `UPDATE` sobre esa
tabla los dispara:

| Trigger | Qué haría un `UPDATE` masivo |
|---|---|
| `trg_set_titular_amount` (BEFORE) | Recalcula `amount` del titular si está en 0/NULL (sólo existe en prod) |
| `trg_recalculate_sale_total` (AFTER) | Recalcula el total de la venta → **duplica las 3 ventas** del §3 |
| `trg_audit_beneficiaries` | Una fila de `audit_logs` por beneficiario tocado |
| `trg_beneficiaries_block_when_sale_signed` (nuevo) | Aborta el script en las 280 ventas completadas |

En PG 17, `ADD COLUMN ... DEFAULT <constante>` no reescribe la tabla y **no dispara triggers**.

### Ajustes necesarios

| # | Dónde | Problema en prod | Ajuste |
|---|---|---|---|
| **A1** | PASO 0 (nuevo) | Ninguna migración crea `beneficiaries.status` ni `beneficiaries.coverage_end_date`. La primera la filtran `recalculate_sale_total_amount` y la baja; la segunda la escriben `useCreateNominaTermination` y `activate_adherent_incorporation`. Sin ella **la primera baja falla** | `status text NOT NULL DEFAULT 'active'` + `beneficiaries_status_check IN ('active','inactive','pending_addendum_signature')`, y `coverage_end_date date`. **Con el DEFAULT**: así el `UPDATE ... WHERE status IS NULL` de `20260908000004` encuentra 0 filas y no dispara nada |
| **A2** | `20260818000001` | El backfill reescribe el total de 2026-000109, 000191 y 000207 (lo duplica). Las otras 303 ventas ya cuadran con la fórmula nueva (verificado) | El backfill queda **sólo como reporte** (`RAISE NOTICE`, sin `PERFORM`). La verificación final espera **exactamente esas 3** diferencias y aborta si aparece una cuarta |
| **A3** | `20260818000002` | El preflight exige `approve_sale_addendum` y `try_complete_sale_addendum_for_link`, que en prod no existen → aborta. Y el bloque `ALTER FUNCTION ... SET` sobre funciones inexistentes da `undefined_function`, que su `EXCEPTION` (sólo `insufficient_privilege`) no atrapa → aborta igual | Variante de prod: el preflight exige sólo `activate_adherent_incorporation()` y se quita el bloque de `ALTER FUNCTION`. El regex de exención queda igual (nombrar funciones que no existen no hace daño) |
| **A4** | `20260822000003` | Versiona `complete_adherent_incorporation`, legado que no llama nadie y que escribe `beneficiaries.source_incorporation_id` / `activated_at`, columnas que prod no tiene | **No se aplica en prod.** Sólo existía para pasar el preflight de A3 |
| **A5** | `20260822000002`, `20260908000006` | Insertan 5 plantillas × 2 empresas = 10, **activas**. El front viejo (`SaleTemplatesTab` de `main`) lista toda plantilla activa **sin filtrar por empresa**: entre el cambio de base y el del front, los vendedores verían 10 opciones nuevas (duplicadas por empresa) y podrían adjuntar un "Contrato Colectivo" a una venta común | Se siembran con `is_active = false`. Se activan **después** del front nuevo con un `UPDATE` acotado a esos 10 ids (filas que este mismo pase creó) |
| **A6** | Comisiones | `20260819000003` hace `ALTER TABLE commission_items`, que en prod no existe → aborta | Fuera de esta vuelta: se excluyen los 10 `20260804*`, `20260819000003` y `20261007000001` |
| **A7** | `20260910000003` | Ninguno: `pg_cron` 1.6.4 ya está y el job no usa `pg_net` | Se aplica tal cual. Hoy no genera avisos: `contract_end_date` nace NULL en todas las ventas (la migración no hace backfill a propósito) |

Lo que **no** necesita ajuste (verificado contra prod): `generate_contract_number` de prod es
idéntica a la "rama original" que conserva `20260813000002`, así que la serie `2026-NNNNNN` no
cambia; no hay plantillas con nombre repetido ni que choquen con las sembradas; las columnas
`NOT NULL DEFAULT` de `clients`/`sales` (`client_type`, `employee_signature_mode`) pasan sus CHECK
con el default.

### El script (generado)

| Archivo | Qué hace |
|---|---|
| `scripts/produccion/build-entrega-a.mjs` | Generador. Copia cada migración **tal cual** y aplica sólo los ajustes A2, A3 y A5, cada uno como un reemplazo de texto exacto que falla si no encuentra el original |
| `sql/produccion-entrega-a-SIMULACRO.sql` | Ejecuta todo y lo deshace. Termina con el error `SIMULACRO OK — nada quedo aplicado…`, **que es el resultado esperado** |
| `sql/produccion-entrega-a.sql` | Ejecuta todo y lo deja aplicado. Termina con un `SELECT` que dice `PASE APLICADO` |
| `scripts/produccion/ensayo/` | Ensayo en PGlite (Postgres en WASM) sobre una réplica mínima de prod |

No se editan a mano: si cambia una migración, se vuelve a correr el generador.

**Es una sola sentencia** (un `DO` que ejecuta cada paso con `EXECUTE`), no un `BEGIN … COMMIT`.
El SQL Editor del dashboard no mantiene una sesión entre sentencias, así que un `BEGIN` escrito en
el texto no garantiza el rollback: el 2026-10-08 un script dio error y aun así quedó aplicado
entero. Con varias sentencias, el SIMULACRO pegado en el editor podría haber dejado el pase
aplicado en prod. Una sentencia única es atómica en cualquier cliente.

```
DO $pase_entrega_a$                       -- una sola sentencia: todo o nada
  lock_timeout = 3s                       -- tope de ESPERA por bloqueo, no de duración
  0.a Precondiciones: aborta si ya está aplicado, o si el esquema de public
      no es EXACTAMENTE el aprobado (88 tablas, 969 columnas con su tipo)
  0.b Foto "antes" (esquema pe_scratch): ctid+xmin de cada fila, columnas y tipos
  PASO 0 (A1)
  20260813000001 · 000002 · 000003 · 20260817000001 · 000002
  20260818000001 (A2) · 20260818000002 (A3) · 20260818000003
  20260819000001 · 000002
  20260822000001 · 000002 (A5)            -- 20260822000003 NO (A4)
  20260908000001 … 000005 · 000006 (A5)
  20260909000001 · 000002 · 20260910000001 … 000004
  Verificación de objetos → guarda de datos → las 3 ventas conocidas
  Registro de las 24 versiones en supabase_migrations.schema_migrations
  Mediciones: segundos con tablas bloqueadas, 3 pasos más lentos, estado de db push
  REAL: borra pe_scratch, NOTICE con las mediciones
  SIMULACRO: RAISE 'SIMULACRO OK … Tablas bloqueadas X s …' → se deshace todo
```

Si algo falla, el mensaje termina en `[paso: <migración o paso>]`.

**Precondición de esquema (identifica el destino).** `scripts/produccion/esquema-prod-referencia.txt`
tiene el esquema de `public` de prod capturado el 2026-11-02 (88 tablas, 969 columnas con su tipo)
y el generador verifica su md5 contra el medido en prod, así que no hay error de transcripción
posible. El script compara la base destino contra esa lista y aborta ante **una sola** columna
de más, de menos o con otro tipo, nombrando las primeras 10. US test aborta (le faltan y le
sobran decenas); una copia restaurada de prod pasa, que es lo que necesita el ensayo. Si prod
cambia antes del pase (p. ej. un deploy de Lovable que agrega una columna), el script aborta:
revisar el cambio, recapturar con `scripts/produccion/esquema-prod-referencia.sql` (sólo lectura),
actualizar el md5 en el generador y volver a generar.

> ⚠️ **`db push` contra prod.** Las versiones excluidas (comisiones y `20260822000003`) **no** se
> registran en el historial, así que un `db push` las aplicaría. **Hoy no puede pasar**: el
> historial de prod tiene **89 versiones sin archivo en el repo** (relevado el 2026-11-02, sólo
> lectura), y con eso la CLI se niega a hacer push (*"Remote migration versions not found in local
> migrations directory"*). El pase no cambia eso, y el script lo informa al terminar
> (`db push: BLOQUEADO …`). **Lo único que lo destrabaría es un `supabase migration repair`**, que
> es justo lo que la CLI sugiere en ese error: **no correrlo nunca contra BR**. Y ojo: este repo
> está **linkeado a BR** (`supabase/.temp/project-ref` = `ejiycfqxgtrzaysgpzmx`), así que
> cualquier comando de la CLI sin `--project-ref` va a prod. Recomendado en cada máquina:
> `npx supabase unlink`.

### Guarda de datos (paso 8): prueba que ninguna fila existente cambió

No alcanza con contar filas: un `UPDATE` no cambia el conteo. La foto guarda, por tabla, el
conteo **y un md5 de las columnas que existían antes**:

| Tabla | Columnas del md5 | Esperado después |
|---|---|---|
| `sales` | `id, status, total_amount, titular_amount, contract_number, plan_id` | idéntico |
| `beneficiaries` | `id, sale_id, amount, is_primary, relationship` | idéntico |
| `clients`, `documents`, `signature_links`, `signatures` | `id, updated_at` (+ `is_final`, `signed_pdf_url` en documents) | idéntico |
| `audit_logs` | conteo | **idéntico** — si creció, algún trigger disparó |
| `templates` | conteo | **+10**, todas `is_active = false` |
| Resto de las tablas de `public` | conteo | idéntico |

Si cualquier fila no da, el script aborta y prod queda exactamente como estaba.

> **Implementación real (2026-11-02), más fuerte que la tabla de arriba.** La huella de cada una
> de las **88 tablas** es el conteo más un md5 de la **identidad física de cada fila**: `ctid`
> (dónde está esa versión de la fila) y `xmin` (qué transacción la escribió). Más la lista de
> columnas preexistentes con su tipo.
>
> Por qué alcanza sin mirar el contenido: en Postgres **no hay forma de cambiar una fila sin
> escribir una versión nueva**, con otro `ctid` y el `xmin` de esta transacción. Así que la huella
> cambia ante un `UPDATE` (aunque deje los mismos valores), un `DELETE`, un `INSERT`, o una
> reescritura de tabla, sea cual sea el tamaño del valor. Un `VACUUM` concurrente no la cambia: no
> mueve filas vivas y conserva el `xmin` original al congelarlas. Lo único que cambia datos sin
> escribir filas es el DDL (`DROP COLUMN`, `RENAME`, cambio de tipo): eso lo atrapa la lista de
> columnas.
>
> **Por qué se cambió.** La versión del 2026-10-25 hacía md5 del contenido, pero los valores de más
> de 2000 bytes (PDF en base64, HTML) entraban sólo por su tamaño almacenado: un cambio de contenido
> que conservara el tamaño pasaba sin detectarse. El ensayo lo demuestra: reemplazar texto en el
> contrato firmado del mock deja `pg_column_size` en 270 → 270, y la guarda nueva lo atrapa.
> Señalado por la revisión externa del 2026-11-02.
>
> **Costo**: medido en prod en modo lectura, **0,08 s las 88 tablas** (38.025 filas), contra 4,5 s
> de la versión anterior. Como la segunda foto corre con las tablas ya bloqueadas, esto también
> acorta la ventana de bloqueo.
>
> **Falsos positivos posibles**: si un usuario o un cron escribe en cualquier tabla entre las dos
> fotos, la guarda aborta. No se aplica nada, y se vuelve a correr. Los crons de prod corren a los
> **:00** (`signature_links`) y a los **:00 y :30** (`signature_identity_verification`): evitar
> esos minutos.

### Verificación hecha (2026-10-25)

**Contra prod, sólo lectura**: precondiciones OK; 2 empresas → 10 plantillas nuevas y 0 que choquen
por nombre; 0 nombres duplicados; 0 avisos de vencimiento previos; 0 ventas-operación previas;
ninguna de las 24 versiones ya registrada; las firmadas fuera de fórmula son **exactamente** las 3
conocidas, y las abiertas fuera de fórmula son 0; sin transacciones largas.

**Ensayo en PGlite** (`scripts/produccion/ensayo/run.mjs`; es PG 18, prod es 17): TODO OK
(actualizado el 2026-11-02).

| Caso | Resultado |
|---|---|
| Esquema distinto | Con la referencia de prod, la base del mock aborta en la precondición sin aplicar nada. Una **sola** columna de más (`clients.columna_que_prod_no_tiene`) también aborta, y el mensaje la nombra |
| SIMULACRO | Termina en `SIMULACRO OK`, y la base queda idéntica fila por fila: sin tablas, columnas ni esquema residual. Informa la ventana de bloqueo (0,13 s en PGlite), los pasos más lentos y `db push: BLOQUEADO` |
| REAL | Todas las tablas preexistentes idénticas (comparadas por separado, no con la huella del script); totales sin cambio; `audit_logs` no crece; +10 plantillas inactivas; job agendado; 24 versiones registradas |
| Después del REAL | El guard frena editar un adherente de una venta completada; un alta en borrador recalcula `titular + adherentes`; una fila de baja (`inactive` + `coverage_end_date`) se inserta y no suma; la numeración sigue en `2026-000301` |
| Segunda corrida | Aborta en la precondición |
| Sabotajes inyectados | `UPDATE` con **los mismos valores** sobre una venta; nombre pasado a minúscula; `DELETE` de una notificación; **contenido del contrato firmado cambiado conservando longitud y tamaño almacenado**; **`DROP COLUMN`** de una columna preexistente; plantilla sembrada activa. **Los seis abortan por la guarda**, y no queda nada aplicado |
| Reescritura de tablas | Ninguna de las 24 migraciones reescribe una tabla existente: si lo hiciera, el pase REAL abortaría por la guarda (cambia el `ctid` de todas las filas) |

### Secuencia completa

1. ~~Escribir el script~~ — hecho (generado, ver arriba).
2. **Ensayo** sobre una copia restaurada del `pg_dump` de prod (Fase 1): correrlo, después
   **front viejo** contra la copia (red del rollback) y **front nuevo** con el recorrido completo.
   Probar a propósito una **baja** (valida A1) y una **edición de adherente en una venta
   completada** (tiene que dar el error del guard).
3. **Simulacro sobre prod**: `sql/produccion-entrega-a-SIMULACRO.sql`. El resultado correcto es
   el error `SIMULACRO OK`. Anotar `Tablas bloqueadas X s`: es lo que van a esperar los usuarios
   en el cambio real. Después, confirmar por lectura que no quedó nada:
   `SELECT to_regclass('public.adherent_incorporations')` tiene que dar `NULL`.
4. **Cambio real** (Fase 3): backup → `sql/produccion-entrega-a.sql` → edge functions → front.
5. **Recién con el front nuevo arriba**: activar las 10 plantillas (A5):
   ```sql
   UPDATE public.templates SET is_active = true
    WHERE is_active = false
      AND name IN ('Anexo de Incorporación de Adherente', 'Formulario de Solicitud de Cambio de Plan',
                   'Anexo Especial de Vigencia Inmediata', 'Contrato Colectivo de Empresa',
                   'Anexo de Movimiento de Nomina');
   -- esperado: 10 filas. No dispara versionado (create_template_version sólo mira content).
   ```
6. Verificación final: las queries de detección del bug #13 de `CLAUDE.md` en 0 y la guarda
   vuelta a correr en modo lectura.

### Decisión de negocio que sigue abierta, y por qué importa más que antes

Las 3 ventas de A2 quedan con su total actual. Pero si algún día se firma un **alta de adherente
sobre una de ellas**, la activación recalcula el contrato madre con la fórmula nueva y **el total
salta al doble en ese momento**. Hay que decidir el total correcto de esas 3 **antes** de habilitar
Movimientos, o como mínimo antes de cargar un anexo sobre ellas.

---

## 12. Revisión externa del 2026-11-02 y qué se cambió

Una revisión estática del plan (sobre `6ea7ecc`) concluyó que el pase es viable pero no estaba
listo. Estado de cada punto:

| Punto de la revisión | Estado |
|---|---|
| El script no identifica la base destino | **Resuelto**: precondición de esquema contra la referencia aprobada (§11) |
| La guarda no detecta cambios de contenido grande que conserven el tamaño | **Resuelto**: guarda por `ctid` + `xmin` + columnas, con sabotaje que lo prueba (§11) |
| Los "2 a 5 s" de bloqueo no estaban demostrados; `lock_timeout` no limita la retención | **Corregido**: la afirmación estaba mal (el bloqueo frena también lecturas y dura del PASO 0 al final). El script ahora **mide** la ventana; se decide con el número del SIMULACRO (§5, Fase 2) |
| Un front de ensayo podría apuntar a prod | **Procedimiento**: `vite dev` + `.env.local` contra la copia y verificación en Network antes de loguearse; aislar WAHA/crons de la copia (Fase 1). No se tocó `client.ts` |
| `db push` accidental aplicaría lo excluido | **Verificado que hoy está bloqueado** (89 versiones remotas sin archivo); el script lo informa; regla: nunca `migration repair` contra BR, `supabase unlink` local (§11) |
| `generate-base-pdf` difiere entre `main` y la rama | **Aclarado**: el lado roto es `main`; queda excluida del pase por escrito (§2, Fase 3) |
| Dockerfile con fallback a `npm install`; `build-version.json` con commit `unknown` | **Resuelto**: sólo `npm ci` (lock verificado en sincronía con npm 10) y build-args `GIT_COMMIT`/`GIT_BRANCH` |
| Rollback: el backup no incluye Storage | **Documentado**: el pase no toca Storage; probar la restauración en la Fase 1 (§8) |
| Sin CI; pruebas funcionales pendientes (WhatsApp, OTP, descarga, nómina) | **Abierto**: el repo no tiene workflows. Antes de la decisión de prod: build + typecheck + ensayo PGlite sobre el commit exacto, y el recorrido funcional completo en la copia (Fase 1) |
| Las 3 ventas con total fuera de fórmula | **Abierto**: decisión de negocio, o no cargar anexos sobre ellas hasta decidir (§11) |

La recomendación de la revisión se mantiene: **preparación y ensayo sobre una copia aislada**, y
recién después una decisión de producción separada.

---

## 13. Ejecución en producción (2026-11-15)

**Base: APLICADA.** Edge functions: desplegadas. Front: código en los dos `main`, falta el rebuild.

| Paso | Resultado |
|---|---|
| Backup | Clon `prepaga-clon-2026-11-15` (*Restore to new project* del backup diario) y dump local en `C:\Programacion\CNAM\SAMAP\backups\prod-2026-11-15\` (339 ventas, 416 beneficiarios, 2602 documentos). Cero IO sobre prod |
| Ensayo sobre el clon (psql) | SIMULACRO OK (0,45 s) · PASE APLICADO (0,17 s) · REVERSO simulado OK |
| Simulacro en prod (SQL Editor) | 1er intento abortó en la precondición sin aplicar nada: el editor pega con CRLF. Corregido en el generador (`replace(…, chr(13), '')` por paso). 2º intento: **SIMULACRO OK, 0,46 s** |
| Pase real en prod (SQL Editor) | **PASE APLICADO**. Prod quedó byte a byte igual al clon ensayado (md5 de columnas, funciones, triggers, constraints, políticas y de las 10 plantillas); conteos y suma de totales idénticos; 705 documentos firmados intactos |
| Front viejo contra la base nueva | Probado en prod: dashboard, ventas, detalle, documentos y vista del contrato firmado; todas las consultas 200 |
| Edge functions | `generate-pdf` v58 (`verify_jwt: true`), `compose-template-pdf` v52 (`false`); las dos arrancan. `generate-base-pdf` sigue en v82 (`table-header-group`) |
| Git | PR #9 y #10 mergeados: `DaltonP93/main` = `Sistemas-saa/main` = `8e769e1` (fast-forward desde `6853893`) |
| Controles bug #13 | 0 / 0 / 0. Los 9 links de contratada con step 1 son históricos (anteriores al guard del 19/08) |

### Falta

1. **Rebuild del front en Portainer** (etiquetar antes la imagen actual como `pre-entrega-a`) y verificar
   `build-version.json`.
2. **Recién con el front nuevo arriba**, activar las 10 plantillas (§11, paso 5: se esperan 10 filas).
3. Avisar a los admins: ya no se editan adherentes de contratos firmados (va por *Movimientos*).
4. Decidir el total de 2026-000109 / 000191 / 000207 antes de cargarles anexos.
5. Borrar el clon `prepaga-clon-2026-11-15` cuando ya no haga falta (cuesta por hora) y el archivo
   `backups\clon2-pass.txt`.

### Vuelta atrás

| Falla | Acción |
|---|---|
| Algo del módulo nuevo se comporta mal | `sql/produccion-entrega-a-REVERSO.sql` (modo simulacro por defecto; cambiar `v_simulacro` a `false`). Restaura las 2 funciones reemplazadas byte a byte, apaga 4 triggers y el cron, desactiva las plantillas. No borra nada |
| Edge function | Redesplegar el archivo de `6853893` (`git show 6853893:supabase/functions/<fn>/index.ts`) con el mismo `verify_jwt` |
| Front nuevo | Volver a la imagen `pre-entrega-a` en Portainer |
| Base irrecuperable | Restore del backup / dump `prod-2026-11-15` (pierde lo cargado después) |
