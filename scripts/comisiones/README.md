# Planilla de liquidación de comisiones (Fase 1)

`build_plantilla_liquidacion.py` genera la planilla Excel de liquidación con las
fórmulas parametrizadas: una hoja por vendedor, `Parametros`, `Resumen` y `Leeme`.
Requiere Python 3.10+ y `openpyxl`.

```bash
# Plantilla vacía (7 vendedores, una fila en blanco por tabla)
python -I scripts/comisiones/build_plantilla_liquidacion.py --salida Comisiones_Plantilla_Vacia.xlsx

# Con los datos de una planilla vieja (formato "Comisiones Junio 2026.xlsx")
python -I scripts/comisiones/build_plantilla_liquidacion.py --salida Comisiones_Plantilla.xlsx \
  --origen "Comisiones Junio 2026.xlsx"
```

Con `--origen`, el script hace tres cosas:

- **Importa las filas al ejecutarse.** En el repo no hay datos de clientes: en el
  script solo hay parámetros (IVA, gastos administrativos, % por vendedor,
  excepciones y adicional por plan).
- **Marca los valores que no siguen la regla.** Si un G Adm, un % o un Adicional
  de la planilla vieja no coincide con lo que da la regla, lo copia en la columna
  *manual* de esa fila (P, Q o R, en naranja). Las filas dudosas llevan una nota en `Obs`.
- **Valida los totales.** Recalcula en Python el TOTAL A COBRAR de cada hoja con
  las mismas fórmulas de la plantilla y lo compara con el de la planilla vieja.
  También compara fila por fila. Sale con código 1 si algo no cuadra.

## Diseño de cada hoja

El diseño es el de **la planilla original** del cliente (`Comisiones <mes>.xlsx`) y
es el mismo que usa el exportador del sistema. Si se cambia acá, hay que cambiarlo
también en `src/lib/commissions/exportLiquidacionXlsx.ts`. Todo en Arial.

- **Arriba:** fila 1 banda negra con el título; filas 2 y 3 bandas grises con
  `VENDEDOR` (nombre en `C2`) y `PERIODO` (`C3`: fecha del día 1 del mes, formato
  `mmmm-yy`, se ve "junio-26").
- **Secciones:** `INDIVIDUALES / FAMILIARES` y, si el vendedor vende a empresas,
  `EMPRESARIALES`, cada una con su banda gris (una hoja con una sola sección
  individual no lleva banda: el encabezado queda en la fila 4). El bloque
  (`INDIVIDUAL` / `GRUPAL`) lo da la sección: no hay columna `Bloque`.
- **Tabla por sección** (`T_<hoja>` y `T_<hoja>_Emp`): tabla de Excel sin estilo
  (sin bandas ni flechas de filtro), para que agregar filas copie las fórmulas.
  Columnas A–O como el original (`Rec N°`, `Fec`, `Nombre`, `Plan`, `M`, `Cto N°`,
  `Vidas`, `Total`, `G Adm`, `Cuota`, `Cuota - IVA`, `%`, `Comision`, `Adicional`,
  `Obs`) y, a la derecha de `Obs`, las manuales P `G Adm manual`, Q `% manual` y
  R `Adicional manual`. La fila de totales de la tabla es el subtotal gris.
- **Pie:** fila en blanco, franja negra (con dos secciones lleva los totales
  combinados) y debajo, etiqueta en K y monto en M: `Viatico`, `RECUPERO`,
  `Bonificacion` (% en L con lista 8/12/15 %, base en O), `OTROS` (o la etiqueta
  importada, ej. `AJUSTE VALE`), `ADICIONAL`, `Descuentos` y `TOTAL A COBRAR`.
  Más abajo, `RECUPERO CUOTAS` (si hay) y `DESCUENTOS <MES>`.
- **Resumen:** las columnas del original (`Vendedor | VIDAS | Ventas total |
  Comision | Bonif 8% | Bonif 12% | Bonif 15% | Viatico | Otros | Descuentos |
  Total`), la fila de totales y `Prueba` (suma de los TOTAL A COBRAR; en rojo si no
  coincide con el Total).

Cómo llega el `Resumen` a los totales: cada hoja de vendedor define **nombres de
ámbito hoja** (`Vidas`, `Ventas`, `Comision`, `Viatico`, `Recupero`, `BonifMonto`,
`BonifPct`, `Otros`, `Adicional`, `Descuentos`, `TotalCobrar`, `Periodo`) y el
`Resumen` los lee con `INDIRECT` usando la hoja de `tbl_Vendedores`. Insertar filas
mueve los nombres y copiar la hoja de un vendedor los copia, así que no aparecen
`#REF!`. Es la única diferencia con el export: el export sabe en qué celda cae cada
total y usa referencias directas.

En la hoja `Leeme` de la planilla generada está cómo usarla: cambiar parámetros,
pisar una fila, agregar filas y agregar vendedores.
