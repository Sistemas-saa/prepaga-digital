export const formatCommissionCurrency = (amount: number, currencyCode: string) => {
  const code = /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : 'PYG';
  try {
    return new Intl.NumberFormat('es-PY', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'PYG' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString('es-PY')} ${code}`;
  }
};
