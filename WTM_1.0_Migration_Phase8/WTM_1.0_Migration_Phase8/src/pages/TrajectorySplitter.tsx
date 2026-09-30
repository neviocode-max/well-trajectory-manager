import { useEffect, useRef, useState } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { rangeFor, TYPES, type TrajectoryInputType } from '../engine/trajectory';
import { RangeErrorWTC } from '../engine/errors';
import { copyRows, exportRows } from '../services/browserFiles';
import { preferences } from '../services/preferences';
import { SplitAmbiguousError, splitTrajectory, type SplitRow } from '../services/trajectoryTools';
import { DataTable } from '../components/tables/DataTable';
import { EmptyState } from '../components/common/EmptyState';
import { Message, type MessageState } from '../components/common/Message';
import { WellPicker } from '../components/common/WellPicker';
import { fmt, raw } from '../utils/format';

const TYPES_LIST = Object.keys(TYPES) as TrajectoryInputType[];
const SPLIT_KEYS = ['Well', 'Type', 'mMD', 'ftMD', 'mTVD', 'ftTVD', 'mASL', 'ftASL', 'X', 'Y', 'Azimuth', 'Inclination'];

export function TrajectorySplitter() {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const [well, setWell] = useState('');
  const [type, setType] = useState<TrajectoryInputType>('mMD');
  const [step, setStep] = useState('10');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeSurvey, setIncludeSurvey] = useState(true);
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [resultHint, setResultHint] = useState('');
  const [message, setMessage] = useState<MessageState | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!snapshot.names.length) {
      initialized.current = true;
      setWell(''); setFrom(''); setTo(''); setRows([]); setMessage(null); return;
    }
    setWell(current => {
      if (!initialized.current) {
        initialized.current = true;
        const recent = preferences.getRecent().find(name => database.get(name));
        return recent || snapshot.names[0];
      }
      return current && database.get(current) ? current : '';
    });
  }, [database, snapshot.names, snapshot.revision]);

  useEffect(() => {
    const record = database.get(well);
    if (!record) return;
    const range = rangeFor(record, type);
    const lo = Math.min(range.min, range.max);
    const hi = Math.max(range.min, range.max);
    setFrom(raw(lo, 2));
    setTo(raw(hi, 2));
    setRows([]);
    setResultHint('');
    setMessage({
      kind: 'info',
      text: `Range for ${record.name}: ${fmt(lo, 2)} – ${fmt(hi, 2)} ${TYPES[type].label} across ${fmt(record.count, 0)} stations.${TYPES[type].key !== 'MD' ? ` Stations are generated at regular ${TYPES[type].label} values and resolved to MD via minimum curvature.` : ''}`,
    });
  }, [database, well, type, snapshot.revision]);

  const run = () => {
    const record = database.get(well);
    if (!record) { setMessage({ kind: 'bad', text: 'Select a well first.' }); return; }
    const interval = Number(step);
    const start = from.trim() === '' ? null : Number(from);
    const end = to.trim() === '' ? null : Number(to);
    const started = performance.now();
    try {
      const result = splitTrajectory(record, { type, step: interval, from: start, to: end, includeSurvey });
      const elapsed = performance.now() - started;
      setRows(result.rows);
      setResultHint(`${record.name} · ${fmt(result.rows.length, 0)} stations at ${fmt(interval, 2)} ${TYPES[type].label} intervals · generated in ${elapsed.toFixed(0)} ms.`);
      setMessage({
        kind: result.unresolved ? 'warn' : 'ok',
        text: `Trajectory split into ${fmt(result.rows.length, 0)} stations.${result.unresolved ? ` ${fmt(result.unresolved, 0)} requested ${TYPES[type].label} value(s) could not be resolved (the well does not reach them monotonically) and were skipped.` : ''}`,
      });
      preferences.pushRecent(record.name);
    } catch (error) {
      setRows([]);
      setResultHint('');
      if (error instanceof SplitAmbiguousError) {
        setMessage({ kind: 'bad', text: `${error.count} requested ${error.typeLabel} value(s) map to multiple MD positions. Example: ${fmt(error.value, 3)} ${error.typeLabel} → ${error.solutions.map(md => `${fmt(md, 3)} mMD`).join(', ')}. Use mMD/ftMD splitting or choose a monotonic trajectory branch explicitly.` });
      } else if (error instanceof RangeErrorWTC) {
        setMessage({ kind: 'bad', text: `Outside range: ${fmt(Math.min(error.min, error.max), 2)}–${fmt(Math.max(error.min, error.max), 2)} ${error.unit}.` });
      } else setMessage({ kind: 'bad', text: error instanceof Error ? error.message : String(error) });
    }
  };

  if (!snapshot.names.length) return (
    <div className="content"><section className="card"><h3>Split Settings</h3><p className="hint">Resample a well trajectory into regular measured-depth, TVD, or elevation intervals.</p><EmptyState>The database is empty. Load a trajectory database before splitting a well.</EmptyState></section></div>
  );

  return (
    <div className="content">
      <section className="card">
        <h3>Split Settings</h3>
        <p className="hint">Resample a well trajectory into regular measured-depth intervals. Every generated station is computed with minimum curvature interpolation between the surrounding survey points.</p>
        <div className="grid split-grid">
          <WellPicker id="split-well" label="Well" value={well} onChange={setWell} onEnter={run} placeholder="Search wells" />
          <div className="field"><label htmlFor="split-type">Reference Type</label><select id="split-type" value={type} onChange={event => setType(event.target.value as TrajectoryInputType)}>{TYPES_LIST.map(item => <option value={item} key={item}>{item}</option>)}</select></div>
          <div className="field"><label htmlFor="split-step">Interval ({TYPES[type].label})</label><input id="split-step" type="number" inputMode="decimal" step="any" min="0.01" value={step} onChange={event => setStep(event.target.value)} /></div>
          <div className="field"><label htmlFor="split-from">From ({TYPES[type].label})</label><input id="split-from" type="number" inputMode="decimal" step="any" value={from} placeholder="start" onChange={event => setFrom(event.target.value)} /></div>
          <div className="field"><label htmlFor="split-to">To ({TYPES[type].label})</label><input id="split-to" type="number" inputMode="decimal" step="any" value={to} placeholder="end" onChange={event => setTo(event.target.value)} /></div>
          <div className="field"><button className="primary" type="button" onClick={run}>▶ Split</button></div>
        </div>
        <div className="row split-actions">
          <label className="checkbox-label"><input type="checkbox" checked={includeSurvey} onChange={event => setIncludeSurvey(event.target.checked)} /> Include original survey stations</label>
          <span className="right" />
          <button className="btn-sm" type="button" disabled={!rows.length} onClick={async () => {
            const ok = await copyRows(rows as Array<Record<string, unknown>>, SPLIT_KEYS);
            setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Split trajectory copied.' : 'Copy failed.' });
          }}>📋 Copy table</button>
          <button className="btn-sm primary" type="button" disabled={!rows.length} onClick={() => { exportRows(rows as Array<Record<string, unknown>>, [well || 'Well', 'Trajectory_Split'], SPLIT_KEYS); setMessage({ kind: 'ok', text: 'Split trajectory CSV exported.' }); }}>⭳ Export CSV</button>
        </div>
        <Message message={message} />
      </section>

      {rows.length ? <section className="card"><h3>Split Trajectory</h3><p className="hint">{resultHint}</p><DataTable rows={rows as Array<Record<string, unknown>>} keys={SPLIT_KEYS} limit={50_000} maxHeight={560} /></section> : null}
    </div>
  );
}
