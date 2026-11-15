/**
 * Número tal como se escribe en es-PY: "350.000" son trescientos cincuenta mil
 * (el punto separa miles) y "1.500,50" lleva coma decimal. Un `Number("350.000")`
 * daría 350 en silencio, que es justo el error que no podemos permitir en plata.
 * Devuelve NaN si no se entiende.
 */
export const parseLocalizedAmount = (raw: string): number => {
  const value = raw.trim().replace(/\s/g, '');
  if (!value) return NaN;
  if (value.includes(',')) return Number(value.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ''));
  return Number(value);
};
