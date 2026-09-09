export function assertSingleCurrency(currencies: string[]): string {
  const unique = [...new Set(currencies.filter(Boolean))];
  if (unique.length === 0) throw new Error("No currency available for reporting");
  if (unique.length > 1) throw new Error(`Cannot aggregate mixed currencies: ${unique.join(", ")}`);
  return unique[0];
}

export function formatCurrency(value: number | null, currency: string, locale = "en-US") {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}
