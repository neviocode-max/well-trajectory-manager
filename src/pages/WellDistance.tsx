import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { WellPicker } from '../components/common/WellPicker';
import { Message, type MessageState } from '../components/common/Message';
import { EmptyState } from '../components/common/EmptyState';
import { DataTable, displayHeader } from '../components/tables/DataTable';
import { MultiProfileDistancePlot, PairDistancePlot, RangeDistancePlot } from '../components/plots/DistancePlots';
import { rangeFor, TYPES, type TrajectoryInputType } from '../engine/trajectory';
import { AmbiguousDepthError, RangeErrorWTC } from '../engine/errors';
import { copyRows, exportRows } from '../services/browserFiles';
import { preferences } from '../services/preferences';
import {
  offsetSearch,
  PAIR_COLUMNS,
  pointRadiusSearch,
  pointSelectedProfiles,
  radiusSearch,
  sortPairRows,
  wellPairProfile,
  type DistanceMode,
  type DistanceRow,
  type OffsetSearchResult,
  type PairColumn,
  type PairProfileResult,
  type PointRadiusSearchResult,
  type PointSelectedResult,
  type RadiusSearchResult,
} from '../services/wellDistance';
import { fmt } from '../utils/format';
import type { Point3D } from '../types/well';

const REF_TYPES = Object.keys(TYPES) as TrajectoryInputType[];
type View = 'radius' | 'pair' | 'offset' | 'point';
type PointView = 'radius' | 'selected';

export interface ClosestApproachHandoff {
  referenceWell: string;
  offsetWell: string;
  a: { MD: number; X: number; Y: number; Z: number };
  b: { MD: number; X: number; Y: number; Z: number };
  distance: number;
}

function errorText(error: unknown): string {
  if (error instanceof AmbiguousDepthError) return error.message;
  if (error instanceof RangeErrorWTC) {
    return `Outside range: ${fmt(Math.min(error.min, error.max), 2)}–${fmt(Math.max(error.min, error.max), 2)} ${error.unit}.`;
  }
  return error instanceof Error ? error.message : String(error);
}

function ModeSelector({ name, value, onChange }: { name: string; value: DistanceMode; onChange: (mode: DistanceMode) => void }) {
  return <div className="field"><label>Distance Mode</label><div className="tool-mode">
    <label><input type="radio" name={name} value="2d" checked={value === '2d'} onChange={() => onChange('2d')} /> 2D</label>
    <label><input type="radio" name={name} value="3d" checked={value === '3d'} onChange={() => onChange('3d')} /> 3D</label>
  </div></div>;
}

function ResultActions({
  rows,
  copyKeys,
  exportParts,
  onMessage,
}: {
  rows: DistanceRow[];
  copyKeys?: string[];
  exportParts: string[];
  onMessage: (message: MessageState) => void;
}) {
  return <div className="result-actions">
    <button className="btn-sm" type="button" disabled={!rows.length} onClick={async () => {
      const ok = await copyRows(rows, copyKeys);
      onMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Results copied.' : 'Copy failed.' });
    }}>📋 Copy Results</button>
    <button className="btn-sm primary" type="button" disabled={!rows.length} onClick={() => {
      exportRows(rows, exportParts, copyKeys);
      onMessage({ kind: 'ok', text: 'CSV exported.' });
    }}>⭳ Export CSV</button>
  </div>;
}

function SortablePairTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: DistanceRow[];
  sortKey: PairColumn;
  sortDir: 'asc' | 'desc';
  onSort: (key: PairColumn) => void;
}) {
  const sorted = useMemo(() => sortPairRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  if (!sorted.length) return <EmptyState>No valid comparison points were found.</EmptyState>;
  const limit = 500;
  return <>
    <div className="table-wrap">
      <table>
        <thead><tr>{PAIR_COLUMNS.map(key => {
          const active = sortKey === key;
          const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '↕';
          return <th className={`sortable ${active ? 'active' : ''}`} key={key}><button type="button" onClick={() => onSort(key)}>{displayHeader(key)}<span className="sort-arrow">{arrow}</span></button></th>;
        })}</tr></thead>
        <tbody>{sorted.slice(0, limit).map((row, index) => <tr key={index}>{PAIR_COLUMNS.map(key => <td key={key} className={typeof row[key] === 'number' ? 'num' : undefined}>{row[key] === '' ? '' : typeof row[key] === 'number' ? fmt(row[key]) : String(row[key] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {sorted.length > limit ? <p className="hint table-note">Showing the first {fmt(limit, 0)} of {fmt(sorted.length, 0)} rows. Copy or export includes all rows in the current sort order.</p> : null}
  </>;
}

function PointInput({ x, y, z, setX, setY, setZ, onEnter }: {
  x: string; y: string; z: string;
  setX: (value: string) => void; setY: (value: string) => void; setZ: (value: string) => void;
  onEnter: () => void;
}) {
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') onEnter(); };
  return <div className="grid">
    <div className="field"><label htmlFor="distance-point-x">X / Easting (m)</label><input id="distance-point-x" type="number" inputMode="decimal" step="any" placeholder="e.g. 790850" value={x} onChange={event => setX(event.target.value)} onKeyDown={keyDown} /></div>
    <div className="field"><label htmlFor="distance-point-y">Y / Northing (m)</label><input id="distance-point-y" type="number" inputMode="decimal" step="any" placeholder="e.g. 9206100" value={y} onChange={event => setY(event.target.value)} onKeyDown={keyDown} /></div>
    <div className="field"><label htmlFor="distance-point-z">Elevation / Z (mASL)</label><input id="distance-point-z" type="number" inputMode="decimal" step="any" placeholder="e.g. 900" value={z} onChange={event => setZ(event.target.value)} onKeyDown={keyDown} /></div>
  </div>;
}

export function WellDistance({ onShowClosestApproach }: { onShowClosestApproach?: (handoff: ClosestApproachHandoff) => void }) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const initialized = useRef(false);
  const [view, setView] = useState<View>('radius');

  const [radiusWell, setRadiusWell] = useState('');
  const [radiusType, setRadiusType] = useState<TrajectoryInputType>('mMD');
  const [radiusValue, setRadiusValue] = useState('');
  const [radiusLimit, setRadiusLimit] = useState('500');
  const [radiusMode, setRadiusMode] = useState<DistanceMode>('2d');
  const [radiusResult, setRadiusResult] = useState<RadiusSearchResult | null>(null);
  const [radiusMessage, setRadiusMessage] = useState<MessageState | null>(null);

  const [pairRef, setPairRef] = useState('');
  const [pairOff, setPairOff] = useState('');
  const [pairMode, setPairMode] = useState<DistanceMode>('2d');
  const [pairResult, setPairResult] = useState<PairProfileResult | null>(null);
  const [pairMessage, setPairMessage] = useState<MessageState | null>(null);
  const [pairSortKey, setPairSortKey] = useState<PairColumn>('Reference ftMD');
  const [pairSortDir, setPairSortDir] = useState<'asc' | 'desc'>('asc');

  const [offsetRef, setOffsetRef] = useState('');
  const [offsetRadius, setOffsetRadius] = useState('500');
  const [offsetResult, setOffsetResult] = useState<OffsetSearchResult | null>(null);
  const [offsetMessage, setOffsetMessage] = useState<MessageState | null>(null);

  const [pointView, setPointView] = useState<PointView>('radius');
  const [pointX, setPointX] = useState('');
  const [pointY, setPointY] = useState('');
  const [pointZ, setPointZ] = useState('');
  const [pointRadius, setPointRadius] = useState('500');
  const [pointMode, setPointMode] = useState<DistanceMode>('2d');
  const [pointRadiusResult, setPointRadiusResult] = useState<PointRadiusSearchResult | null>(null);
  const [pointRadiusMessage, setPointRadiusMessage] = useState<MessageState | null>(null);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [wellSearch, setWellSearch] = useState('');
  const [pointSelectedResult, setPointSelectedResult] = useState<PointSelectedResult | null>(null);
  const [pointSelectedMessage, setPointSelectedMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    if (!snapshot.names.length) {
      initialized.current = true;
      setRadiusWell(''); setPairRef(''); setPairOff(''); setOffsetRef(''); setSelectedNames(new Set());
      setRadiusResult(null); setPairResult(null); setOffsetResult(null); setPointRadiusResult(null); setPointSelectedResult(null);
      return;
    }
    const recent = preferences.getRecent().find(name => database.get(name));
    const first = recent || snapshot.names[0];
    const second = snapshot.names.find(name => name !== first) || '';
    setRadiusWell(current => current && database.get(current) ? current : first);
    setPairRef(current => current && database.get(current) ? current : first);
    setPairOff(current => current && database.get(current) && current !== first ? current : second);
    setOffsetRef(current => current && database.get(current) ? current : first);
    setSelectedNames(current => new Set([...current].filter(name => database.get(name))));
    initialized.current = true;
  }, [database, snapshot.names, snapshot.revision]);

  const radiusRange = useMemo(() => {
    const record = database.get(radiusWell);
    if (!record) return '';
    const range = rangeFor(record, radiusType);
    return `Range for ${record.name}: ${fmt(Math.min(range.min, range.max), 2)} – ${fmt(Math.max(range.min, range.max), 2)} ${range.label}.`;
  }, [database, radiusWell, radiusType, snapshot.revision]);

  const parsePoint = (): Point3D => {
    const point = { X: Number(pointX), Y: Number(pointY), Z: Number(pointZ) };
    if (![point.X, point.Y, point.Z].every(Number.isFinite) || [pointX, pointY, pointZ].some(value => value.trim() === '')) throw new Error('Enter valid X, Y and Elevation / Z values.');
    return point;
  };

  const runRadius = () => {
    const started = performance.now();
    try {
      const result = radiusSearch(database, {
        referenceWell: radiusWell,
        referenceType: radiusType,
        referenceValue: Number(radiusValue),
        radius: Number(radiusLimit),
        mode: radiusMode,
      });
      setRadiusResult(result);
      const nearest = result.rows[0];
      setRadiusMessage({
        kind: result.rows.length ? 'ok' : 'info',
        text: result.rows.length
          ? `Nearest well: ${nearest.Well} at ${fmt(nearest['Distance (meter)'], 3)} m. Search completed in ${(performance.now() - started).toFixed(0)} ms.`
          : `Search completed in ${(performance.now() - started).toFixed(0)} ms.${radiusMode === '2d' && result.noElevation ? ` ${fmt(result.noElevation, 0)} well(s) did not intersect the reference elevation.` : ''}`,
      });
      preferences.pushRecent(result.referenceWell.name);
    } catch (error) {
      setRadiusResult(null);
      setRadiusMessage({ kind: 'bad', text: errorText(error) });
    }
  };

  const runPair = () => {
    const started = performance.now();
    try {
      const result = wellPairProfile(database, { referenceWell: pairRef, offsetWell: pairOff, mode: pairMode });
      setPairResult(result);
      setPairSortKey('Reference ftMD'); setPairSortDir('asc');
      if (!result.nearest) {
        setPairMessage({ kind: pairMode === '2d' ? 'warn' : 'bad', text: pairMode === '2d' ? 'The profile was generated, but these wells do not share an elevation range. 2D distance cells are blank; use 3D for spatial separation.' : 'Unable to calculate the selected well pair.' });
      } else {
        setPairMessage({ kind: 'ok', text: `Distance profile generated in ${(performance.now() - started).toFixed(0)} ms. Minimum ${pairMode.toUpperCase()} separation in the profile: ${fmt(result.nearest.distance, 3)} m.` });
      }
      preferences.pushRecent(result.ref.name); preferences.pushRecent(result.off.name);
    } catch (error) {
      setPairResult(null); setPairMessage({ kind: 'bad', text: errorText(error) });
    }
  };

  const runOffset = () => {
    const started = performance.now();
    try {
      const result = offsetSearch(database, offsetRef, Number(offsetRadius));
      setOffsetResult(result);
      setOffsetMessage({ kind: result.rows.length ? 'ok' : 'info', text: `Offset search completed in ${(performance.now() - started).toFixed(0)} ms.` });
      preferences.pushRecent(result.ref.name);
    } catch (error) {
      setOffsetResult(null); setOffsetMessage({ kind: 'bad', text: errorText(error) });
    }
  };

  const runPointRadius = () => {
    const started = performance.now();
    try {
      const result = pointRadiusSearch(database, { point: parsePoint(), radius: Number(pointRadius), mode: pointMode });
      setPointRadiusResult(result);
      setPointRadiusMessage({ kind: result.rows.length ? 'ok' : 'info', text: `Point radius search completed in ${(performance.now() - started).toFixed(0)} ms.` });
    } catch (error) {
      setPointRadiusResult(null); setPointRadiusMessage({ kind: 'bad', text: errorText(error) });
    }
  };

  const runPointSelected = () => {
    const started = performance.now();
    try {
      const result = pointSelectedProfiles(database, parsePoint(), [...selectedNames]);
      setPointSelectedResult(result);
      setPointSelectedMessage({ kind: 'ok', text: `Selected-well profiles generated in ${(performance.now() - started).toFixed(0)} ms.` });
      result.wellNames.forEach(name => preferences.pushRecent(name));
    } catch (error) {
      setPointSelectedResult(null); setPointSelectedMessage({ kind: 'bad', text: errorText(error) });
    }
  };

  const visibleWells = snapshot.names.filter(name => !wellSearch.trim() || name.toLowerCase().includes(wellSearch.trim().toLowerCase()));
  const sortedPairRows = pairResult ? sortPairRows(pairResult.rows, pairSortKey, pairSortDir) : [];

  if (!snapshot.names.length) return <div className="content"><section className="card"><h3>Well Distance</h3><p className="hint">Radius search, well-to-well profiles, offset corridors and XYZ point analysis.</p><EmptyState>The database is empty. Load a trajectory database before running distance analysis.</EmptyState></section></div>;

  return <div className="content">
    <section className="card">
      <h3>Well Distance</h3>
      <p className="hint">Use <b>Radius Search</b> around one trajectory point, <b>Well-to-Well</b> for a full pair profile, <b>Offset Search</b> to scan the full reference trajectory for nearby wells, or <b>Point Search</b> to search outward from a specific XYZ coordinate.</p>
      <div className="distance-tabs" role="tablist" aria-label="Well distance mode">
        {([['radius', '◎ Radius Search'], ['pair', '↔ Well-to-Well'], ['offset', '⌁ Offset Search'], ['point', '⌖ Point Search']] as Array<[View, string]>).map(([id, label]) => <button key={id} className={`distance-tab ${view === id ? 'active' : ''}`} type="button" onClick={() => setView(id)}>{label}</button>)}
      </div>

      {view === 'radius' ? <div className="distance-panel">
        <p className="hint">In <b>2D</b>, each offset well is compared once at the exact same elevation as the selected reference point. In <b>3D</b>, WTM finds the closest spatial point and the offset-well MD interval(s) inside the selected radius.</p>
        <div className="grid distance-grid">
          <WellPicker id="distance-radius-well" label="Reference Well" value={radiusWell} onChange={setRadiusWell} onEnter={runRadius} />
          <div className="field"><label htmlFor="distance-type">Reference Type</label><select id="distance-type" value={radiusType} onChange={event => setRadiusType(event.target.value as TrajectoryInputType)}>{REF_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="field"><label htmlFor="distance-value">Reference Value</label><input id="distance-value" type="number" inputMode="decimal" step="any" value={radiusValue} onChange={event => setRadiusValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runRadius(); }} /></div>
          <div className="field"><label htmlFor="distance-radius">Max Radius (m)</label><input id="distance-radius" type="number" inputMode="decimal" step="any" min="0.01" value={radiusLimit} onChange={event => setRadiusLimit(event.target.value)} /></div>
          <ModeSelector name="distance-mode" value={radiusMode} onChange={setRadiusMode} />
          <div className="field"><button className="primary" type="button" onClick={runRadius}>◎ Find Wells</button></div>
        </div>
        <p className="hint distance-range">{radiusRange}</p>
        <Message message={radiusMessage} />
      </div> : null}

      {view === 'pair' ? <div className="distance-panel">
        <p className="hint">Generate a full distance profile between two wells. WTM samples the <b>reference well every 1 ftMD</b>. <b>2D</b> measures horizontal separation to the offset well at the same elevation; <b>3D</b> measures the shortest true spatial distance from each reference point to the offset trajectory.</p>
        <div className="grid distance-grid">
          <WellPicker id="distance-pair-ref" label="Reference Well" value={pairRef} onChange={setPairRef} onEnter={runPair} />
          <WellPicker id="distance-pair-off" label="Offset Well" value={pairOff} onChange={setPairOff} onEnter={runPair} />
          <ModeSelector name="distance-pair-mode" value={pairMode} onChange={setPairMode} />
          <div className="field"><button className="primary" type="button" onClick={runPair}>↔ Generate Profile</button></div>
        </div>
        <Message message={pairMessage} />
      </div> : null}

      {view === 'offset' ? <div className="distance-panel">
        <p className="hint">Scan the <b>entire 3D trajectory</b> of the reference well. Any offset well that enters the selected radius is returned with the MD interval(s) of the <b>offset well</b> that lie inside that trajectory corridor.</p>
        <div className="grid distance-grid">
          <WellPicker id="distance-offset-ref" label="Reference Well" value={offsetRef} onChange={setOffsetRef} onEnter={runOffset} />
          <div className="field"><label htmlFor="distance-offset-radius">Max Radius (m)</label><input id="distance-offset-radius" type="number" inputMode="decimal" step="any" min="0.01" value={offsetRadius} onChange={event => setOffsetRadius(event.target.value)} /></div>
          <div className="field"><button className="primary" type="button" onClick={runOffset}>⌁ Search Offsets</button></div>
        </div>
        <Message message={offsetMessage} />
      </div> : null}

      {view === 'point' ? <div className="distance-panel">
        <p className="hint">Use a fixed XYZ point as the reference. X and Y must use the <b>same coordinate system / CRS as the loaded well database</b>; Z is elevation / mASL. <b>Radius Search</b> finds every well inside a point-centered radius. <b>Selected Wells</b> calculates a full 3D distance profile along one or more selected trajectories at 1 ftMD spacing.</p>
        <PointInput x={pointX} y={pointY} z={pointZ} setX={setPointX} setY={setPointY} setZ={setPointZ} onEnter={pointView === 'radius' ? runPointRadius : runPointSelected} />
        {snapshot.meta.crs ? <p className="hint crs-hint">Database CRS: <b>{snapshot.meta.crs}</b>. Point X/Y must use this same CRS.</p> : <p className="hint crs-hint warn-text">Database CRS metadata is blank. Confirm that point X/Y use the same coordinate system as the well database.</p>}
        <div className="point-subtabs" role="tablist" aria-label="Point search mode">
          <button className={`point-subtab ${pointView === 'radius' ? 'active' : ''}`} type="button" onClick={() => setPointView('radius')}>◎ Radius Search</button>
          <button className={`point-subtab ${pointView === 'selected' ? 'active' : ''}`} type="button" onClick={() => setPointView('selected')}>≋ Selected Wells</button>
        </div>
        {pointView === 'radius' ? <div>
          <p className="hint">In <b>2D</b>, each well is compared once at the exact point elevation. In <b>3D</b>, WTM searches the whole trajectory and reports the well interval(s) inside the point-centered sphere.</p>
          <div className="grid distance-grid">
            <div className="field"><label htmlFor="distance-point-radius">Max Radius (m)</label><input id="distance-point-radius" type="number" inputMode="decimal" step="any" min="0.01" value={pointRadius} onChange={event => setPointRadius(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runPointRadius(); }} /></div>
            <ModeSelector name="distance-point-mode" value={pointMode} onChange={setPointMode} />
            <div className="field"><button className="primary" type="button" onClick={runPointRadius}>◎ Find Wells</button></div>
          </div>
          <Message message={pointRadiusMessage} />
        </div> : <div>
          <p className="hint">Select one or more wells. WTM samples each complete trajectory every <b>1 ftMD</b> and calculates the true 3D distance from your XYZ point to every sample.</p>
          <div className="point-well-picker">
            <div className="point-well-toolbar">
              <div className="field"><label htmlFor="distance-point-well-search">Filter wells</label><input id="distance-point-well-search" type="search" placeholder="Type to filter wells…" value={wellSearch} onChange={event => setWellSearch(event.target.value)} /></div>
              <button className="btn-sm" type="button" onClick={() => setSelectedNames(current => new Set([...current, ...visibleWells]))}>All visible</button>
              <button className="btn-sm" type="button" onClick={() => setSelectedNames(new Set())}>Clear</button>
              <button className="btn-sm primary" type="button" onClick={runPointSelected}>≋ Generate Profiles</button>
            </div>
            <div className="point-well-list">{visibleWells.length ? visibleWells.map(name => <label className="point-well-option" key={name}><input type="checkbox" checked={selectedNames.has(name)} onChange={event => setSelectedNames(current => { const next = new Set(current); if (event.target.checked) next.add(name); else next.delete(name); return next; })} /> {name}</label>) : <EmptyState>No matching wells.</EmptyState>}</div>
          </div>
          <Message message={pointSelectedMessage} />
        </div>}
      </div> : null}
    </section>

    {view === 'radius' && radiusResult ? <section className="card">
      <div className="result-card-head"><h3>Radius Search Results</h3><ResultActions rows={radiusResult.rows} exportParts={[radiusResult.referenceWell.name, 'Radius_Search']} onMessage={setRadiusMessage} /></div>
      <p className="hint">{radiusResult.rows.length ? <>Reference <b>{radiusResult.referenceWell.name}</b> at {fmt(radiusResult.reference.MD, 2)} mMD / {fmt(radiusResult.reference.Z, 2)} mASL · found <b>{fmt(radiusResult.rows.length, 0)}</b> offset well(s) within {fmt(radiusResult.radius, 1)} m. {radiusResult.mode === '2d' ? '2D uses one same-elevation comparison point per well.' : '3D includes the offset-well MD range(s) inside the radius.'}</> : <>No offset wells were found within {fmt(radiusResult.radius, 1)} m of the selected reference point.</>}</p>
      <div className="distance-plot-section"><div className="distance-plot-head"><b>{radiusResult.mode === '2d' ? 'Distance Plot' : 'Distance / In-Radius Range Plot'}</b><span>X = Distance (m) · Y = Offset ftMD · 0 ft at top</span></div><RangeDistancePlot details={radiusResult.plotDetails} radius={radiusResult.radius} mode={radiusResult.mode} /></div>
      <DataTable rows={radiusResult.rows} empty="No wells are inside the selected radius." />
    </section> : null}

    {view === 'pair' && pairResult ? <section className="card">
      <div className="result-card-head"><h3>Well-to-Well Distance Profile</h3><div className="result-actions">
        <button className="btn-sm" type="button" disabled={!pairResult.closest} title={onShowClosestApproach ? 'Open the closest approach in Trajectory Studio' : 'Trajectory Studio is unavailable'} onClick={() => {
          if (!pairResult.closest || !onShowClosestApproach) return;
          onShowClosestApproach({ referenceWell: pairResult.ref.name, offsetWell: pairResult.off.name, a: pairResult.closest.a, b: pairResult.closest.b, distance: pairResult.closest.distance });
        }}>🎨 Show Closest Approach in Studio</button>
        <ResultActions rows={sortedPairRows} copyKeys={[...PAIR_COLUMNS]} exportParts={[pairResult.ref.name, 'vs', pairResult.off.name, 'Well_to_Well']} onMessage={setPairMessage} />
      </div></div>
      <p className="hint">Reference <b>{pairResult.ref.name}</b> sampled every <b>1 ftMD</b> across its full trajectory · <b>{fmt(pairResult.rows.length, 0)}</b> reference sample(s) against <b>{pairResult.off.name}</b>. Click any table header to sort; click <b>Distance (meter)</b> for closest-first.{pairResult.mode === '2d' && pairResult.unavailable ? ` ${fmt(pairResult.unavailable, 0)} sample(s) have blank distance values because the offset well does not intersect that elevation.` : ''}</p>
      <div className="distance-plot-section"><div className="distance-plot-head"><b>Distance Profile</b><span>X = Distance (m) · Y = Reference ftMD · 0 ft at top</span></div><PairDistancePlot rows={pairResult.rows} title={`${pairResult.ref.name} ↔ ${pairResult.off.name}`} /></div>
      <SortablePairTable rows={pairResult.rows} sortKey={pairSortKey} sortDir={pairSortDir} onSort={key => { if (pairSortKey === key) setPairSortDir(current => current === 'asc' ? 'desc' : 'asc'); else { setPairSortKey(key); setPairSortDir('asc'); } }} />
    </section> : null}

    {view === 'offset' && offsetResult ? <section className="card">
      <div className="result-card-head"><h3>Offset Search Results</h3><ResultActions rows={offsetResult.rows} exportParts={[offsetResult.ref.name, 'Offset_Search']} onMessage={setOffsetMessage} /></div>
      <p className="hint">{offsetResult.rows.length ? <>Reference <b>{offsetResult.ref.name}</b> · <b>{fmt(offsetResult.rows.length, 0)}</b> well(s) enter the {fmt(offsetResult.radius, 1)} m 3D corridor. Plot curves show the <b>actual 3D distance</b> to the reference trajectory along each offset-well interval; Radius mMD/ftMD refers to the <b>offset well</b> trajectory interval.</> : <>No wells enter the {fmt(offsetResult.radius, 1)} m 3D corridor around <b>{offsetResult.ref.name}</b>.</>}</p>
      <div className="distance-plot-section"><div className="distance-plot-head"><b>Offset Distance Profile</b><span>X = Actual Distance (m) · Y = Offset ftMD · 0 ft at top</span></div><MultiProfileDistancePlot offsetDetails={offsetResult.plotDetails} radius={offsetResult.radius} yLabel="Offset ftMD" /></div>
      <DataTable rows={offsetResult.rows} empty="No offset wells enter the selected trajectory corridor." />
    </section> : null}

    {view === 'point' && pointView === 'radius' && pointRadiusResult && pointRadiusResult.rows.length ? <section className="card">
      <div className="result-card-head"><h3>Point Radius Search Results</h3><ResultActions rows={pointRadiusResult.rows} exportParts={['XYZ_Point', 'Radius_Search']} onMessage={setPointRadiusMessage} /></div>
      <p className="hint">Point <span className="mono">X {fmt(pointRadiusResult.point.X, 3)} · Y {fmt(pointRadiusResult.point.Y, 3)} · Z {fmt(pointRadiusResult.point.Z, 3)} mASL</span> · <b>{pointRadiusResult.mode.toUpperCase()}</b> · {fmt(pointRadiusResult.rows.length, 0)} well(s) inside {fmt(pointRadiusResult.radius, 1)} m.</p>
      <div className="distance-plot-section"><div className="distance-plot-head"><b>{pointRadiusResult.mode === '2d' ? 'Point Radius Distance Plot' : 'Point Radius Distance / Range Plot'}</b><span>X = Distance (m) · Y = Well ftMD · 0 ft at top</span></div><RangeDistancePlot details={pointRadiusResult.plotDetails} radius={pointRadiusResult.radius} mode={pointRadiusResult.mode} /></div>
      <DataTable rows={pointRadiusResult.rows} empty="No wells were found inside the selected point radius." />
    </section> : null}

    {view === 'point' && pointView === 'selected' && pointSelectedResult ? <section className="card">
      <div className="result-card-head"><h3>Point → Selected Wells Profiles</h3><ResultActions rows={pointSelectedResult.rows} exportParts={['XYZ_Point', 'Selected_Wells_Profile']} onMessage={setPointSelectedMessage} /></div>
      <p className="hint">Point <span className="mono">X {fmt(pointSelectedResult.point.X, 3)} · Y {fmt(pointSelectedResult.point.Y, 3)} · Z {fmt(pointSelectedResult.point.Z, 3)} mASL</span> · <b>{fmt(pointSelectedResult.wellNames.length, 0)}</b> selected well(s) · <b>{fmt(pointSelectedResult.rows.length, 0)}</b> total 1-ftMD sample(s).</p>
      <div className="distance-plot-section"><div className="distance-plot-head"><b>Distance Profiles</b><span>X = True 3D Distance (m) · Y = Well ftMD · 0 ft at top</span></div><MultiProfileDistancePlot selectedDetails={pointSelectedResult.details} yLabel="Well ftMD" /></div>
      <DataTable rows={pointSelectedResult.rows} limit={500} empty="No profile rows were generated." />
      {pointSelectedResult.rows.length > 500 ? <p className="hint table-note">Showing the first 500 of {fmt(pointSelectedResult.rows.length, 0)} rows. Copy or export includes all rows.</p> : null}
    </section> : null}
  </div>;
}
