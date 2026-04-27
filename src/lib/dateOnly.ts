const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeDateInputValue = (value?: string | null) => {
  if (!value) return "";
  if (DATE_ONLY_REGEX.test(value)) return value;

  const datePart = value.split("T")[0];
  if (DATE_ONLY_REGEX.test(datePart)) return datePart;

  return value;
};

export const formatDateOnly = (
  value?: string | null,
  locale = "es-PY",
) => {
  if (!value) return "-";

  const normalized = normalizeDateInputValue(value);
  if (DATE_ONLY_REGEX.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    return new Intl.DateTimeFormat(locale).format(new Date(year, month - 1, day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return parsed.toLocaleDateString(locale);
};
