import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { blankConverterRow as blankRow, createConverterRows as createRows, MIN_CONVERTER_ROWS as MIN_ROWS, type useConverterWorkspace } from '../app/ConverterWorkspace';
import { TYPES, type ConversionOutput, type TrajectoryInputType } from '../engine/trajectory';
import { copyRows, copyText, exportRows } from '../services/browserFiles';
import { parseDelimited } from '../services/delimited';
import { calculateConverterRow, converterInputRows, roundedConversion, type ConverterRowState } from '../services/trajectoryTools';
import { Message, type MessageState } from '../components/common/Message';
import { raw } from '../utils/format';
import { moveSpreadsheetFocus, parseSpreadsheetPaste } from '../utils/spreadsheet';
import type { ConverterFocusRequest, StudioFocusRequest } from '../types/studio';

const INPUT_TYPES = Object.keys(TYPES) as TrajectoryInputType[];
const OUTPUT_COLUMNS: Array<keyof ConversionOutput> = ['mMD', 'ftMD', 'mTVD', 'ftTVD', 'mASL', 'ftASL', 'X', 'Y', 'Azimuth', 'Inclination', 'DIP'];

const HEADERS: Record<string, string> = {
  Well: 'Well', mMD: 'mMD', ftMD: 'ftMD', mTVD: 'mTVD', ftTVD: 'ftTVD',
  mASL: 'mASL', ftASL: 'ftASL', X: 'X / Easting (m)', Y: 'Y / Northing (m)',
  Azimuth: 'Azimuth (°)', Inclination: 'Inclination (°)', DIP: 'DIP (°)',
};

type FillRole = 'well' | 'input';
interface FillSelection { role: FillRole; anchor: number; start: number; end: number }
interface FillDrag { role: FillRole; srcStart: number; srcEnd: number; target: number }

function populated(row: ConverterRowState): boolean {
  return Boolean(row.well.trim()) || row.input.trim() !== '';
}

function displayValue(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '';
}

function normalized(selection: FillSelection | null): FillSelection | null {
  if (!selection) return null;
  return { ...selection, start: Math.min(selection.start, selection.end), end: Math.max(selection.start, selection.end) };
}

export function TrajectoryConverter({ workspace, onShowInStudio, focusRequest, onFocusConsumed }: { workspace: ReturnType<typeof useConverterWorkspace>; onShowInStudio?: (request: StudioFocusRequest) => void; focusRequest?: ConverterFocusRequest | null; onFocusConsumed?: () => void }) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const { inputType, setInputType, rows, setRows, activeRow, setActiveRow } = workspace;
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [fillSelection, setFillSelection] = useState<FillSelection | null>(null);
  const [fillPreviewTarget, setFillPreviewTarget] = useState<number | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<FillDrag | null>(null);

  const recalc = (row: ConverterRowState, type = inputType): ConverterRowState =>
    calculateConverterRow(database.get(row.well), row.well, type, row.input);

  useEffect(() => {
    if (!focusRequest) return;
    const record = database.get(focusRequest.well);
    if (record) {
      const row = calculateConverterRow(record, record.name, 'mMD', focusRequest.md == null ? '' : raw(focusRequest.md, 3));
      setInputType('mMD');
      setRows(ensureRows([row], MIN_ROWS));
      setActiveRow(0);
      setFillSelection(null);
      setSelectedColumn(null);
      setMessage(null);
    }
    onFocusConsumed?.();
    // This mirrors WTM 4.3 Converter.setWell(): reset to one mMD row and calculate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const validOutputs = useMemo(() => rows
    .filter(row => row.output && !row.error)
    .map(row => roundedConversion(row.output!)), [rows]);

  const counts = useMemo(() => ({
    populated: rows.filter(populated).length,
    valid: rows.filter(row => row.output && !row.error).length,
    failed: rows.filter(row => Boolean(row.error)).length,
  }), [rows]);

  const activeOutput = activeRow == null ? null : rows[activeRow]?.output ?? null;
  const selection = normalized(fillSelection);

  const updateCell = (index: number, role: FillRole, value: string) => {
    setRows(current => {
      const next = current.slice();
      const draft = { ...next[index], [role === 'well' ? 'well' : 'input']: value } as ConverterRowState;
      next[index] = recalc(draft);
      return next;
    });
  };

  const ensureRows = (current: ConverterRowState[], count: number): ConverterRowState[] => {
    if (current.length >= count) return current;
    return [...current, ...Array.from({ length: count - current.length }, blankRow)];
  };

  const chooseFillCell = (role: FillRole, row: number, extend: boolean) => {
    setFillSelection(current => {
      if (extend && current?.role === role) return { ...current, end: row };
      return { role, anchor: row, start: row, end: row };
    });
  };

  const fillPattern = (sourceRows: ConverterRowState[], drag: FillDrag): ConverterRowState[] => {
    if (drag.target <= drag.srcEnd) return sourceRows;
    const next = ensureRows(sourceRows.slice(), drag.target + 1);
    const source = next.slice(drag.srcStart, drag.srcEnd + 1);
    if (drag.role === 'well') {
      const pattern = source.map(row => row.well);
      for (let i = drag.srcEnd + 1; i <= drag.target; i++) {
        const draft = { ...next[i], well: pattern[(i - drag.srcEnd - 1) % pattern.length] };
        next[i] = recalc(draft);
      }
    } else {
      const rawValues = source.map(row => row.input);
      const numbers = rawValues.map(Number);
      const isSeries = numbers.length >= 2 && numbers.every(Number.isFinite);
      if (isSeries) {
        const step = numbers[numbers.length - 1] - numbers[numbers.length - 2];
        const last = numbers[numbers.length - 1];
        for (let i = drag.srcEnd + 1; i <= drag.target; i++) {
          const value = last + step * (i - drag.srcEnd);
          next[i] = recalc({ ...next[i], input: Number.isFinite(value) ? String(+value.toFixed(12)) : '' });
        }
      } else {
        for (let i = drag.srcEnd + 1; i <= drag.target; i++) {
          next[i] = recalc({ ...next[i], input: rawValues[(i - drag.srcEnd - 1) % rawValues.length] });
        }
      }
    }
    return next;
  };

  const startFillDrag = (event: ReactPointerEvent, role: FillRole, row: number) => {
    event.preventDefault();
    event.stopPropagation();
    let source = selection;
    if (!source || source.role !== role || row !== source.end) {
      source = { role, anchor: row, start: row, end: row };
      setFillSelection(source);
    }
    dragRef.current = { role, srcStart: source.start, srcEnd: source.end, target: source.end };
    setFillPreviewTarget(source.end);
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const rowElement = element?.closest?.('tr[data-converter-row]') as HTMLElement | null;
      if (rowElement) {
        const row = Number(rowElement.dataset.converterRow);
        if (Number.isInteger(row)) {
          drag.target = Math.max(drag.srcEnd, row);
          setFillPreviewTarget(drag.target);
        }
      }
      const wrap = gridRef.current?.querySelector<HTMLElement>('.converter-table-wrap');
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        if (event.clientY > rect.bottom - 28) {
          wrap.scrollTop += 18;
          if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 24) {
            setRows(current => ensureRows(current, current.length + 5));
          }
        } else if (event.clientY < rect.top + 28) wrap.scrollTop -= 18;
      }
    };
    const up = () => {
      const drag = dragRef.current;
      if (drag && drag.target > drag.srcEnd) {
        setRows(current => fillPattern(current, drag));
        setFillSelection({ role: drag.role, anchor: drag.srcStart, start: drag.srcStart, end: drag.target });
        setMessage({ kind: 'ok', text: drag.role === 'well' ? 'Well name filled down.' : (drag.srcEnd > drag.srcStart ? 'Numeric series filled down.' : 'Input value filled down.') });
      }
      dragRef.current = null;
      setFillPreviewTarget(null);
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // fillPattern intentionally uses current database/inputType from this mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const pasteInto = (start: number, role: FillRole, text: string) => {
    let data = parseSpreadsheetPaste(text);
    if (data[0] && String(data[0][0] || '').trim().toLowerCase() === 'well') data = data.slice(1);
    if (!data.length) return;
    setRows(current => {
      const next = ensureRows(current.slice(), start + data.length);
      data.forEach((columns, offset) => {
        const index = start + offset;
        let draft = { ...next[index] };
        if (role === 'well') {
          draft.well = String(columns[0] || '').trim();
          if (columns.length > 1) draft.input = String(columns[1] || '').trim();
        } else if (columns.length > 1) {
          draft.well = String(columns[0] || '').trim();
          draft.input = String(columns[1] || '').trim();
        } else draft.input = String(columns[0] || '').trim();
        next[index] = recalc(draft);
      });
      return next;
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, row: number, role: FillRole) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();
    pasteInto(row, role, text);
  };

  const changeType = (type: TrajectoryInputType) => {
    if (type === inputType) return;
    setInputType(type);
    setFillSelection(current => current?.role === 'input' ? null : current);
    setRows(current => current.map(row => {
      // WTM 4.3 parity: changing the input type only moves the already-calculated
      // value into the editable input cell. Do not recalculate from the rounded
      // 3-decimal display value, otherwise repeated type changes can introduce drift.
      if (row.output && !row.error && Number.isFinite(row.output[type])) {
        return { ...row, input: raw(row.output[type], 3) };
      }
      return populated(row) ? { ...row, input: '', output: null, error: '' } : row;
    }));
  };

  const columnValue = (row: ConverterRowState, key: string): string => {
    if (key === 'Well') return row.well;
    if (key === inputType) return row.input;
    if (!row.output || row.error) return '';
    const value = row.output[key as keyof ConversionOutput];
    return typeof value === 'number' && Number.isFinite(value) ? raw(value, 3) : String(value ?? '');
  };

  const copyColumn = async (key = selectedColumn) => {
    if (!key) return;
    let last = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (populated(rows[i])) { last = i; break; }
    if (last < 0) {
      setMessage({ kind: 'bad', text: `No populated values to copy from ${key}.` });
      return;
    }
    const ok = await copyText(rows.slice(0, last + 1).map(row => columnValue(row, key)).join('\n'));
    setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? `${key} column copied.` : 'Copy failed.' });
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

  const importFile = async (file: File) => {
    try {
      if (!snapshot.names.length) throw new Error('The database is empty. Load a database first.');
      const parsed = parseDelimited(await file.text());
      if (!parsed.length) throw new Error('The file is empty.');
      const { type, rows: inputs } = converterInputRows(parsed);
      setInputType(type);
      setActiveRow(null);
      setFillSelection(null);
      const next = inputs.map(row => calculateConverterRow(
        database.get(row.well), row.well, type, row.input,
      ));
      setRows(ensureRows(next, Math.max(MIN_ROWS, next.length)));
      setMessage({ kind: 'ok', text: `Imported ${file.name} into the converter table.` });
    } catch (error) {
      setMessage({ kind: 'bad', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const copyResults = async () => {
    const ok = await copyRows(validOutputs);
    setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Trajectory results copied.' : 'Copy failed.' });
  };

  return (
    <div className="content">
      <section className="card">
        <h3>Trajectory Converter</h3>
        <p className="hint">Use one row for a quick conversion or paste many rows directly from Excel. Select the input type once; the matching column becomes editable and all other trajectory values are calculated automatically.</p>

        <div className="converter-toolbar">
          <div className="field">
            <label htmlFor="converter-type">Input Type</label>
            <select id="converter-type" value={inputType} onChange={event => changeType(event.target.value as TrajectoryInputType)}>
              {INPUT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => setRows(current => [...current, blankRow()])}>＋ Add Row</button>
          <button type="button" onClick={() => fileRef.current?.click()}>⭱ Import CSV / TSV</button>
          <button type="button" className="danger" onClick={() => { setRows(createRows()); setFillSelection(null); setSelectedColumn(null); setActiveRow(null); setMessage(null); }}>Clear Table</button>
          <span className="right" />
          <button type="button" className="btn-sm" disabled={!activeOutput || !onShowInStudio} title={activeOutput ? 'Show the active converted station in Trajectory Studio.' : 'Select a valid converted row first.'} onClick={() => { if (activeOutput && onShowInStudio) onShowInStudio({ well: activeOutput.Well, md: activeOutput.mMD, token: Date.now() }); }}>🎨 Show in Studio</button>
          <button type="button" className="btn-sm" disabled={!validOutputs.length} onClick={() => void copyResults()}>📋 Copy Results</button>
          <button type="button" className="primary btn-sm" disabled={!validOutputs.length} onClick={() => { exportRows(validOutputs, ['Trajectory_Converter', inputType]); setMessage({ kind: 'ok', text: 'Trajectory CSV exported.' }); }}>⭳ Export CSV</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="hidden-input" onChange={event => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = '';
        }} />
        <p className="converter-paste-hint">Tip: paste a single Excel column into the highlighted input column, or paste two columns (<b>Well</b> + value) into the Well column. Use the fill handle to repeat/continue values. To copy one column, click its header, then click <b>📋</b> or press <b>Ctrl+C</b>.</p>
        <datalist id="converter-well-list">{snapshot.names.map(name => <option value={name} key={name} />)}</datalist>

        <div ref={gridRef} onKeyDown={event => moveSpreadsheetFocus(event, gridRef, '.conv-edit')}>
          <div className={`converter-table-wrap ${dragging ? 'converter-filling' : ''}`}>
            <table className="converter-table">
              <thead>
                <tr>
                  {['Well', ...OUTPUT_COLUMNS].map(key => {
                    const input = key === inputType;
                    const selected = selectedColumn === key;
                    return (
                      <th key={key} className={`conv-col-head ${input ? 'input-col' : ''} ${selected ? 'column-selected' : ''}`} onClick={() => setSelectedColumn(key)}>
                        <span className="conv-head-inner"><span>{HEADERS[key]}</span><button className="conv-head-copy" type="button" title={`Copy ${HEADERS[key]} column`} onClick={event => { event.stopPropagation(); setSelectedColumn(key); void copyColumn(key); }}>📋</button></span>
                      </th>
                    );
                  })}
                  <th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const rowClass = `${row.error ? 'has-error' : row.output ? 'valid' : ''} ${activeRow === rowIndex ? 'active-row' : ''}`;
                  return (
                    <tr key={rowIndex} data-converter-row={rowIndex} className={rowClass} onClick={() => setActiveRow(rowIndex)}>
                      <EditableCell role="well" row={rowIndex} selectedColumn={selectedColumn === 'Well'} selection={selection} previewTarget={fillPreviewTarget} onPointerDown={startFillDrag}>
                        <input className="conv-edit conv-well" data-row={rowIndex} data-grid-col={0} list="converter-well-list" autoComplete="off" spellCheck={false} value={row.well} placeholder="Well" onClick={event => chooseFillCell('well', rowIndex, event.shiftKey)} onChange={event => updateCell(rowIndex, 'well', event.target.value)} onPaste={event => handlePaste(event, rowIndex, 'well')} />
                      </EditableCell>
                      {OUTPUT_COLUMNS.map(column => {
                        const selected = selectedColumn === column;
                        if (column === inputType) return (
                          <EditableCell key={column} role="input" row={rowIndex} selectedColumn={selected} selection={selection} previewTarget={fillPreviewTarget} onPointerDown={startFillDrag} input>
                            <input className="conv-edit conv-value" data-row={rowIndex} data-grid-col={1} type="number" inputMode="decimal" step="any" value={row.input} placeholder={column} onClick={event => chooseFillCell('input', rowIndex, event.shiftKey)} onChange={event => updateCell(rowIndex, 'input', event.target.value)} onPaste={event => handlePaste(event, rowIndex, 'input')} />
                          </EditableCell>
                        );
                        return <td key={column} className={`out ${selected ? 'column-selected' : ''}`}>{row.output ? displayValue(row.output[column]) : ''}</td>;
                      })}
                      <td className="status">{row.error ? `⚠ ${row.error}` : row.output ? '✓ Converted' : ''}</td>
                      <td><button className="ghost row-del" type="button" title="Delete row" onClick={event => { event.stopPropagation(); setRows(current => ensureRows(current.filter((_, index) => index !== rowIndex), MIN_ROWS)); setFillSelection(null); if (activeRow === rowIndex) setActiveRow(null); }}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="converter-summary">
          <span><b>{counts.populated}</b> populated</span><span><b>{counts.valid}</b> converted</span>{counts.failed ? <span><b>{counts.failed}</b> with errors</span> : null}<span>Input: <b>{inputType}</b></span>
        </div>
        <Message message={message} />
      </section>
    </div>
  );
}

interface EditableCellProps {
  role: FillRole;
  row: number;
  selectedColumn: boolean;
  selection: FillSelection | null;
  previewTarget: number | null;
  onPointerDown: (event: ReactPointerEvent, role: FillRole, row: number) => void;
  input?: boolean;
  children: ReactNode;
}

function EditableCell({ role, row, selectedColumn, selection, previewTarget, onPointerDown, input, children }: EditableCellProps) {
  const inSelection = selection?.role === role && row >= selection.start && row <= selection.end;
  const handle = selection?.role === role && row === selection.end;
  const preview = selection?.role === role && previewTarget != null && row > selection.end && row <= previewTarget;
  return (
    <td className={`${input ? 'input-col ' : ''}conv-edit-cell ${selectedColumn ? 'column-selected' : ''} ${inSelection ? 'fill-selected' : ''} ${handle ? 'fill-handle-cell' : ''} ${preview ? 'fill-preview' : ''}`}>
      <div className="conv-cell-wrap">{children}{handle ? <span className="conv-fill-handle" title="Drag to fill" onPointerDown={event => onPointerDown(event, role, row)} /> : null}</div>
    </td>
  );
}
