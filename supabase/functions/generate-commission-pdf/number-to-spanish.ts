const UNITS = [
  "CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS",
  "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];

const HUNDREDS: Record<number, string> = {
  200: "DOSCIENTOS",
  300: "TRESCIENTOS",
  400: "CUATROCIENTOS",
  500: "QUINIENTOS",
  600: "SEISCIENTOS",
  700: "SETECIENTOS",
  800: "OCHOCIENTOS",
  900: "NOVECIENTOS",
};

function underThousand(value: number): string {
  if (value < 30) return UNITS[value];
  if (value < 100) {
    const tens = Math.floor(value / 10) * 10;
    const unit = value % 10;
    const tensName: Record<number, string> = {
      30: "TREINTA", 40: "CUARENTA", 50: "CINCUENTA", 60: "SESENTA",
      70: "SETENTA", 80: "OCHENTA", 90: "NOVENTA",
    };
    return unit === 0 ? tensName[tens] : `${tensName[tens]} Y ${UNITS[unit]}`;
  }
  if (value === 100) return "CIEN";
  const hundreds = Math.floor(value / 100) * 100;
  const rest = value % 100;
  const prefix = hundreds === 100 ? "CIENTO" : HUNDREDS[hundreds];
  return rest === 0 ? prefix : `${prefix} ${underThousand(rest)}`;
}

function apocopate(value: string): string {
  return value
    .replace(/VEINTIUNO$/u, "VEINTIÚN")
    .replace(/ Y UNO$/u, " Y UN")
    .replace(/ UNO$/u, " UN")
    .replace(/^UNO$/u, "UN");
}

function integerToWords(value: number): string {
  if (value < 1_000) return underThousand(value);
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1_000);
    const rest = value % 1_000;
    const prefix = thousands === 1 ? "MIL" : `${apocopate(integerToWords(thousands))} MIL`;
    return rest === 0 ? prefix : `${prefix} ${integerToWords(rest)}`;
  }
  if (value < 1_000_000_000_000) {
    const millions = Math.floor(value / 1_000_000);
    const rest = value % 1_000_000;
    const prefix = millions === 1
      ? "UN MILLÓN"
      : `${apocopate(integerToWords(millions))} MILLONES`;
    return rest === 0 ? prefix : `${prefix} ${integerToWords(rest)}`;
  }
  throw new RangeError("El monto excede el rango soportado");
}

export function guaraniesInWords(rawValue: number): string {
  if (!Number.isFinite(rawValue) || rawValue < 0 || rawValue > 999_999_999_999) {
    throw new RangeError("Monto inválido para conversión a guaraníes");
  }
  const value = Math.round(rawValue);
  const words = integerToWords(value);
  const suffix = value >= 1_000_000 && value % 1_000_000 === 0
    ? " DE GUARANÍES"
    : " GUARANÍES";
  return `${apocopate(words)}${suffix}`;
}
