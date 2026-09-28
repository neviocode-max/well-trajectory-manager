import { EmptyState } from '../common/EmptyState';

const HEADER_LABELS: Record<string, string> = {
  MD: 'MD (m)',
  TVD: 'TVD (m)',
  X: 'X / Easting (m)',
  Y: 'Y / Northing (m)',
  Z: 'Z / Elevation (mASL)',
  Azimuth: 'Azimuth (°)',
  Inclination: 'Inclination (°)',
  Residual: 'Residual (m)',
  Tolerance: 'Tolerance (m)',
  'MD From': 'MD From (m)',
  'MD To': 'MD To (m)',
};

export function displayHeader(key: string): string {
  return HEADER_LABELS[key] || key;
}

interface DataTableProps {
  rows: Array<Record<string, unknown>>;
  keys?: string[];
  limit?: number;
  empty?: string;
  maxHeight?: number;
}

const NUMERIC_COLUMNS = new Set(['MD','X','Y','Z','TVD','Azimuth','Inclination','MD From','MD To','Residual','Tolerance']);

function displayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

export function DataTable({ rows, keys, limit = 500, empty = 'No data.', maxHeight = 440 }: DataTableProps) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  const columns = keys ?? Object.keys(rows[0]);
  return (
    <div className="table-wrap" style={{ maxHeight }}>
      <table>
        <thead>
          <tr>{columns.map(column => <th key={column}>{displayHeader(column)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td key={column} className={typeof row[column] === 'number' || NUMERIC_COLUMNS.has(column) ? 'num' : undefined} style={columnIndex === 0 ? { textAlign: 'left' } : undefined}>
                  {displayValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
