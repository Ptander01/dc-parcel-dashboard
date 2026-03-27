export function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatCurrencyFull(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatAcres(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ac`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatCurrencyPerAcre(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}/ac`;
}

export function safeNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === "" || val === "-") return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[,$]/g, ""));
  return isNaN(n) ? 0 : n;
}
