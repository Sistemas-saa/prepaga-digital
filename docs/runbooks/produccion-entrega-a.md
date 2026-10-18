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
| `generate-base-pdf` | **No se redespliega.** El repo es la v82, igual a prod. Sólo verificar que siga teniendo `table-header-group` |

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
2. **Guarda automática:** cuenta las filas de cada tabla al empezar y al terminar. Si **alguna tabla termina con menos filas, aborta.**
3. **Una sola transacción:** si falla cualquier línea, no queda nada aplicado.
4. **`lock_timeout` corto:** si una tabla está en uso, el script se cancela en vez de dejar a los usuarios esperando.
5. **No se modifican los totales de ventas firmadas.**
6. **Backup `pg_dump` descargado** antes del ensayo y otro inmediatamente antes del cambio real.
7. **Foto de controles** antes y después: filas por tabla, suma de totales, cantidad de documentos firmados. Tiene que dar idéntica, salvo lo previsto.

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
| Base de datos | No | Tablas chicas (294 ventas): cada cambio bloquea milisegundos. `lock_timeout` cancela en vez de esperar |
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
- Correr el script y revisar la foto de controles.
- **Front nuevo** contra la copia, con el recorrido completo:
  - abrir ventas viejas y ver sus PDFs
  - firma titular → contratada
  - alta de adherente
  - cambio de plan
  - venta a empresa
- **Front viejo** contra la copia ya migrada: confirma la red de seguridad del rollback.
- Corregir y repetir. **Hasta que el ensayo no salga limpio, no se avanza.**

### Fase 2: simulacro sobre prod · 2 horas

- El script dentro de `BEGIN … ROLLBACK`: ejecuta todo, muestra los resultados y **deshace todo**.

### Fase 3: el cambio real (de noche) · 3 a 4 horas

1. Confirmar que no haya firmas en curso.
2. Nuevo backup.
3. Script de base con `COMMIT` y revisión de la foto de controles.
4. Edge functions, **siempre con `--project-ref ejiycfqxgtrzaysgpzmx`** (`supabase/config.toml` apunta a BR).
5. Push de `main` a `Sistemas-saa/prepaga-digital` (*fast-forward*).
6. **Etiquetar la imagen actual del front** para el rollback.
7. Construir la imagen nueva y recién después recrear el contenedor.
8. Venta de prueba completa.
9. Verificar con `build-version.json`, no mirando la UI (la PWA cachea).

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
