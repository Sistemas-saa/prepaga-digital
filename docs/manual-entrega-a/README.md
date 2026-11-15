# Manual de Pruebas — Entrega A

Manual de usuario **y guía de pruebas** de las funcionalidades de **Entrega A** de SAMAP
Prepaga Digital. Está escrito para que el lector **repita cada caso con sus propias manos**:
cada caso trae ID, precondición, datos concretos, pasos numerados y resultado esperado.

Cubre el ciclo completo de una venta (carga → auditoría → emisión de documentos →
ceremonia de firma → contrato firmado), las operaciones sobre contratos firmados
(Incorporación de Adherente, Cambio de Plan, Vigencia Inmediata), Plan Materno, titular
persona jurídica y el módulo de Generación de Comisiones.

## Contenido de la carpeta

| Archivo | Qué es |
|---|---|
| `manual.html` | Fuente del manual. HTML autocontenido, pensado para imprimir a PDF (A4, saltos de página por capítulo). Las imágenes se referencian con rutas relativas a `capturas/`. |
| `Manual-Entrega-A.pdf` | Export final del manual (**43 páginas**). Es el entregable. |
| `capturas/` | 50 capturas de pantalla numeradas por capítulo. |
| `README.md` | Este archivo. |

## Cómo usar este manual para probar

1. Leer el **capítulo 1** completo: dice contra qué base se prueba, con qué usuario entrar
   y qué **no** se puede probar en el entorno de prueba (WhatsApp y OTP).
2. Ejecutar el **capítulo 3 (caso maestro)** de punta a punta. Todo lo demás se apoya en él:
   sin un contrato firmado no aparecen las pestañas *Incorporaciones* ni *Cambio de Plan*.
3. Seguir con los capítulos 5 y 6 (los dos anexos), que son el corazón de Entrega A.
4. El **capítulo 10** concentra los casos negativos. Un caso negativo que "pasa" es un bug.

Los casos están numerados `CP-01` … `CP-29`. Al reportar un problema conviene citar el
número del caso, el número de contrato y el mensaje textual que apareció (capítulo 11.1).

## Esquema de nombres de `capturas/`

`NN-slug.jpg`, donde el rango de `NN` agrupa por capítulo:

| Rango | Capítulo |
|---|---|
| `00` | Dashboard / preparación del entorno |
| `10`–`19` | Caso maestro: carga de venta, adherentes, auditoría, plantillas |
| `20`–`27` | Ceremonia de firma (titular, adherente, contratada) |
| `30`–`34` | Anexo de Incorporación de Adherente |
| `40`–`43` | Solicitud de Cambio de Plan |
| `50`–`53` | Generación de Comisiones |
| `60`–`61` | Documentos generados |
| `70`–`78` | Vigencia Inmediata, Plan Materno, titular empresa |
| `90` | Contrato final impreso (última página del PDF firmado) |
| `91`–`96` | Casos negativos |

Todas las capturas se tomaron con la app corriendo en local (`npm run dev`,
`http://localhost:8080`) apuntando a la **base de PRUEBA** (US test,
`ykducvvcjzdpoojxlsig`). No hay datos de producción.

Los flujos que ilustran no son maquetas: la venta `2026-000027`, el anexo `ANX-2026-000002`
y el cambio de plan `CMB-2026-000002` existen en esa base, con sus documentos firmados y su
paquete de evidencia.

> Las capturas se toman con la ventana del navegador tal cual, sin recortar. El recorte de
> la franja inferior vacía lo hace el CSS del manual (`.shot`, con `aspect-ratio` +
> `object-fit: cover`), así que **no hay que editar las imágenes**. Para una captura que
> deba verse entera (por ejemplo la página del contrato final), usar `<div class="shot full">`.

## Regenerar el PDF

Después de editar `manual.html` o de cambiar capturas:

```powershell
# Windows (PowerShell). Ajustar la ruta de chrome.exe si hace falta.
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --no-pdf-header-footer `
  --print-to-pdf="C:\Programacion\CNAM\SAMAP\sistema_ventas\prepaga-digital\docs\manual-entrega-a\Manual-Entrega-A.pdf" `
  "file:///C:/Programacion/CNAM/SAMAP/sistema_ventas/prepaga-digital/docs/manual-entrega-a/manual.html"
```

> El PDF se genera abriendo `manual.html` con `file://` (así Chrome resuelve
> `capturas/*.jpg` relativo al archivo). Servirlo por el dev server de Vite rompe las rutas
> de las imágenes porque el fallback SPA intercepta `/docs/...`.

### Verificación después de regenerar

```bash
# Ninguna imagen referenciada que no exista, ninguna captura huérfana:
grep -o 'src="capturas/[^"]*"' manual.html | sed 's/src="capturas\///;s/"//' | sort > /tmp/refs.txt
ls capturas | sort > /tmp/files.txt
comm -23 /tmp/refs.txt /tmp/files.txt   # rotas  → debe salir vacío
comm -13 /tmp/refs.txt /tmp/files.txt   # huérfanas → debe salir vacío
```

## Actualizar una captura

1. Levantar la app en local contra US test y navegar a la pantalla.
2. Tomar la captura y guardarla en `capturas/` con el mismo nombre que la que reemplaza.
3. Regenerar el PDF con el comando de arriba.

## Requisito del entorno de prueba

Para que **Enviar Documentos para Firma** funcione en US test hace falta la FK
`fk_sales_salesperson` (`sales.salesperson_id → profiles.id`), que producción ya tiene. Sin
ella PostgREST no resuelve el embed del vendedor (`{{vendedor_nombre}}`, el *"Vendedor/a"*
del contrato) y el botón falla en silencio. El script está en
`sql/20260902_us_test_fk_sales_salesperson.sql`.
