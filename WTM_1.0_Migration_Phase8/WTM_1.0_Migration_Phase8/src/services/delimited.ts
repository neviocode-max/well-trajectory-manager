export type RawRow = Record<string, string>;

/**
 * Delimited-text parser ported from WTM 4.3. Delimiters are comma,
 * semicolon, or tab; quoted fields and escaped double quotes are preserved.
 */
export function parseDelimited(text: string): RawRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];
    if (c === '"') {
      if (quoted && n === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if ((c === ',' || c === ';' || c === '\t') && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && n === '\n') i++;
      row.push(field);
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];

  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(values =>
    Object.fromEntries(head.map((key, i) => [key, (values[i] == null ? '' : values[i]).trim()])),
  );
}

export function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Array<Record<string, unknown>>, keys?: string[]): string {
  if (!rows.length) return '';
  const columns = keys ?? [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(',')),
  ].join('\n');
}

export function rowsToTSV(rows: Array<Record<string, unknown>>, keys?: string[]): string {
  if (!rows.length) return '';
  const columns = keys ?? Object.keys(rows[0]);
  return [
    columns.join('\t'),
    ...rows.map(row => columns.map(column => row[column] ?? '').join('\t')),
  ].join('\n');
}
