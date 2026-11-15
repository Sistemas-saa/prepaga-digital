#!/usr/bin/env python3
"""Genera la planilla parametrizada de liquidacion de comisiones (Fase 1).

Uso:
    python -I scripts/comisiones/build_plantilla_liquidacion.py --salida <out.xlsx>
    python -I scripts/comisiones/build_plantilla_liquidacion.py --salida <out.xlsx> --origen <planilla_vieja.xlsx>

Sin --origen genera la plantilla vacia (7 vendedores, una fila en blanco por tabla).
Con --origen importa las filas de la planilla vieja EN TIEMPO DE EJECUCION y valida
que el TOTAL A COBRAR recalculado coincida con el de la planilla original.

En este archivo solo hay PARAMETROS (porcentajes, gastos, nombres de vendedores).
Ningun dato de clientes queda versionado: las filas salen siempre del --origen.

El diseno de cada hoja es el de LA PLANILLA ORIGINAL del cliente ("Comisiones <mes>.xlsx"):
bandas negra/gris arriba, una seccion por bloque (INDIVIDUALES / FAMILIARES y EMPRESARIALES),
subtotal gris, franja negra y el pie (Viatico ... TOTAL A COBRAR) abajo. Es el mismo diseno
que usa el exportador del sistema (src/lib/commissions/exportLiquidacionXlsx.ts): no cambiar
uno sin el otro. La unica diferencia es como el Resumen llega a los totales: el export sabe
en que celda cae cada uno y usa referencias directas; esta plantilla, como el usuario agrega
filas y vendedores, define nombres de AMBITO HOJA en cada hoja de vendedor y el Resumen los
lee con INDIRECT a partir de tbl_Vendedores.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
import unicodedata
from dataclasses import dataclass, field

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableColumn, TableFormula

# --------------------------------------------------------------------------------------
# PARAMETROS (lo unico que vive en el repo)
# --------------------------------------------------------------------------------------
IVA_DIV = 1.10

GADM = [  # Movimiento (M) -> gasto administrativo
    ("V", 30000), ("RI", 30000), ("SAA", 30000), ("INC", 15000),
    ("CP", 0), ("CONT", 0), ("RETENCION", 0),
]
PCT_EXCEPCION = [  # Plan o M -> % que pisa el % del vendedor
    ("PM", 0.0), ("PO", 0.0), ("CP", 0.0),
    ("CONT", 0.20), ("SAA", 0.30), ("RETENCION", 0.20),
]
ADICIONAL_PLAN = [("PM", 350000)]  # Plan -> monto fijo por fila

# hoja = nombre de la hoja (igual al de la planilla original, para poder comparar)
# nombre = nombre del vendedor tal como figura en la celda de nombre de la hoja original
SALESPEOPLE = [
    {"hoja": "Rossana", "nombre": "ROSSANA PALACIOS", "pct": {"INDIVIDUAL": 1.00}},
    {"hoja": "Antonio P.", "nombre": "Antonio Paiva", "pct": {"INDIVIDUAL": 0.80}},
    {"hoja": "Catherine", "nombre": "Catherine", "pct": {"INDIVIDUAL": 0.50}},
    {"hoja": "SARA", "nombre": "Sara López", "pct": {"INDIVIDUAL": 0.50, "GRUPAL": 0.30}},
    {"hoja": "RODRIGO AMARILLA", "nombre": "RODRIGO AMARILLA", "pct": {"INDIVIDUAL": 0.50}},
    {"hoja": "Jorge Galeano", "nombre": "Jorge Galeano", "pct": {"INDIVIDUAL": 0.20}},
    {"hoja": "Olivia", "nombre": "OLIVIA OLMEDO", "pct": {"INDIVIDUAL": 0.50}},
]

# Capacidad de las tablas de Parametros (filas en blanco para que el usuario agregue)
PARAM_CAPACITY = 30
VEND_CAPACITY = 20

# --------------------------------------------------------------------------------------
# LAYOUT: "la planilla original" -- compartido con src/lib/commissions/exportLiquidacionXlsx.ts
# (mismas columnas, bandas, pie y Resumen). El Resumen del export usa referencias directas;
# el de esta plantilla, nombres de ambito hoja + INDIRECT (ver SHEET_NAMES y build_resumen).
# --------------------------------------------------------------------------------------
TITLE = "PLANILLA DE LIQUIDACION DE COMISIONES - VENTAS"
RESUMEN_TITLE = "PLANILLA DE LIQUIDACION DE COMISIONES - VENTAS -   R  E  S  U  M  E  N"
FIRST_ROW = 4          # primera fila despues de las bandas de arriba
LAST_COL = "O"         # las bandas cubren A..O
COLUMNS = [            # A..O como el original; P..R manuales (a la derecha de Obs)
    "Rec N°", "Fec", "Nombre", "Plan", "M", "Cto N°", "Vidas", "Total", "G Adm", "Cuota",
    "Cuota - IVA", "%", "Comision", "Adicional", "Obs",
    "G Adm manual", "% manual", "Adicional manual",
]
COL = {name: get_column_letter(i + 1) for i, name in enumerate(COLUMNS)}
MONEY_COLS = ["Total", "G Adm", "Cuota", "Cuota - IVA", "Comision", "Adicional",
              "G Adm manual", "Adicional manual"]
PCT_COLS = ["%", "% manual"]
MANUAL_COLS = ["G Adm manual", "% manual", "Adicional manual"]
BORDER_COLS = [c for c in COLUMNS if c != "Obs"]   # Obs va sin borde
SUBTOTAL_COLS = ["Vidas", "Total", "G Adm", "Cuota", "Cuota - IVA", "Comision"]
SUBTOTAL_BOLD = ["Cuota - IVA", "Comision"]
CENTER_COLS = ["Fec", "Plan", "M", "Cto N°", "Vidas"]
WIDTHS = {"Rec N°": 8, "Fec": 10, "Nombre": 30, "Plan": 6, "M": 5, "Cto N°": 12, "Vidas": 6,
          "Total": 11, "G Adm": 9, "Cuota": 11, "Cuota - IVA": 12, "%": 7, "Comision": 12,
          "Adicional": 10, "Obs": 30, "G Adm manual": 11, "% manual": 9, "Adicional manual": 11}
SECTION_LABEL = {"INDIVIDUAL": "INDIVIDUALES / FAMILIARES", "GRUPAL": "EMPRESARIALES"}
BONIF_PCTS = (0.08, 0.12, 0.15)   # columnas Bonif N% del Resumen = lista de la celda del %
# nombres de ambito hoja que define cada hoja de vendedor y lee el Resumen
SHEET_NAMES = ["Vidas", "Ventas", "Comision", "Viatico", "Recupero", "BonifMonto", "BonifPct",
               "Otros", "Adicional", "Descuentos", "TotalCobrar", "Periodo"]

FMT_GS = "#,##0"
FMT_PCT = "0.00%"       # Parametros
FMT_PCT_INT = "0%"      # hojas de vendedor (0.00% si el % no es entero)
FMT_DATE = "dd/mm/yyyy"
FMT_PERIODO = r"mmmm\-yy"
FMT_BASE = '"base "#,##0'   # base de la Bonificacion (columna O): sigue siendo numero

FILL_INPUT = PatternFill("solid", fgColor="FFF9C4")    # amarillo claro: insumo (Parametros)
FILL_MANUAL = PatternFill("solid", fgColor="FFD8B0")   # naranja claro: pisa un parametro
FILL_HEAD = PatternFill("solid", fgColor="DDE7F3")
FILL_ALERT = PatternFill("solid", fgColor="FFB3B3")
FILL_BLACK = PatternFill("solid", fgColor="FF000000")
FILL_GREY = PatternFill("solid", fgColor="FFC0C0C0")
FILL_GREEN = PatternFill("solid", fgColor="FF92D050")
FILL_TOTAL = PatternFill("solid", fgColor="FF99CC00")  # Total del Resumen
BOLD = Font(bold=True)
THIN = Side(style="thin", color="B0B0B0")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
THIN_K = Side(style="thin", color="FF000000")
BOX_K = Border(left=THIN_K, right=THIN_K, top=THIN_K, bottom=THIN_K)
WRAP = Alignment(wrap_text=True, vertical="top")


def arial(size=8, bold=False, italic=False, white=False) -> Font:
    return Font(name="Arial", size=size, bold=bold, italic=italic, color="FFFFFFFF" if white else None)


MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
         "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]


# --------------------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------------------
def norm(v) -> str:
    """Mayusculas, sin acentos, espacios colapsados."""
    if v is None:
        return ""
    s = unicodedata.normalize("NFKD", str(v))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().upper()


def table_key(sheet_name: str) -> str:
    s = unicodedata.normalize("NFKD", sheet_name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^A-Za-z0-9]", "", s) or "Hoja"


def fmt_gs(n: float) -> str:
    return f"{n:,.0f}".replace(",", ".")


def fmt_pct(p: float) -> str:
    return f"{p * 100:g}%"


def num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    return None


def text(v):
    if v is None or isinstance(v, (int, float)):
        return None
    s = str(v).strip()
    return s or None


def sref(table: str, col: str) -> str:
    """Referencia estructurada a la fila actual, en formato de archivo."""
    esc = re.sub(r"(['\[\]#])", r"'\1", col)
    return f"{table}[[#This Row],[{esc}]]"


def cref(table: str, col: str) -> str:
    esc = re.sub(r"(['\[\]#])", r"'\1", col)
    return f"{table}[{esc}]"


def sheet_quote(name: str) -> str:
    return "'" + name.replace("'", "''") + "'"


# --------------------------------------------------------------------------------------
# Modelo de datos
# --------------------------------------------------------------------------------------
@dataclass
class Params:
    iva_div: float = IVA_DIV
    gadm: dict = field(default_factory=lambda: {k: v for k, v in GADM})
    pct_exc: dict = field(default_factory=lambda: {k: v for k, v in PCT_EXCEPCION})
    adic_plan: dict = field(default_factory=lambda: {k: v for k, v in ADICIONAL_PLAN})
    pct_vend: dict = field(default_factory=dict)  # (NOMBRE_NORM, BLOQUE) -> pct

    # Replica exacta de las formulas de la plantilla -----------------------------
    def rule_gadm(self, m):
        return self.gadm.get(norm(m), 0) if text(m) else 0

    def rule_pct(self, vendor, bloque, plan, m):
        if text(plan) and norm(plan) in self.pct_exc:
            return self.pct_exc[norm(plan)]
        if text(m) and norm(m) in self.pct_exc:
            return self.pct_exc[norm(m)]
        return self.pct_vend.get((norm(vendor), norm(bloque)), 0)

    def rule_adic(self, plan):
        return self.adic_plan.get(norm(plan), 0) if text(plan) else 0


@dataclass
class Row:
    bloque: str = "INDIVIDUAL"
    rec: object = None
    fec: object = None
    nombre: object = None
    plan: object = None
    m: object = None
    cto: object = None
    vidas: object = None
    total: object = None
    obs: list = field(default_factory=list)
    gadm_manual: object = None
    pct_manual: object = None
    adic_manual: object = None
    # valores de la planilla original (solo para validar)
    orig_comision: object = None
    orig_adicional: object = None


@dataclass
class Footer:
    viatico: float = 0
    recupero: float = 0
    bonif_base: float = 0
    bonif_pct: float = 0
    otros: float = 0
    otros_label: str | None = None   # etiqueta de la planilla original (ej. "AJUSTE VALE")
    descuentos: float = 0
    # solo para validar
    orig_adicional: float | None = None
    orig_total: float | None = None
    orig_total_fallback: float | None = None


@dataclass
class Seller:
    hoja: str
    nombre: str
    pct: dict
    periodo: dt.date | None = None   # dia 1 del mes liquidado
    rows: list = field(default_factory=list)
    footer: Footer = field(default_factory=Footer)
    warnings: list = field(default_factory=list)

    def table(self, bloque: str) -> str:
        """Una tabla de Excel por seccion: T_<hoja> (individual) y T_<hoja>_Emp (empresariales)."""
        return "T_" + table_key(self.hoja) + ("_Emp" if bloque == "GRUPAL" else "")

    def sections(self) -> list:
        """[(bloque, filas)] en el orden de la hoja. El bloque lo da la SECCION.

        Siempre hay seccion INDIVIDUAL (con una fila vacia si no tiene filas), salvo que la
        hoja tenga solo filas GRUPAL. La seccion EMPRESARIALES aparece si hay filas GRUPAL o si
        el vendedor tiene % GRUPAL en Parametros (asi la plantilla vacia de SARA ya la trae).
        """
        ind = [r for r in self.rows if section_of(r) == "INDIVIDUAL"]
        grp = [r for r in self.rows if section_of(r) == "GRUPAL"]
        out = []
        if ind or not grp:
            out.append(("INDIVIDUAL", ind or [Row(bloque="INDIVIDUAL")]))
        if grp or "GRUPAL" in self.pct:
            out.append(("GRUPAL", grp or [Row(bloque="GRUPAL")]))
        return out


def section_of(r: Row) -> str:
    return "GRUPAL" if norm(r.bloque) == "GRUPAL" else "INDIVIDUAL"


def model_sheet(s: Seller, p: Params) -> dict:
    """Calcula en Python lo mismo que las formulas de la hoja.

    Las claves son los nombres de ambito hoja que lee el Resumen (SHEET_NAMES)."""
    com_total = vid = ventas = adic = 0.0
    per_row = []
    for r in s.rows:
        total = num(r.total) or 0
        gadm = r.gadm_manual if r.gadm_manual is not None else p.rule_gadm(r.m)
        cuota = total - gadm
        civa = cuota / p.iva_div
        pct = row_pct(s, r, p)
        com = civa * pct
        ad = r.adic_manual if r.adic_manual is not None else p.rule_adic(r.plan)
        per_row.append((com, ad))
        com_total += com
        adic += ad
        vid += num(r.vidas) or 0
        ventas += total
    f = s.footer
    bonif = f.bonif_base * f.bonif_pct
    total = com_total + f.viatico + f.recupero + bonif + f.otros + adic - f.descuentos
    return {"Vidas": vid, "Ventas": ventas, "Comision": com_total, "Viatico": f.viatico,
            "Recupero": f.recupero, "BonifMonto": bonif, "BonifPct": f.bonif_pct, "Otros": f.otros,
            "Adicional": adic, "Descuentos": f.descuentos, "TotalCobrar": total, "rows": per_row}


def row_pct(s: Seller, r: Row, p: Params) -> float:
    """% de la fila: el manual, o la regla con el bloque de su SECCION (lo mismo que la formula)."""
    return r.pct_manual if r.pct_manual is not None else p.rule_pct(s.nombre, section_of(r), r.plan, r.m)


# --------------------------------------------------------------------------------------
# Importacion de la planilla vieja
# --------------------------------------------------------------------------------------
def classify_header(v):
    if v is None:
        return None
    raw = str(v).strip()
    if raw == "%":
        return "pct"
    k = re.sub(r"[^A-Z0-9]", "", norm(raw))
    if k.startswith("REC"):
        return "rec"
    if k.startswith("CTO"):
        return "cto"
    if k == "CUOTAIVA":
        return "cuotaiva"
    return {"FEC": "fec", "NOMBRE": "nombre", "PLAN": "plan", "M": "m", "VIDAS": "vidas",
            "TOTAL": "total", "GADM": "gadm", "CUOTA": "cuota", "BONIF": "bonif",
            "COMISION": "comision"}.get(k)


def import_seller(cfg: dict, ws, wv, params: Params) -> Seller:
    s = Seller(hoja=cfg["hoja"], nombre=cfg["nombre"], pct=cfg["pct"])
    max_c = min(ws.max_column, 40)

    # 1. fila de encabezado: la que tiene "Nombre"
    header = None
    for r in range(1, min(ws.max_row, 30) + 1):
        if any(norm(ws.cell(r, c).value) == "NOMBRE" for c in range(1, max_c + 1)):
            header = r
            break
    if header is None:
        raise SystemExit(f"[{s.hoja}] no encontre la fila de encabezado con 'Nombre'")
    cols = {}
    for c in range(1, max_c + 1):
        k = classify_header(ws.cell(header, c).value)
        if k and k not in cols:
            cols[k] = c
    for need in ("nombre", "total", "comision", "fec"):
        if need not in cols:
            raise SystemExit(f"[{s.hoja}] falta la columna '{need}' en el encabezado (fila {header})")
    cols.setdefault("rec", cols["fec"] - 1)          # Rossana no tiene titulo "Rec N°"
    c_adic = cols["comision"] + 1                    # adicional: columna a la derecha de Comision
    c_dif = c_adic + 1                               # etiqueta "DIF"

    # 2. nombre del vendedor y periodo (arriba del encabezado)
    period_date = None
    for r in range(1, header):
        for c in range(1, max_c + 1):
            vv = ws.cell(r, c).value
            if isinstance(vv, dt.datetime) and period_date is None:
                period_date = vv
    name_cell = None
    for r in range(1, header):
        v = ws.cell(r, cols["nombre"]).value
        if isinstance(v, str) and v.strip():
            name_cell = v.strip()
            break
    if name_cell and name_cell != cfg["nombre"]:
        s.warnings.append(f"nombre en la planilla '{name_cell}' != parametro '{cfg['nombre']}'; se usa el de la planilla")
        s.nombre = name_cell
        params.pct_vend.update({(norm(name_cell), b): v for b, v in cfg["pct"].items()})
    if period_date:
        s.periodo = dt.date(period_date.year, period_date.month, 1)   # la planilla liquida meses completos
        period_month = MESES[period_date.month - 1]
    else:
        period_month = None

    def cv(r, c):
        return wv.cell(r, c).value

    def row_is_header(r):
        return norm(ws.cell(r, cols["nombre"]).value) == "NOMBRE"

    def row_has_sum(r):
        for c in range(1, max_c + 1):
            v = ws.cell(r, c).value
            if isinstance(v, str) and v.lstrip("=+").upper().startswith("SUM("):
                return True
        return False

    # 3. filas de datos
    bloque = "INDIVIDUAL"
    in_section = True
    first_end = None
    r = header + 1
    while r <= ws.max_row:
        if in_section:
            name = text(ws.cell(r, cols["nombre"]).value)
            if row_is_header(r):
                r += 1
                continue
            if name is None or row_has_sum(r):
                in_section = False
                first_end = first_end or r
                r += 1
                continue
            row = Row(bloque=bloque)
            row.rec = text(ws.cell(r, cols["rec"]).value)
            fec = ws.cell(r, cols["fec"]).value
            row.fec = fec.date() if isinstance(fec, dt.datetime) else text(fec)
            row.nombre = name
            row.plan = text(cv(r, cols["plan"])) if "plan" in cols else None
            row.m = text(cv(r, cols["m"])) if "m" in cols else None
            row.cto = num(cv(r, cols["cto"])) if "cto" in cols else None
            row.vidas = num(cv(r, cols["vidas"])) if "vidas" in cols else None
            row.total = num(cv(r, cols["total"]))
            gadm_o = (num(cv(r, cols["gadm"])) if "gadm" in cols else None) or 0
            pct_o = (num(cv(r, cols["pct"])) if "pct" in cols else None) or 0
            adic_v = cv(r, c_adic)
            adic_o = num(adic_v) or 0
            if text(adic_v):
                row.obs.append(text(adic_v))
            if text(cv(r, c_dif)):
                row.obs.append(text(cv(r, c_dif)))
            row.orig_comision = num(cv(r, cols["comision"])) or 0
            row.orig_adicional = adic_o

            # overrides: solo si el original difiere de lo que daria la regla
            total = row.total or 0
            if abs(gadm_o - params.rule_gadm(row.m)) > 0.005:
                row.gadm_manual = gadm_o
            rule_pct = params.rule_pct(s.nombre, bloque, row.plan, row.m)
            if abs(pct_o - rule_pct) > 1e-9:
                row.pct_manual = pct_o
                if 0 < pct_o < 0.05:
                    row.obs.append(f"VERIFICAR: {fmt_pct(pct_o)} sobre {fmt_gs(total)}")
                else:
                    row.obs.append(f"VERIFICAR: % {fmt_pct(pct_o)} distinto de la regla ({fmt_pct(rule_pct)})")
            if abs(adic_o - params.rule_adic(row.plan)) > 0.005:
                row.adic_manual = adic_o

            # avisos
            if isinstance(row.fec, str) and period_month and norm(row.fec) in MESES and norm(row.fec) != period_month:
                row.obs.append(f"VERIFICAR: Fec {row.fec} en liquidación de {period_month.lower()}")
            if "cuota" in cols:
                cuota_o = num(cv(r, cols["cuota"]))
                if cuota_o is not None and abs(cuota_o - (total - gadm_o)) > 0.5:
                    row.obs.append(f"Original: Cuota cargada a mano en {fmt_gs(cuota_o)}")
                    s.warnings.append(f"fila {r} ({name}): Cuota original {fmt_gs(cuota_o)} != Total-G Adm {fmt_gs(total - gadm_o)}")
            s.rows.append(row)
        else:
            if any(norm(ws.cell(r, c).value) == "EMPRESARIALES" for c in range(1, max_c + 1)):
                bloque = "GRUPAL"
                in_section = True
        r += 1

    # 4. pie: etiquetas a la izquierda de la columna Comision, valor en la columna Comision
    f = s.footer
    c_com = cols["comision"]
    start = first_end or (header + 1)
    for r in range(start, ws.max_row + 1):
        for c in range(max(1, c_com - 4), c_com):
            raw = ws.cell(r, c).value
            if not isinstance(raw, str) or raw.lstrip().startswith("="):
                continue  # solo etiquetas de texto
            lab = norm(raw)
            if not lab:
                continue
            val = cv(r, c_com)
            v = num(val) or 0
            if lab == "VIATICO":
                f.viatico += v
            elif lab in ("RECUPERO", "RECUPERO CUOTAS"):
                f.recupero += v
            elif lab.startswith("BONIFICACION"):
                formula = ws.cell(r, c_com).value
                m = re.match(r"^=\s*\+?\s*\$?([A-Z]{1,3})\$?(\d+)\s*\*\s*([\d.,]+)\s*%\s*$", str(formula or ""))
                if m:
                    f.bonif_base = num(wv[f"{m.group(1)}{m.group(2)}"].value) or 0
                    f.bonif_pct = float(m.group(3).replace(",", ".")) / 100
                else:
                    mp = re.search(r"(\d+(?:[.,]\d+)?)\s*%", lab)
                    pct = float(mp.group(1).replace(",", ".")) / 100 if mp else 1
                    f.bonif_base, f.bonif_pct = (v / pct if pct else v), pct
            elif lab in ("AJUSTE VALE", "OTROS"):
                if v:
                    f.otros += v
                    etiqueta = re.sub(r"\s+", " ", ws.cell(r, c).value).strip()
                    # la etiqueta del original pasa a ser la de la linea; si hay dos distintas, OTROS
                    f.otros_label = etiqueta if f.otros_label in (None, etiqueta) else "OTROS"
            elif lab == "DESCUENTOS":
                f.descuentos += v
            elif lab == "ADICIONAL":
                f.orig_adicional = (f.orig_adicional or 0) + v
            elif lab == "TOTAL A COBRAR":
                f.orig_total = num(val)
            elif lab == "TOTAL" and f.orig_total is None:
                f.orig_total_fallback = num(val)
            elif lab in ("TOTALES", "COMISION"):
                pass
            elif num(val):
                s.warnings.append(f"pie: etiqueta '{ws.cell(r, c).value}' con valor {val} no reconocida (ignorada)")
    if f.orig_total is None:
        f.orig_total = f.orig_total_fallback
    if f.orig_adicional is not None:
        sum_rows = sum(r.orig_adicional or 0 for r in s.rows)
        if abs(sum_rows - f.orig_adicional) > 0.5:
            s.warnings.append(f"ADICIONAL del pie ({fmt_gs(f.orig_adicional)}) != suma de adicionales por fila ({fmt_gs(sum_rows)})")
    return s


# --------------------------------------------------------------------------------------
# Escritura del libro
# --------------------------------------------------------------------------------------
def add_name(wb, name, ref):
    wb.defined_names[name] = DefinedName(name=name, attr_text=ref)


def build_parametros(wb, sellers, params: Params):
    ws = wb.create_sheet("Parametros")
    ws["A1"] = "PARÁMETROS DE LA LIQUIDACIÓN"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A3"] = "Divisor IVA"
    ws["A3"].font = BOLD
    ws["B3"] = params.iva_div
    ws["B3"].fill = FILL_INPUT
    ws["B3"].border = BOX
    ws["B3"].number_format = "0.00"
    ws["C3"] = "IVA_DIV. Cuota-IVA = Cuota / IVA_DIV. 1,10 = IVA del 10% incluido en la cuota."
    add_name(wb, "IVA_DIV", "Parametros!$B$3")

    first = 7
    last = first + PARAM_CAPACITY - 1
    tables = [
        # (col inicial, nombre, encabezados, filas, formatos, nota)
        ("A", "tbl_GAdm", ["M", "G Adm"], [list(x) for x in params.gadm.items()], [None, FMT_GS],
         "Gasto administrativo por Movimiento (columna M). Un M que no está en la lista da 0."),
        ("D", "tbl_PctExcepcion", ["Clave", "%"], [list(x) for x in params.pct_exc.items()], [None, FMT_PCT],
         "Clave = Plan o M. Pisa el % del vendedor. Se busca primero el Plan y después el M."),
        ("G", "tbl_AdicionalPlan", ["Plan", "Adicional"], [list(x) for x in params.adic_plan.items()], [None, FMT_GS],
         "Monto fijo que se suma por fila según el Plan (ej. prima de Plan Materno)."),
        ("J", "tbl_PctVendedor", ["Vendedor", "Bloque", "%"],
         [[s.nombre, b, pct] for s in sellers for b, pct in s.pct.items()], [None, None, FMT_PCT],
         "% del vendedor por Bloque (INDIVIDUAL / GRUPAL). Vendedor = celda B2 de su hoja."),
        ("N", "tbl_Vendedores", ["Vendedor", "Hoja"], [[s.nombre, s.hoja] for s in sellers], [None, None],
         "Una fila por vendedor. Hoja = nombre exacto de la pestaña. Alimenta el Resumen."),
    ]
    dv_bloque = DataValidation(type="list", formula1='"INDIVIDUAL,GRUPAL"', allow_blank=True)
    ws.add_data_validation(dv_bloque)
    for start, name, heads, rows, fmts, note in tables:
        c0 = ws[f"{start}1"].column
        cap_last = first + (VEND_CAPACITY if name == "tbl_Vendedores" else PARAM_CAPACITY) - 1
        if len(rows) > cap_last - first + 1:
            raise SystemExit(f"{name}: más filas que la capacidad")
        ws.cell(4, c0, name).font = BOLD
        ws.merge_cells(start_row=5, start_column=c0, end_row=5, end_column=c0 + len(heads) - 1)
        ws.cell(5, c0, note).alignment = WRAP
        ws.cell(5, c0).font = Font(italic=True, size=9, color="555555")
        for j, h in enumerate(heads):
            cell = ws.cell(6, c0 + j, h)
            cell.font = BOLD
            cell.fill = FILL_HEAD
            cell.border = BOX
        for i in range(first, cap_last + 1):
            for j in range(len(heads)):
                cell = ws.cell(i, c0 + j)
                cell.fill = FILL_INPUT
                cell.border = BOX
                if fmts[j]:
                    cell.number_format = fmts[j]
        for i, row in enumerate(rows):
            for j, v in enumerate(row):
                ws.cell(first + i, c0 + j, v)
        cl = [get_column_letter(c0 + j) for j in range(len(heads))]
        add_name(wb, name, f"Parametros!${cl[0]}${first}:${cl[-1]}${cap_last}")
        if name == "tbl_PctExcepcion":
            add_name(wb, "PctExc_Clave", f"Parametros!${cl[0]}${first}:${cl[0]}${cap_last}")
        if name == "tbl_PctVendedor":
            add_name(wb, "PctV_Vendedor", f"Parametros!${cl[0]}${first}:${cl[0]}${cap_last}")
            add_name(wb, "PctV_Bloque", f"Parametros!${cl[1]}${first}:${cl[1]}${cap_last}")
            add_name(wb, "PctV_Pct", f"Parametros!${cl[2]}${first}:${cl[2]}${cap_last}")
            dv_bloque.add(f"{cl[1]}{first}:{cl[1]}{cap_last}")
        if name == "tbl_Vendedores":
            add_name(wb, "Vend_Nombre", f"Parametros!${cl[0]}${first}:${cl[0]}${cap_last}")
            add_name(wb, "Vend_Hoja", f"Parametros!${cl[1]}${first}:${cl[1]}${cap_last}")
    ws.row_dimensions[5].height = 60
    for col, w in {"A": 14, "B": 12, "C": 4, "D": 14, "E": 10, "F": 4, "G": 12, "H": 12, "I": 4,
                   "J": 24, "K": 13, "L": 9, "M": 4, "N": 24, "O": 22}.items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A7"
    return ws


def row_formulas(t: str, bloque: str) -> dict:
    """Formulas por fila en formato de archivo (referencias estructuradas).

    El bloque es una constante de la seccion ("INDIVIDUAL" / "GRUPAL") y el vendedor sale de la
    celda del nombre ($C$2)."""
    R = lambda c: sref(t, c)  # noqa: E731
    return {
        "G Adm": f'IF({R("G Adm manual")}<>"",{R("G Adm manual")},IFERROR(VLOOKUP({R("M")},tbl_GAdm,2,FALSE),0))',
        "Cuota": f'{R("Total")}-{R("G Adm")}',
        "Cuota - IVA": f'{R("Cuota")}/IVA_DIV',
        "%": (f'IF({R("% manual")}<>"",{R("% manual")},'
              f'IFERROR(VLOOKUP({R("Plan")},tbl_PctExcepcion,2,FALSE),'
              f'IFERROR(VLOOKUP({R("M")},tbl_PctExcepcion,2,FALSE),'
              f'SUMIFS(PctV_Pct,PctV_Vendedor,$C$2,PctV_Bloque,"{bloque}"))))'),
        "Comision": f'{R("Cuota - IVA")}*{R("%")}',
        "Adicional": f'IF({R("Adicional manual")}<>"",{R("Adicional manual")},IFERROR(VLOOKUP({R("Plan")},tbl_AdicionalPlan,2,FALSE),0))',
    }


def pct_format(p) -> str:
    """0% si el % es entero; 0.00% si no (ej. 12,5%)."""
    if p is None:
        return FMT_PCT_INT
    return FMT_PCT_INT if abs(p * 100 - round(p * 100)) < 1e-9 else FMT_PCT


def band(ws, r: int, fill: PatternFill, white=False):
    """Banda negra o gris de A a O."""
    for c in range(1, column_index_from_string(LAST_COL) + 1):
        cell = ws.cell(r, c)
        cell.fill = fill
        cell.font = arial(10, white=white)


def style(cell, size=8, bold=False, italic=False, white=False, fill=None, border=False, fmt=None, h=None, wrap=False):
    cell.font = arial(size, bold=bold, italic=italic, white=white)
    if fill is not None:
        cell.fill = fill
    if border:
        cell.border = BOX_K
    if fmt:
        cell.number_format = fmt
    if h or wrap:
        cell.alignment = Alignment(horizontal=h, wrap_text=wrap or None, vertical="top" if wrap else None)
    return cell


def col_align(h: str):
    if h in CENTER_COLS:
        return "center"
    if h in MONEY_COLS or h in PCT_COLS:
        return "right"
    return "left"


def build_seller_sheet(wb, s: Seller, params: Params):
    """Hoja de un vendedor con el diseno de la planilla original (spec "planilla original", sec. 1)."""
    ws = wb.create_sheet(s.hoja)
    f = s.footer

    # --- bandas de arriba -------------------------------------------------------------
    band(ws, 1, FILL_BLACK, white=True)
    style(ws["A1"], 10, bold=True, white=True).value = TITLE
    for r in (2, 3):
        band(ws, r, FILL_GREY)
    style(ws["A2"], 10, bold=True, fill=FILL_GREY).value = "VENDEDOR"
    style(ws["C2"], 11, bold=True, fill=FILL_GREY).value = s.nombre
    style(ws["A3"], 10, bold=True, fill=FILL_GREY).value = "PERIODO"
    style(ws["C3"], 11, italic=True, fill=FILL_GREY, fmt=FMT_PERIODO, h="left").value = s.periodo

    # --- secciones ----------------------------------------------------------------------
    secs = s.sections()
    with_bands = len(secs) > 1 or secs[0][0] == "GRUPAL"
    info = []
    r = FIRST_ROW
    for bloque, rows in secs:
        t = s.table(bloque)
        if with_bands:
            band(ws, r, FILL_GREY)
            style(ws.cell(r, 2), 10, bold=True, fill=FILL_GREY).value = SECTION_LABEL[bloque]
            r += 1
        header = r
        for j, h in enumerate(COLUMNS):
            cell = style(ws.cell(header, j + 1, h), 11, bold=True, border=h in BORDER_COLS,
                         fill=FILL_MANUAL if h in MANUAL_COLS else None,
                         h="center" if h in CENTER_COLS else None)
            if h in MANUAL_COLS:
                cell.comment = Comment(
                    "Columna manual: si tiene un valor, pisa el parámetro para esa fila. Vacía = regla de Parametros.",
                    "Plantilla")
        formulas = row_formulas(t, bloque)
        first = header + 1
        for i, row in enumerate(rows):
            rr = first + i
            values = {
                "Rec N°": row.rec, "Fec": row.fec, "Nombre": row.nombre, "Plan": row.plan, "M": row.m,
                "Cto N°": row.cto, "Vidas": row.vidas, "Total": row.total,
                "Obs": " | ".join(row.obs) if row.obs else None,
                "G Adm manual": row.gadm_manual, "% manual": row.pct_manual,
                "Adicional manual": row.adic_manual,
            }
            pct = row_pct(s, row, params) if row.nombre else None
            for j, h in enumerate(COLUMNS):
                cell = ws.cell(rr, j + 1)
                cell.value = "=" + formulas[h] if h in formulas else values[h]
                fmt = (FMT_GS if h in MONEY_COLS else pct_format(pct if h == "%" else row.pct_manual)
                       if h in PCT_COLS else FMT_DATE if h == "Fec" else "0" if h in ("Cto N°", "Vidas") else None)
                fill = FILL_GREEN if h == "Cto N°" else FILL_MANUAL if h in MANUAL_COLS else None
                style(cell, 8, border=h in BORDER_COLS, fill=fill, fmt=fmt, h=col_align(h), wrap=h == "Obs")
        last = first + len(rows) - 1
        sub = last + 1
        # subtotal gris = fila de totales de la tabla: queda pegada a los datos al insertar filas
        for h in SUBTOTAL_COLS + ["%"]:
            cell = ws[f"{COL[h]}{sub}"]
            if h in SUBTOTAL_COLS:
                cell.value = f"=SUM({cref(t, h)})"
            style(cell, 11, bold=h in SUBTOTAL_BOLD, fill=FILL_GREY, border=True, fmt=FMT_GS,
                  h="center" if h == "Vidas" else None)
        tcols = []
        for j, h in enumerate(COLUMNS):
            tc = TableColumn(id=j + 1, name=h)
            if h in formulas:
                tc.calculatedColumnFormula = TableFormula(attr_text=formulas[h])
            if h in SUBTOTAL_COLS:
                tc.totalsRowFunction = "custom"
                tc.totalsRowFormula = TableFormula(attr_text=f"SUM({cref(t, h)})")
            tcols.append(tc)
        # sin tableStyleInfo ni autoFilter: el aspecto lo da el formato de celda (sin bandas ni flechas)
        ws.add_table(Table(displayName=t, name=t, ref=f"A{header}:{COL['Adicional manual']}{sub}",
                           tableColumns=tcols, totalsRowCount=1))
        # alerta: fila con datos y sin regla de % aplicable (ni excepcion ni % del vendedor para el bloque)
        n, pc, pl, mm, pm = (COL[k] for k in ("Nombre", "%", "Plan", "M", "% manual"))
        ws.conditional_formatting.add(f"{pc}{first}:{pc}{last}", FormulaRule(
            formula=[f'AND(${n}{first}<>"",${pm}{first}="",'
                     f'ISNA(MATCH(${pl}{first},PctExc_Clave,0)),ISNA(MATCH(${mm}{first},PctExc_Clave,0)),'
                     f'COUNTIFS(PctV_Vendedor,$C$2,PctV_Bloque,"{bloque}")=0)'],
            fill=FILL_ALERT))
        info.append({"bloque": bloque, "table": t, "sub": sub})
        r = sub + 1

    # --- franja negra -------------------------------------------------------------------
    black = r + 1
    band(ws, black, FILL_BLACK, white=True)
    if len(info) > 1:
        for h in SUBTOTAL_COLS:
            c = COL[h]
            style(ws[f"{c}{black}"], 11, bold=True, white=True, fill=FILL_BLACK, fmt=FMT_GS,
                  h="center" if h == "Vidas" else None).value = "=" + "+".join(f"{c}{x['sub']}" for x in info)
        tot = black
    else:
        tot = info[0]["sub"]

    # --- pie: etiqueta en K, valor en M -------------------------------------------------
    K, L, M, O = "K", "L", "M", "O"
    lines = {}

    def line(key, label, value=None, bold=False, fill=None):
        rr = black + 1 + len(lines)
        lines[key] = rr
        for c in (K, L, M):
            style(ws[f"{c}{rr}"], 9, bold=bold, border=True, fill=fill, fmt=FMT_GS)
        style(ws[f"{K}{rr}"], 8, bold=True, border=True, fill=fill).value = label
        ws[f"{M}{rr}"].value = value
        return rr

    line("Viatico", "Viatico", f.viatico or 0)
    line("Recupero", "RECUPERO", f.recupero or None)
    rb = line("BonifMonto", "Bonificacion", None)
    ws[f"{M}{rb}"].value = f"={O}{rb}*{L}{rb}"
    style(ws[f"{L}{rb}"], 9, border=True, fmt=FMT_PCT_INT, h="right").value = f.bonif_pct or None
    style(ws[f"{O}{rb}"], 9, fmt=FMT_BASE, h="left").value = f.bonif_base or None
    dv = DataValidation(type="list", formula1='"8%,12%,15%"', allow_blank=True, showErrorMessage=True,
                        errorTitle="Bonificación", error="El % de bonificación es 8%, 12% o 15%.")
    ws.add_data_validation(dv)
    dv.add(f"{L}{rb}")
    line("Otros", f.otros_label or "OTROS", f.otros or None)
    line("Adicional", "ADICIONAL", "=" + "+".join(f"SUM({cref(x['table'], 'Adicional')})" for x in info))
    line("Descuentos", "Descuentos", f.descuentos or None)
    rt = line("TotalCobrar", "TOTAL A COBRAR", None, bold=True, fill=FILL_GREY)
    ws[f"{M}{rt}"].value = (f"={M}{tot}+{M}{lines['Viatico']}+{M}{lines['Recupero']}+{M}{lines['BonifMonto']}"
                            f"+{M}{lines['Otros']}+{M}{lines['Adicional']}-{M}{lines['Descuentos']}")
    style(ws[f"{K}{rt}"], 8, bold=True, border=True, fill=FILL_GREY)

    # --- detalle debajo del pie ---------------------------------------------------------
    r = rt + 4
    if f.recupero:
        style(ws[f"C{r}"], 10, bold=True, fill=FILL_GREEN).value = "RECUPERO CUOTAS"
        style(ws[f"C{r + 1}"], 10, fmt=FMT_GS, h="left").value = f.recupero
        r += 3
    meses = ",".join(f'"{m}"' for m in MESES)
    style(ws[f"C{r}"], 10, bold=True, fill=FILL_GREEN).value = \
        f'=IF(ISNUMBER($C$3),"DESCUENTOS "&CHOOSE(MONTH($C$3),{meses}),"DESCUENTOS")'
    style(ws[f"B{r + 1}"], 10).value = "ID:"
    style(ws[f"C{r + 1}"], 10, fmt=FMT_GS, h="left").value = f.descuentos or "sin descuento"

    # --- nombres de ambito hoja (los lee el Resumen) -----------------------------------
    refs = {"Vidas": f"$G${tot}", "Ventas": f"$H${tot}", "Comision": f"$M${tot}",
            "BonifPct": f"$L${lines['BonifMonto']}", "Periodo": "$C$3",
            **{k: f"$M${lines[k]}" for k in ("Viatico", "Recupero", "BonifMonto", "Otros", "Adicional",
                                              "Descuentos", "TotalCobrar")}}
    assert set(refs) == set(SHEET_NAMES)
    for name in SHEET_NAMES:
        ws.defined_names[name] = DefinedName(name=name, attr_text=f"{sheet_quote(s.hoja)}!{refs[name]}")

    for h, w in WIDTHS.items():
        ws.column_dimensions[COL[h]].width = w
    return ws


def build_resumen(wb, sellers):
    """Resumen con las columnas del original (spec "planilla original", sec. 2 y 3).

    Una fila por lugar de tbl_Vendedores (VEND_CAPACITY). Cada valor se lee con INDIRECT del
    nombre de ambito hoja de la hoja indicada en tbl_Vendedores: insertar filas o agregar
    vendedores no deja #REF!."""
    ws = wb.create_sheet("Resumen")
    heads = ["Vendedor", "VIDAS", "Ventas total", "Comision", "Bonif 8%", "Bonif 12%", "Bonif 15%",
             "Viatico", "Otros", "Descuentos", "Total"]
    C = {h: get_column_letter(j + 1) for j, h in enumerate(heads)}
    last_col = C["Total"]
    ncols = len(heads)

    for j in range(1, ncols + 1):
        style(ws.cell(1, j), 11, bold=True, white=True, fill=FILL_BLACK)
        style(ws.cell(2, j), 11, bold=True, fill=FILL_GREY)
    ws["A1"].value = RESUMEN_TITLE
    ws["A1"].alignment = Alignment(horizontal="left")
    ws.merge_cells(f"A1:{last_col}1")   # despues de dar formato: la celda combinada usa el de A1
    # PERIODO <Mes> <Año> del primer vendedor de tbl_Vendedores (nombre "Periodo" = su C3)
    p1 = 'INDIRECT("\'"&SUBSTITUTE(Parametros!$O$7,"\'","\'\'")&"\'!Periodo")'
    meses = ",".join(f'"{m.capitalize()}"' for m in MESES)
    ws["A2"].value = (f'=IFERROR(IF(N({p1})>0,"PERIODO "&CHOOSE(MONTH({p1}),{meses})&" "&YEAR({p1}),'
                      f'TRIM("PERIODO "&T({p1}))),"PERIODO")')
    for h in heads:
        style(ws[f"{C[h]}3"], 11, bold=True, border=True, h="center" if h == "VIDAS" else None).value = h

    first = 4
    last = first + VEND_CAPACITY - 1
    for k in range(VEND_CAPACITY):
        r = first + k
        hoja = f"Parametros!$O${7 + k}"   # fila k de tbl_Vendedores
        ind = lambda name: f'INDIRECT("\'"&SUBSTITUTE({hoja},"\'","\'\'")&"\'!{name}")'  # noqa: E731
        val = lambda expr: f'=IF({hoja}="","",{expr})'  # noqa: E731
        bonif = lambda p: f'IF(ROUND({ind("BonifPct")},4)={p},{ind("BonifMonto")},0)'  # noqa: E731
        formulas = {
            "Vendedor": f'=IF({hoja}="","",Parametros!$N${7 + k})',
            "VIDAS": val(ind("Vidas")),
            "Ventas total": val(ind("Ventas")),
            "Comision": val(ind("Comision")),
            "Bonif 8%": val(bonif(0.08)),
            "Bonif 12%": val(bonif(0.12)),
            "Bonif 15%": val(bonif(0.15)),
            "Viatico": val(ind("Viatico")),
            "Otros": val(f'{ind("Recupero")}+{ind("Otros")}+{ind("Adicional")}'),
            "Descuentos": val(ind("Descuentos")),
            "Total": val("+".join(f"{C[h]}{r}" for h in heads[3:9]) + f"-{C['Descuentos']}{r}"),
        }
        used = k < len(sellers)
        for h in heads:
            style(ws[f"{C[h]}{r}"], 11, bold=used and h == "Total", border=used,
                  fill=FILL_TOTAL if used and h == "Total" else None,
                  fmt=None if h == "Vendedor" else FMT_GS, h="center" if h == "VIDAS" else None).value = formulas[h]
    # los lugares libres de tbl_Vendedores toman el mismo aspecto cuando se llenan
    ws.conditional_formatting.add(f"A{first}:{last_col}{last}", FormulaRule(
        formula=[f'$A{first}<>""'], border=BOX_K))
    ws.conditional_formatting.add(f"{last_col}{first}:{last_col}{last}", FormulaRule(
        formula=[f'$A{first}<>""'], fill=FILL_TOTAL, font=Font(bold=True)))

    tr = last + 1
    for h in heads:
        cell = style(ws[f"{C[h]}{tr}"], 11, bold=True, border=True, fill=FILL_GREY,
                     fmt=None if h == "Vendedor" else FMT_GS, h="center" if h == "VIDAS" else None)
        if h != "Vendedor":
            cell.value = f"=SUM({C[h]}{first}:{C[h]}{last})"
    style(ws[f"{last_col}{tr}"], 11, bold=True, white=True, border=True, fill=FILL_BLACK, fmt=FMT_GS)

    pr = tr + 1
    style(ws[f"{C['Descuentos']}{pr}"], 11, bold=True).value = "Prueba"
    terms = "+".join(
        f'IF(Parametros!$O${7 + k}="",0,INDIRECT("\'"&SUBSTITUTE(Parametros!$O${7 + k},"\'","\'\'")&"\'!TotalCobrar"))'
        for k in range(VEND_CAPACITY))
    style(ws[f"{last_col}{pr}"], 11, bold=True, fmt=FMT_GS).value = "=" + terms
    ws.conditional_formatting.add(f"{last_col}{pr}", FormulaRule(
        formula=[f"ABS({last_col}{pr}-{last_col}{tr})>0.5"], fill=FILL_ALERT))

    widths = {"Vendedor": 22, "VIDAS": 8, "Ventas total": 13, "Comision": 12, "Bonif 8%": 11,
              "Bonif 12%": 11, "Bonif 15%": 11, "Viatico": 11, "Otros": 11, "Descuentos": 13, "Total": 13}
    for h, w in widths.items():
        ws.column_dimensions[C[h]].width = w
    return ws


LEEME = [
    ("PLANILLA DE LIQUIDACIÓN DE COMISIONES — CÓMO SE USA", "title"),
    ("", None),
    ("Cómo es cada hoja de vendedor", "h"),
    ("Igual que la planilla original: banda negra con el título; bandas grises con VENDEDOR (nombre en C2) y PERIODO (C3); la tabla de ventas con su subtotal gris; una franja negra; y abajo el pie (Viatico … TOTAL A COBRAR, etiqueta en K y monto en M) y la sección DESCUENTOS del mes.", None),
    ("Si el vendedor vende a empresas, la hoja tiene dos secciones con banda gris: INDIVIDUALES / FAMILIARES y EMPRESARIALES. La sección define el bloque: sus filas usan el % INDIVIDUAL o el % GRUPAL del vendedor. Con dos secciones, la franja negra suma los dos subtotales.", None),
    ("", None),
    ("Qué se completa a mano", "h"),
    ("• C2: nombre del vendedor, igual a 'Vendedor' en tbl_PctVendedor y tbl_Vendedores. C3: la fecha del día 1 del mes (ej. 1/6/2026); se ve 'junio-26' y le pone el mes al título DESCUENTOS.", None),
    ("• Tabla: Rec N°, Fec, Nombre, Plan, M, Cto N°, Vidas, Total y Obs. G Adm, Cuota, Cuota - IVA, %, Comision y Adicional son fórmulas: no se tocan.", None),
    ("• Pie, columna M: Viatico, RECUPERO, OTROS (o la etiqueta que traía la planilla original, ej. AJUSTE VALE) y Descuentos (en positivo).", None),
    ("• Bonificacion: el % en L (lista 8% / 12% / 15%) y la base en O ('base 1.234.567'). El monto (M = O × L) se calcula solo.", None),
    ("• ADICIONAL (suma de la columna Adicional) y TOTAL A COBRAR son fórmulas.", None),
    ("• DESCUENTOS <MES> y RECUPERO CUOTAS (abajo del pie) son notas libres: ID del contrato y monto.", None),
    ("", None),
    ("Cambiar parámetros (hoja Parametros)", "h"),
    ("• IVA: cambiar la celda B3 (nombre IVA_DIV). 1,10 = IVA 10% incluido. Recalcula todas las hojas.", None),
    ("• Gasto administrativo: tabla tbl_GAdm (columnas A:B). Una fila por Movimiento (M). Si aparece un M nuevo, escribirlo en la primera fila vacía. Un M que no figura da 0.", None),
    ("• % por vendedor: tabla tbl_PctVendedor (J:L). Vendedor (igual a la celda C2 de su hoja), Bloque (INDIVIDUAL = sección INDIVIDUALES / FAMILIARES; GRUPAL = sección EMPRESARIALES) y %. Un vendedor con dos bloques lleva dos filas (ej. Sara).", None),
    ("• Excepciones: tabla tbl_PctExcepcion (D:E). La Clave puede ser un Plan o un M; si coincide, pisa el % del vendedor. Primero se busca el Plan y después el M. Ej.: PM = 0%, CONT = 20%.", None),
    ("• Adicional por plan: tabla tbl_AdicionalPlan (G:H). Monto fijo que se suma en la columna Adicional de cada fila con ese Plan (ej. PM = 350.000).", None),
    ("• Las tablas tienen filas vacías al final: agregar ahí, sin insertar filas en el medio, y las fórmulas las toman solas.", None),
    ("", None),
    ("Pisar un valor en una fila puntual", "h"),
    ("• Columnas naranjas a la derecha de Obs: P 'G Adm manual', Q '% manual', R 'Adicional manual'. Si tienen un valor, se usa ese en lugar del parámetro. Vacías = regla de Parametros.", None),
    ("• Usarlas solo para casos que no siguen la regla y dejar el motivo en Obs. Así no se rompe ninguna fórmula.", None),
    ("• El % se pinta de rojo cuando la fila no tiene regla aplicable (ni excepción ni % del vendedor para el bloque de la sección): revisar Parametros o cargar el % manual.", None),
    ("", None),
    ("Agregar una fila de venta", "h"),
    ("• Cada sección es una tabla de Excel (T_<hoja> y T_<hoja>_Emp) y el subtotal gris es su fila de totales. Para agregar una venta: clic derecho en una fila de la tabla > Insertar > Filas de la tabla arriba, o Tab en la última celda de la última fila (columna R). La fila nueva copia fórmulas y formato, y el subtotal, el pie y el Resumen la incluyen solos.", None),
    ("• No escribir debajo del subtotal gris: esa fila ya no es de la tabla y no se suma.", None),
    ("", None),
    ("Pie de la hoja", "h"),
    ("• TOTAL A COBRAR = Comisión (M del subtotal, o de la franja negra si hay dos secciones) + Viatico + RECUPERO + Bonificacion + OTROS + ADICIONAL − Descuentos.", None),
    ("• Las celdas del pie tienen nombres de ámbito de hoja (Vidas, Ventas, Comision, Viatico, Recupero, BonifMonto, BonifPct, Otros, Adicional, Descuentos, TotalCobrar, Periodo; ver Fórmulas > Administrador de nombres). El Resumen las lee por nombre, así que insertar filas no rompe nada. Lo que sí rompe: borrar una fila del pie (el nombre queda en #¡REF!).", None),
    ("", None),
    ("Agregar un vendedor", "h"),
    ("1. Clic derecho en la pestaña de un vendedor > Mover o copiar > Crear una copia. Si el vendedor también vende a empresas, copiar la de SARA (tiene las dos secciones). Renombrar la pestaña.", None),
    ("2. En la copia: cambiar C2, borrar las filas de la tabla (dejar una) y los montos del pie. La copia trae sus nombres de ámbito de hoja, y Excel renombra las tablas solo (ej. T_SARA2): las fórmulas se actualizan.", None),
    ("3. En Parametros: agregar una fila en tbl_Vendedores (Vendedor + nombre exacto de la pestaña) y una fila por Bloque en tbl_PctVendedor.", None),
    ("4. El Resumen toma la fila nueva automáticamente (hasta 20 vendedores).", None),
    ("", None),
    ("Resumen", "h"),
    ("• Las columnas de la planilla original: Vendedor, VIDAS, Ventas total, Comision, Bonif 8% / 12% / 15%, Viatico, Otros, Descuentos y Total. Una fila por vendedor de tbl_Vendedores; cada valor se lee con INDIRECTO del nombre de ámbito de hoja de la pestaña indicada en tbl_Vendedores.", None),
    ("• Bonif N%: el monto de la Bonificacion de la hoja va a la columna de su %. Otros = RECUPERO + OTROS + ADICIONAL.", None),
    ("• Prueba = suma de los TOTAL A COBRAR de las hojas. Tiene que dar igual que el Total; si no, se pinta de rojo (ej. una bonificación con un % que no es 8, 12 ni 15, o una pestaña mal escrita en tbl_Vendedores).", None),
    ("", None),
    ("Esta planilla se genera con scripts/comisiones/build_plantilla_liquidacion.py (repo prepaga-digital).", "small"),
]


def build_leeme(wb):
    ws = wb.create_sheet("Leeme", 0)
    ws.column_dimensions["A"].width = 130
    for i, (line, kind) in enumerate(LEEME, start=1):
        c = ws.cell(i, 1, line)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if kind == "title":
            c.font = Font(bold=True, size=14)
        elif kind == "h":
            c.font = Font(bold=True, size=12, color="1F4E79")
        elif kind == "small":
            c.font = Font(italic=True, size=9, color="777777")
    return ws


def build_workbook(sellers, params: Params, path: str):
    wb = Workbook()
    wb.remove(wb.active)
    build_leeme(wb)
    build_parametros(wb, sellers, params)
    for s in sellers:
        build_seller_sheet(wb, s, params)
    build_resumen(wb, sellers)
    wb.calculation.fullCalcOnLoad = True
    wb.save(path)


# --------------------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", required=True, help="archivo .xlsx a generar")
    ap.add_argument("--origen", help="planilla vieja de la que importar las filas")
    args = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

    params = Params()
    sellers = [Seller(hoja=c["hoja"], nombre=c["nombre"], pct=dict(c["pct"])) for c in SALESPEOPLE]

    if args.origen:
        wb_f = load_workbook(args.origen)                    # formulas
        wb_v = load_workbook(args.origen, data_only=True)    # valores cacheados
        imp = Params(iva_div=params.iva_div)
        imp.pct_vend = {(norm(c["nombre"]), b): v for c in SALESPEOPLE for b, v in c["pct"].items()}
        imported = []
        for cfg in SALESPEOPLE:
            if cfg["hoja"] not in wb_f.sheetnames:
                raise SystemExit(f"la planilla de origen no tiene la hoja '{cfg['hoja']}'")
            imported.append(import_seller(cfg, wb_f[cfg["hoja"]], wb_v[cfg["hoja"]], imp))
        sellers = imported
    params.pct_vend = {(norm(s.nombre), b): v for s in sellers for b, v in s.pct.items()}

    build_workbook(sellers, params, args.salida)
    print(f"OK: {args.salida} ({len(sellers)} vendedores, {sum(len(s.rows) for s in sellers)} filas importadas)")

    if args.origen:
        ok = validate(sellers, params)
        return 0 if ok else 1
    return 0


def validate(sellers, params: Params) -> bool:
    print()
    print("VALIDACIÓN: TOTAL A COBRAR recalculado (fórmulas de la plantilla) vs. planilla original")
    print(f"{'Hoja':<18}{'Filas':>6}{'Esperado':>18}{'Original':>18}{'Dif':>12}  Estado")
    all_ok = True
    for s in sellers:
        mdl = model_sheet(s, params)
        orig = s.footer.orig_total
        diff = None if orig is None else mdl["TotalCobrar"] - orig
        ok = diff is not None and abs(diff) < 1
        all_ok &= ok
        print(f"{s.hoja:<18}{len(s.rows):>6}{mdl['TotalCobrar']:>18,.2f}{(orig if orig is not None else float('nan')):>18,.2f}"
              f"{(diff if diff is not None else float('nan')):>12,.4f}  {'OK' if ok else 'DIFERENCIA'}")
        # el Resumen solo reparte la bonificacion en Bonif 8% / 12% / 15%: otro % daria Prueba en rojo
        if mdl["BonifMonto"] and not any(abs(mdl["BonifPct"] - b) < 1e-4 for b in BONIF_PCTS):
            print(f"    aviso: bonificación de {fmt_pct(mdl['BonifPct'])} no es 8/12/15%: "
                  f"el Resumen no la muestra y la Prueba queda en rojo")
        # chequeo fila por fila contra la comision/adicional cacheados del original
        for r, (com, ad) in zip(s.rows, mdl["rows"]):
            if abs(com - (r.orig_comision or 0)) > 0.01 or abs(ad - (r.orig_adicional or 0)) > 0.01:
                print(f"    fila '{r.nombre}': comisión {com:,.2f} vs {r.orig_comision:,.2f}; adicional {ad:,.0f} vs {r.orig_adicional:,.0f}")
                all_ok = False
        for w in s.warnings:
            print(f"    aviso: {w}")
    print("RESULTADO:", "todas las hojas cuadran" if all_ok else "HAY DIFERENCIAS")

    # sensibilidad: el IVA es un parametro de verdad
    p2 = Params(iva_div=1.0, pct_vend=params.pct_vend)
    print()
    print("Prueba de parámetro: IVA_DIV 1,10 -> 1,00")
    for s in sellers:
        a, b = model_sheet(s, params)["TotalCobrar"], model_sheet(s, p2)["TotalCobrar"]
        print(f"  {s.hoja:<18}{a:>16,.2f} -> {b:>16,.2f}")
    return all_ok


if __name__ == "__main__":
    sys.exit(main())
