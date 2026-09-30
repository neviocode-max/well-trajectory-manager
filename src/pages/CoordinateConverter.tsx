import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useDatabaseSnapshot } from '../app/DatabaseContext';
import { latLonToUtm, utmToLatLon, type UtmCoordinate } from '../engine/coordinates';
import { copyRows, copyText, exportRows } from '../services/browserFiles';
import { Message, type MessageState } from '../components/common/Message';
import { fmt, raw } from '../utils/format';
import { moveSpreadsheetFocus, parseSpreadsheetPaste } from '../utils/spreadsheet';

const MIN_ROWS = 8;
type Mode = 'll2utm' | 'utm2ll';
type Role = 'lat' | 'lon' | 'zone' | 'hem' | 'east' | 'north';

interface CoordinateRow {
  lat: string;
  lon: string;
  zone: string;
  hem: string;
  east: string;
  north: string;
  out: UtmCoordinate | null;
  error: string;
}

const HEADS: Array<[Role, string]> = [
  ['lat', 'Latitude (°)'], ['lon', 'Longitude (°)'], ['zone', 'UTM Zone'], ['hem', 'Hemisphere'], ['east', 'Easting (m)'], ['north', 'Northing (m)'],
];

function blankRow(): CoordinateRow {
  return { lat: '', lon: '', zone: '', hem: 'S', east: '', north: '', out: null, error: '' };
}
function makeRows(): CoordinateRow[] { return Array.from({ length: MIN_ROWS }, blankRow); }
function populated(row: CoordinateRow): boolean { return [row.lat, row.lon, row.zone, row.east, row.north].some(value => value.trim() !== ''); }
function editRoles(mode: Mode): Role[] { return mode === 'll2utm' ? ['lat', 'lon'] : ['east', 'north', 'zone', 'hem']; }
function formatOutput(row: CoordinateRow, role: Role): string {
  if (!row.out) return '';
  if (role === 'lat') return fmt(row.out.latitude, 7);
  if (role === 'lon') return fmt(row.out.longitude, 7);
  if (role === 'zone') return String(row.out.zone);
  if (role === 'hem') return row.out.hemisphere;
  if (role === 'east') return fmt(row.out.easting, 3);
  return fmt(row.out.northing, 3);
}

function calculate(row: CoordinateRow, mode: Mode): CoordinateRow {
  const next: CoordinateRow = { ...row, out: null, error: '' };
  if (!populated(next)) return next;
  try {
    if (mode === 'll2utm') {
      if (!next.lat.trim() || !next.lon.trim()) throw new Error('Enter latitude and longitude.');
      const lat = Number(next.lat), lon = Number(next.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Enter valid latitude and longitude.');
      next.out = latLonToUtm(lat, lon);
      next.lat = raw(next.out.latitude, 7);
      next.lon = raw(next.out.longitude, 7);
    } else {
      if (!next.east.trim() || !next.north.trim() || !next.zone.trim()) throw new Error('Enter easting, northing and UTM zone.');
      const east = Number(next.east), north = Number(next.north), zone = Number(next.zone);
      if (![east, north, zone].every(Number.isFinite)) throw new Error('Enter valid easting, northing and UTM zone.');
      const hem = String(next.hem || 'S').toUpperCase();
      if (hem !== 'N' && hem !== 'S') throw new Error('Hemisphere must be N or S.');
      next.hem = hem;
      next.out = utmToLatLon(east, north, zone, hem as 'N' | 'S');
    }
  } catch (error) {
    next.error = error instanceof Error ? error.message : String(error);
  }
  return next;
}

export function CoordinateConverter() {
  const snapshot = useDatabaseSnapshot();
  const [mode, setMode] = useState<Mode>('ll2utm');
  const [rows, setRows] = useState<CoordinateRow[]>(makeRows);
  const [selectedColumn, setSelectedColumn] = useState<Role | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const roles = editRoles(mode);
  const inputColumns = useMemo(() => new Set<Role>(roles), [mode]);
  const validRows = useMemo(() => rows.filter(row => row.out && !row.error).map(row => ({
    Latitude: +row.out!.latitude.toFixed(7),
    Longitude: +row.out!.longitude.toFixed(7),
    'UTM Zone': row.out!.zone,
    Hemisphere: row.out!.hemisphere,
    'Easting (m)': +row.out!.easting.toFixed(3),
    'Northing (m)': +row.out!.northing.toFixed(3),
  })), [rows]);
  const counts = useMemo(() => ({
    populated: rows.filter(populated).length,
    valid: validRows.length,
    failed: rows.filter(row => row.error).length,
  }), [rows, validRows.length]);

  const ensureRows = (source: CoordinateRow[], count: number) => source.length >= count ? source : [...source, ...Array.from({ length: count - source.length }, blankRow)];

  const update = (index: number, role: Role, value: string) => {
    setRows(current => {
      const next = current.slice();
      const draft = { ...next[index], [role]: role === 'hem' ? value.toUpperCase() : value };
      next[index] = calculate(draft, mode);
      return next;
    });
  };

  const pasteInto = (start: number, role: Role, text: string) => {
    const data = parseSpreadsheetPaste(text);
    if (!data.length) return;
    setRows(current => {
      const next = ensureRows(current.slice(), start + data.length);
      data.forEach((columns, offset) => {
        const index = start + offset;
        const draft = { ...next[index] };
        if (mode === 'll2utm') {
          if (columns.length >= 2) {
            draft.lat = String(columns[0]).trim();
            draft.lon = String(columns[1]).trim();
          } else if (role === 'lat' || role === 'lon') draft[role] = String(columns[0]).trim();
        } else {
          if (columns.length >= 4) {
            draft.east = String(columns[0]).trim();
            draft.north = String(columns[1]).trim();
            draft.zone = String(columns[2]).trim();
            draft.hem = String(columns[3] || 'S').trim().toUpperCase();
          } else if (role !== 'lat' && role !== 'lon') {
            if (role === 'hem') draft.hem = String(columns[0]).trim().toUpperCase();
            else draft[role] = String(columns[0]).trim();
          }
        }
        next[index] = calculate(draft, mode);
      });
      return next;
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>, row: number, role: Role) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();
    pasteInto(row, role, text);
  };

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setSelectedColumn(null);
    setRows(current => current.map(row => {
      const draft = { ...row };
      if (row.out && !row.error) {
        draft.lat = raw(row.out.latitude, 7);
        draft.lon = raw(row.out.longitude, 7);
        draft.zone = String(row.out.zone);
        draft.hem = row.out.hemisphere;
        draft.east = raw(row.out.easting, 3);
        draft.north = raw(row.out.northing, 3);
      }
      draft.out = null;
      draft.error = '';
      return calculate(draft, nextMode);
    }));
  };

  const columnValue = (row: CoordinateRow, role: Role): string => inputColumns.has(role) ? String(row[role] ?? '') : formatOutput(row, role);
  const copyColumn = async (role: Role) => {
    let last = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (populated(rows[i]) || rows[i].out) { last = i; break; }
    if (last < 0) return;
    const ok = await copyText(rows.slice(0, last + 1).map(row => columnValue(row, role)).join('\n'));
    setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Column copied.' : 'Copy failed.' });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!selectedColumn || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches('input,textarea,select') || active?.isContentEditable) return;
      event.preventDefault();
      void copyColumn(selectedColumn);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const crsHint = snapshot.meta.crs
    ? <>Current well DB CRS: <b>{snapshot.meta.crs}</b>.</>
    : <>Ensure converted coordinates use the same CRS/grid as the well database.</>;

  return (
    <div className="content">
      <section className="card">
        <h3>Coordinate Converter</h3>
        <p className="hint">Excel-like multi-row WGS84 conversion between geographic decimal degrees and UTM. Enter or paste many rows; valid rows convert automatically. {crsHint}</p>
        <div className="converter-toolbar">
          <div className="field">
            <label htmlFor="coord-mode">Conversion</label>
            <select id="coord-mode" value={mode} onChange={event => switchMode(event.target.value as Mode)}>
              <option value="ll2utm">Latitude / Longitude → UTM</option>
              <option value="utm2ll">UTM → Latitude / Longitude</option>
            </select>
          </div>
          <button type="button" onClick={() => setRows(current => [...current, blankRow()])}>＋ Add Row</button>
          <button type="button" className="danger" onClick={() => { setRows(makeRows()); setSelectedColumn(null); setMessage(null); }}>Clear Table</button>
          <span className="right" />
          <button type="button" className="btn-sm" disabled={!validRows.length} onClick={async () => {
            const ok = await copyRows(validRows);
            setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Coordinate results copied.' : 'Copy failed.' });
          }}>📋 Copy Results</button>
          <button type="button" className="primary btn-sm" disabled={!validRows.length} onClick={() => {
            exportRows(validRows, ['Coordinate_Converter', mode === 'll2utm' ? 'LatLon_to_UTM' : 'UTM_to_LatLon']);
            setMessage({ kind: 'ok', text: 'Coordinate CSV exported.' });
          }}>⭳ Export CSV</button>
        </div>
        <p className="converter-paste-hint">{mode === 'll2utm' ? <>Tip: paste two Excel columns (<b>Latitude + Longitude</b>) into the Latitude column. UTM zone is detected automatically. Click a column header to copy that column.</> : <>Tip: paste four Excel columns (<b>Easting + Northing + Zone + Hemisphere</b>) into the Easting column. Click a column header to copy that column.</>}</p>

        <div ref={gridRef} onKeyDown={event => moveSpreadsheetFocus(event, gridRef, '.coord-edit')}>
          <div className="converter-table-wrap">
            <table className="converter-table coord-table">
              <thead><tr>{HEADS.map(([role, label]) => <th key={role} className={`conv-col-head ${inputColumns.has(role) ? 'input-col' : ''} ${selectedColumn === role ? 'column-selected' : ''}`} onClick={() => setSelectedColumn(role)}><span className="conv-head-inner"><span>{label}</span><button className="conv-head-copy" type="button" title={`Copy ${label} column`} onClick={event => { event.stopPropagation(); setSelectedColumn(role); void copyColumn(role); }}>📋</button></span></th>)}<th>Status</th><th /></tr></thead>
              <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={row.error ? 'has-error' : row.out ? 'valid' : ''}>
                {HEADS.map(([role]) => {
                  const selected = selectedColumn === role;
                  if (inputColumns.has(role)) {
                    const gridCol = roles.indexOf(role);
                    return <td key={role} className={`input-col conv-edit-cell ${selected ? 'column-selected' : ''}`}>
                      {role === 'hem' ? <select className="conv-edit coord-edit" data-row={rowIndex} data-grid-col={gridCol} value={row.hem} onChange={event => update(rowIndex, role, event.target.value)} onPaste={event => handlePaste(event, rowIndex, role)}><option value="S">S</option><option value="N">N</option></select> : <input className="conv-edit coord-edit" data-row={rowIndex} data-grid-col={gridCol} type="number" inputMode="decimal" step="any" value={String(row[role])} onChange={event => update(rowIndex, role, event.target.value)} onPaste={event => handlePaste(event, rowIndex, role)} />}
                    </td>;
                  }
                  return <td key={role} className={`out ${selected ? 'column-selected' : ''}`}>{formatOutput(row, role)}</td>;
                })}
                <td className="status">{row.error ? `⚠ ${row.error}` : row.out ? '✓ Converted' : ''}</td>
                <td><button className="ghost row-del" type="button" title="Delete row" onClick={() => setRows(current => ensureRows(current.filter((_, index) => index !== rowIndex), MIN_ROWS))}>✕</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="converter-summary"><span><b>{counts.populated}</b> populated</span><span><b>{counts.valid}</b> converted</span>{counts.failed ? <span><b>{counts.failed}</b> with errors</span> : null}</div>
        <Message message={message} />
      </section>
    </div>
  );
}
