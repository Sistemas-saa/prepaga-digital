# Pruebas de test — Entrega A: puntos pendientes y estado de los casos

> Tablero de estado del manual de pruebas. El manual dice **cómo probar**; este archivo dice
> **cómo salió** y **qué falta**.

| | |
|---|---|
| **Documento de referencia** | [`docs/manual-entrega-a/Manual-Entrega-A.pdf`](../manual-entrega-a/Manual-Entrega-A.pdf) — v2, 43 páginas, generado el 2026-09-02 (commit `49483c2`) |
| **Fuente editable** | [`docs/manual-entrega-a/manual.html`](../manual-entrega-a/manual.html) (1152 líneas) |
| **Casos** | `CP-01` … `CP-29` |
| **Base de prueba** | US test — `ykducvvcjzdpoojxlsig` (**nunca** contra BR producción) |
| **Aplicación** | `http://localhost:8080` (`npm run dev` apuntando a US test) |
| **Usuario con el que se ejecutó** | `cacosta.ma@gmail.com` (super_admin) |
| **Datos de la corrida** | venta `2026-000027` · anexo `ANX-2026-000002` · cambio de plan `CMB-2026-000002` |
| **Fecha de corte de este informe** | 2026-09-08 |

**Leyenda de estados**

| Símbolo | Significa |
|---|---|
| ✅ Verificado | El caso se ejecutó y el manual adjunta la captura del **resultado esperado**. |
| ◑ Ejecutado, sin captura | El manual redacta el resultado y el mensaje textual, pero **no adjunta imagen del resultado**. No hay evidencia gráfica. |
| ❌ Falló | Ningún caso quedó en este estado. |
| ☐ No probado | Ninguno: los 29 casos figuran ejecutados. |

---

## 1. Puntos pendientes

| ID | Punto | Origen | Tipo | Estado |
|---|---|---|---|---|
| P-01 | **WhatsApp no se envía en el entorno de prueba.** Los botones *Enviar por WhatsApp* están, pero el mensaje no llega a ningún teléfono; se firma copiando el enlace a mano. | `manual.html:149-153`, `:411` | Entorno — sin cubrir | Abierto |
| P-02 | **El OTP no se ejercita.** En la empresa de prueba la política «exigir OTP para firmar» está desactivada, así que el firmante pasa directo del consentimiento a la firma. | `manual.html:156-160` | Entorno — sin cubrir | Abierto |
| P-03 | **El aviso automático al titular** con el link de descarga del contrato (válido 7 días) está descrito pero no es verificable, por P-01. | `manual.html:496-498` | Entorno — sin cubrir | Abierto |
| P-04 | **El R.U.C. no valida formato**: acepta cualquier texto. Sale impreso en los DATOS DE FACTURACIÓN del contrato. | `manual.html:957-961` (CP-21) | Producto — validación faltante | Abierto |
| P-05 | **Iconos de lápiz y papelera visibles en contratos firmados.** En *Editar Venta* siguen a la vista aunque el contrato esté firmado; el bloqueo actúa al intentar la acción, pero el botón confunde. | `manual.html:1045-1050` (CP-26) | UX — reportado, sin corregir | Abierto |
| P-06 | **FK `fk_sales_salesperson` en US test.** Sin ella PostgREST no resuelve el embed del vendedor y *Enviar Documentos para Firma* **falla en silencio**. | `docs/manual-entrega-a/README.md:95-101` | Entorno — dependencia | ✅ Resuelto (verificado 2026-09-04) |
| P-07 | **Entrega A no está en BR producción.** Falta todo el esquema: `adherent_incorporations`, `plan_changes`, `beneficiaries.entry_date` / `.immediate_coverage`, `clients.external_id`, `sales.employee_signature_mode`, las 3 plantillas y el módulo de comisiones completo. | `CLAUDE.md` — *Estado por entorno* | Deploy — runbook aparte | Abierto |
| P-08 | **9 casos sin captura del resultado esperado**: CP-08, CP-19, CP-20, CP-21, CP-25, CP-26, CP-27, CP-28, CP-29. | conteo sobre `manual.html` | Evidencia — incompleta | Abierto |
| P-09 | **Venta a EMPRESA con nómina: sin probar contra la base.** El módulo está implementado y commiteado (`0ea9700`), con 110 checks del motor en verde, pero **las migraciones `20260908*` todavía no se aplicaron en US test**, así que ningún caso se ejecutó end-to-end. | `CLAUDE.md` — *Venta a EMPRESA* | Deploy + prueba — pendiente | Abierto |

### Detalle

**P-01 · WhatsApp** — *"En el entorno de prueba NO se envía WhatsApp. Los botones Enviar por
WhatsApp están, pero el mensaje no llega a ningún teléfono. Para firmar, use Copiar Enlace en la
pantalla Flujo de Firma y péguelo en el navegador. Esto es una limitación del entorno de prueba,
no del sistema."* (`manual.html:149-153`).
**Qué falta para cerrarlo**: probar contra una sesión WAHA real (`https://waha.saa.com.py`,
`whatsapp_provider = 'qr_session'`) con un número de destino controlado, y verificar la fila en
`whatsapp_messages`. Alcanza a tres envíos automáticos del flujo: el aviso a la contratada al
completarse el paso 1, el aviso al titular con el link de descarga (P-03), y el OTP (P-02).

**P-02 · OTP** — *"Tampoco pide código OTP … En producción, según cómo esté configurada la
empresa, puede aparecer un paso extra de código de verificación."* (`manual.html:156-160`).
**Qué falta**: activar la política en una empresa de prueba y ejercitar el paso, incluyendo el
camino negativo (código incorrecto y código vencido), que hoy no está ni siquiera redactado como
caso. Depende de P-01, porque el OTP viaja por WhatsApp.

**P-03 · Link de descarga al titular** — el flujo lo genera al firmar la contratada
(`manual.html:496-498`). **Qué falta**: además del envío, validar la caducidad a los 7 días.

**P-04 · R.U.C.** — *"hoy el campo no valida el formato — acepta cualquier texto. No es un bug
nuevo, es una validación que todavía no existe."* (`manual.html:957-961`).
**Qué falta**: definir la regla (formato paraguayo `NNNNNNN-D`, con dígito verificador) y
aplicarla en el alta/edición de cliente empresa. Es un cambio de código con su propio ciclo —
ver *Fuera de alcance* al final.

**P-05 · Iconos visibles con contrato firmado** — *"Vale reportarlo como detalle de usabilidad."*
(`manual.html:1045-1050`). **Qué falta**: ocultar o deshabilitar los iconos cuando
`canMutateBeneficiaries` (`src/lib/saleUtils.ts`) devuelve falso, en vez de dejar que el usuario
llegue al error. El bloqueo real (guarda en los hooks + trigger
`trg_beneficiaries_block_when_sale_signed`) ya funciona y no se toca.

**P-06 · FK `fk_sales_salesperson`** — verificado el 2026-09-04 en US test:

```
conname               | def
----------------------+--------------------------------------------------------------
fk_sales_salesperson  | FOREIGN KEY (salesperson_id) REFERENCES profiles(id) ON DELETE SET NULL
```

Queda registrado igual: si la base de prueba se reconstruye, hay que volver a aplicar
`sql/20260902_us_test_fk_sales_salesperson.sql` o el botón falla sin decir nada.

**P-07 · Entrega A no está en producción** — es el pendiente de mayor peso: **todo lo que este
manual prueba existe únicamente en US test**. Llevarlo a BR requiere las migraciones `20260813*`,
`20260817*`, `20260818*`, `20260819*` y `20260822*`, más las columnas nuevas, con su propio
runbook. Ver `CLAUDE.md` → *Tipos de Venta y Anexos → Estado por entorno* y
*Módulo de Comisiones*.

**P-09 · Venta a EMPRESA** — el código está en la rama pero la base de test no tiene el
esquema todavía. **Qué falta, en orden**:

1. Pegar `sql/aplicar-nomina-empresa-test-PASO1.sql` en el SQL Editor de US test
   (`ykducvvcjzdpoojxlsig`, **nunca** BR). Aborta solo si el filtro por `status` fuera a cambiar
   el total de alguna de las 28 ventas existentes; las 11 filas de VERIFICACIÓN deben decir `OK`.
2. Pegar `sql/aplicar-nomina-empresa-test-PASO2.sql` (siembra las 2 plantillas nuevas). Sin este
   paso no hay nada que adjuntar a la venta y el flujo queda inutilizable.
3. Regenerar `src/integrations/supabase/types.ts` (en PowerShell, `| Out-File -Encoding utf8`).
4. Recién ahí correr los casos nuevos: cargar una empresa con 2 empleados de planes distintos y
   adherentes propios, firmar el contrato, y después un **alta** y una **baja** por la pestaña
   *Movimientos*. Lo que hay que mirar en la baja: que **no** se generen DDJJ ni enlaces de firma
   para quien sale, y que el total del contrato baje exactamente por empleado + adherentes.

Los criterios de rechazo del punto 3 (bugs #12 y #13) aplican igual a estos casos.

**P-08 · Evidencia faltante** — nueve casos no tienen captura del resultado esperado. Tres de
ellos (CP-19, CP-20, CP-21) sí tienen capturas de la funcionalidad en su sección, pero no del
mensaje o del anexo resultante. Detalle en la tabla del punto 2.

### Comportamientos esperados que parecen bugs

No reportar como fallas:

- **Una venta cargada por un usuario administrativo no aparece en ninguna liquidación.** Sólo se
  liquidan las ventas de vendedores habilitados en *Vendedores que comisionan*
  (`manual.html:803-807`).
- **Regenerar documentos de una venta cerrada tira un error en pantalla.** Es el comportamiento
  correcto: el error viene de la base y protege la evidencia de una firma real
  (CP-27, `manual.html:1054-1067`; ver también `CLAUDE.md` bug #12).
- **El contrato madre puede necesitar un F5** para mostrar el cambio recién aplicado por el
  anexo. Si después de recargar sigue igual, ahí sí es un problema (`manual.html:1130-1136`).
- **Las pestañas *Incorporaciones* y *Cambio de Plan* no aparecen** si el contrato todavía no
  está firmado (`manual.html:214-216`).

---

## 2. Estado de los casos CP-01 … CP-29

### Capítulo 3 — Caso maestro

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-01 | Cargar una venta nueva | POSITIVO | ✅ Verificado | `11-nueva-venta-basico.jpg` | |
| CP-02 | Cargar un adherente con Vigencia Inmediata | POSITIVO | ✅ Verificado | `12-adherente-alta.jpg`, `13-adherente-guardado.jpg`, `10-ventas-lista.jpg` | |
| CP-03 | Enviar a auditoría y aprobar | POSITIVO | ✅ Verificado | `14-panel-auditoria.jpg`, `15-detalle-auditoria.jpg`, `16-decision-auditoria.jpg` | |
| CP-04 | Adjuntar plantillas y emitir los documentos | POSITIVO | ✅ Verificado | `17-templates-vacio.jpg`, `18-templates-asociados.jpg`, `19-flujo-firma.jpg` | Depende de P-06 (FK del vendedor). |

### Capítulo 4 — Ceremonia de firma

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-05 | Firmar como titular | POSITIVO | ✅ Verificado | `20-firmar-titular.jpg`, `21-consentimiento-legal.jpg`, `22-evidencias-y-firma.jpg`, `23-firma-titular-ok.jpg` | Se firmó por enlace copiado, no por WhatsApp (P-01). Sin paso de OTP (P-02). |
| CP-06 | Firmar como adherente | POSITIVO | ✅ Verificado | `24-firmar-adherente.jpg`, `25-flujo-contratada-activada.jpg` | El aviso automático a la contratada no se pudo ver llegar (P-01). |
| CP-07 | Firmar como contratada y cerrar la venta | POSITIVO | ✅ Verificado | `26-firmar-contratada.jpg`, `27-flujo-completo.jpg` | El aviso al titular con el link de descarga no se pudo verificar (P-03). |
| CP-08 | Abrir el enlace de la contratada antes de tiempo | NEGATIVO | ◑ Ejecutado, sin captura | — | Resultado esperado: «Enlace aún no disponible». **Sin evidencia gráfica.** |
| CP-09 | Firmar sin trazar la firma | NEGATIVO | ✅ Verificado | `94-neg-firma-sin-trazo.jpg`, `42-firma-trazada.jpg` | |

### Capítulo 5 — Anexo de Incorporación de Adherente

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-10 | Crear la incorporación | POSITIVO | ✅ Verificado | `30-incorporaciones-vacio.jpg`, `31-incorporacion-form.jpg` | |
| CP-11 | Emitir y firmar el anexo | POSITIVO | ✅ Verificado | `32-anexo-template.jpg`, `33-anexo-firmado.jpg` | |
| CP-12 | Verificar que el contrato madre se actualizó solo | POSITIVO | ✅ Verificado | `34-contrato-madre-actualizado.jpg` | Puede requerir recargar la página. |

### Capítulo 6 — Solicitud de Cambio de Plan

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-13 | Crear la solicitud de cambio de plan | POSITIVO | ✅ Verificado | `40-cambio-plan-form.jpg`, `41-cambio-plan-completo.jpg` | |
| CP-14 | Firmar el formulario y verificar la aplicación | POSITIVO | ✅ Verificado | `43-plan-aplicado.jpg` | |

### Capítulo 7 — Generación de Comisiones

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-15 | Calcular una liquidación | POSITIVO | ✅ Verificado | `51-comisiones-calculo.jpg` | |
| CP-16 | Generar con ventas sin regla | NEGATIVO | ✅ Verificado | `96-neg-sin-regla.jpg` | |
| CP-17 | Fechas invertidas | NEGATIVO | ✅ Verificado | `95-neg-fechas-invertidas.jpg` | |
| CP-18 | Revisar una liquidación cerrada | POSITIVO | ✅ Verificado | `50-comisiones-liquidaciones.jpg`, `53-liquidacion-cerrada.jpg` | Todo el módulo cae bajo P-07: no existe en producción. |

### Capítulo 9 — Vigencia Inmediata, Plan Materno y titular empresa

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-19 | Emitir el Anexo de Vigencia Inmediata | POSITIVO | ◑ Ejecutado, sin captura | — (la sección ilustra la carga con `70-vi-nivel-venta.jpg`, `71-vi-por-adherente.jpg`) | **Falta la captura del anexo emitido** listando sólo a los integrantes con V.I. = Sí. |
| CP-20 | Enviar a auditoría con campos del Plan Materno vacíos | NEGATIVO | ◑ Ejecutado, sin captura | — (la sección ilustra la carga con `73-plan-materno-check.jpg`, `74-plan-materno-tab.jpg`, `75-campos-del-plan.jpg`) | **Falta la captura del aviso** «Faltan campos obligatorios de Plan Materno: …» y del punto rojo en la pestaña. |
| CP-21 | Guardar una empresa sin razón social | NEGATIVO | ◑ Ejecutado, sin captura | — (la sección ilustra el alta con `76-clientes-lista.jpg`, `77-clientform-empresa.jpg`, `78-clientes-lista-empresa.jpg`) | **Falta la captura del mensaje** «La razón social es requerida». Relacionado con P-04. |

### Capítulo 10 — Casos negativos

| Caso | Título | Tipo | Estado | Evidencia | Nota |
|---|---|---|---|---|---|
| CP-22 | Crear una venta con campos obligatorios vacíos | NEGATIVO | ✅ Verificado | `91-neg-venta-campos-obligatorios.jpg` | |
| CP-23 | Adjuntar plantillas sin aprobar la auditoría | NEGATIVO | ✅ Verificado | `92-neg-templates-sin-auditoria.jpg` | |
| CP-24 | Enviar documentos con un adherente sin DDJJ | NEGATIVO | ✅ Verificado | `93-neg-adherente-sin-ddjj.jpg` | |
| CP-25 | Doble clic en «Enviar Documentos para Firma» | NEGATIVO | ◑ Ejecutado, sin captura | — | Protección contra contratos duplicados (`CLAUDE.md` bug #13, causa C). **Sin evidencia gráfica.** |
| CP-26 | Modificar adherentes de un contrato firmado | NEGATIVO | ◑ Ejecutado, sin captura | — | **Sin evidencia gráfica.** Detalle de UX abierto: P-05. |
| CP-27 | Regenerar documentos de una venta ya cerrada | NEGATIVO | ◑ Ejecutado, sin captura | — | El error en pantalla es el comportamiento correcto. **Sin evidencia gráfica.** |
| CP-28 | Abrir un enlace de firma vencido, revocado o ya usado | NEGATIVO | ◑ Ejecutado, sin captura | — | **Sin evidencia gráfica.** Si pasa con un enlace vigente, ver `CLAUDE.md` bug #7. |
| CP-29 | Editar o cancelar un anexo ya enviado a firmar | NEGATIVO | ◑ Ejecutado, sin captura | — | **Sin evidencia gráfica.** Se gatea por `operation_sale.status`, no por el status del anexo. |

**Resumen**: 29 casos · **20 ✅ Verificado** · **9 ◑ Ejecutado, sin captura** · **0 ❌ Falló** ·
**0 ☐ No probado**.

Las capturas viven en [`docs/manual-entrega-a/capturas/`](../manual-entrega-a/capturas/).

---

## 3. Criterios de rechazo

Si aparece cualquiera de estos, el caso **no pasa** y hay que reportarlo, aunque el resto del
flujo haya salido bien.

1. **El contrato final no tiene las dos firmas**, o se ven etiquetas HTML rotas en el texto
   (`manual.html:866-871`).
2. **Hay más de un contrato final por venta** (`manual.html:871`).
3. **Aparece «No se encontró el contrato firmado por el titular…»** (`manual.html:1101`). Frena a
   propósito para no perder la firma del cliente, pero significa que algo se rompió antes.

La verificación objetiva de los tres es el juego de queries del **bug #13** de `CLAUDE.md`.
**Las cuatro deben dar `0`**:

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

Y para los links fantasma de la contratada (`CLAUDE.md` bug #12), también `0`:

```sql
SELECT sale_id, count(*) FROM signature_links
WHERE recipient_type='contratada' AND step_order = 1
GROUP BY sale_id;
```

---

## 4. Cómo actualizar este archivo

Al correr una tanda de pruebas:

1. Tocar sólo las columnas **Estado**, **Evidencia** y **Nota** de la tabla del punto 2.
2. Un caso pasa a **❌ Falló** cuando el resultado real no coincide con el *Resultado esperado*
   del manual. Recordar que **un caso negativo que "pasa" es un bug** (`manual.html:163-166`).
3. Si aparece un pendiente nuevo, sumarlo a la tabla del punto 1 con el siguiente `P-NN` y su
   cita `archivo:línea`.
4. Actualizar la **fecha de corte** del encabezado.

Al reportar un problema, citar siempre las tres cosas que pide el capítulo 11.1 del manual:

- el **número de caso** (`CP-NN`),
- el **número de contrato** (ej. `2026-000027`),
- el **mensaje textual** que apareció, tal cual, incluidas las comillas.

Los avisos se van solos en 3–4 segundos abajo a la derecha: al probar un caso negativo, mirar esa
esquina apenas se hace clic (`manual.html:172-176`).

---

## Fuera de alcance de este documento

- **No corrige** P-04 (validación de R.U.C.) ni P-05 (iconos visibles en contratos firmados): son
  cambios de código con su propio ciclo; acá quedan registrados, no resueltos.
- **No regenera** el PDF del manual ni edita capturas.
- **No toca nada en BR producción.**
