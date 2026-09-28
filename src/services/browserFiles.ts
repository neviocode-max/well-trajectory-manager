import { rowsToTSV, toCSV } from './delimited';
import { wtmFilename } from '../utils/format';

export function downloadText(filename: string, data: string, mime = 'text/csv'): void {
  const blob = new Blob([data], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportRows(
  rows: Array<Record<string, unknown>>,
  parts: Array<string | number | null | undefined>,
  keys?: string[],
): boolean {
  if (!rows.length) return false;
  downloadText(wtmFilename(parts, 'csv'), toCSV(rows, keys));
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Use the WTM 4.3-compatible fallback below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;top:-2000px;left:-2000px;opacity:0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function copyRows(rows: Array<Record<string, unknown>>, keys?: string[]): Promise<boolean> {
  return copyText(rowsToTSV(rows, keys));
}
