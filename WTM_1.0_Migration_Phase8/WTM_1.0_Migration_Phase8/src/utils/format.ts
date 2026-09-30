export function fmt(value: unknown, digits = 3): string {
  if (value == null || !Number.isFinite(Number(value))) return String(value ?? '');
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function raw(value: unknown, digits = 4): string {
  return Number.isFinite(Number(value))
    ? String(Number(Number(value).toFixed(digits)))
    : String(value ?? '');
}

export function safeName(value: string): string {
  return String(value).replace(/[^\w.-]+/g, '_');
}

export function fileDateStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function wtmFilename(parts: Array<string | number | null | undefined>, ext = 'csv'): string {
  const body = parts
    .filter(v => v != null && String(v).trim() !== '')
    .map(v => safeName(String(v).trim()))
    .filter(Boolean)
    .join('_');
  return `WTM_${body || 'Export'}_${fileDateStamp()}.${ext}`;
}
