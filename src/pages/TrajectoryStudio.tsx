import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { createStudioChart, type StudioChartApi, type StudioChartHit } from '../components/plots/studioCanvas';
import { createScene3D, type Scene3DApi, type Scene3DHit } from '../components/plots/studioScene3D';
import { Message, type MessageState } from '../components/common/Message';
import { copyText, exportRows } from '../services/browserFiles';
import { preferences } from '../services/preferences';
import {
  absoluteX,
  absoluteY,
  colorForWell,
  dlsFactor,
  dlsSeries,
  dlsUnitLabel,
  measureStations,
  stationDistance,
} from '../services/studio';
import type { ClosestApproachHandoff } from './WellDistance';
import type { WellRecord } from '../types/well';
import type {
  DiagnosticMode,
  DlsUnit,
  SectionAxis,
  StudioApproach,
  StudioSeries,
  StudioViewId,
  StudioMark2D,
  StudioFocusRequest,
  ConverterFocusRequest,
} from '../types/studio';
import { FT } from '../engine/constants';
import { fmt, raw, safeName } from '../utils/format';

interface InspectorSelection { well: string; index: number }
interface MeasureSelection extends InspectorSelection { key: string }
interface TooltipState { text: string; x: number; y: number }

const VIEWS: Array<{ id: StudioViewId; label: string }> = [
  { id: '3d', label: '3D View' },
  { id: 'plan', label: 'Plan View' },
  { id: 'section', label: 'Section View' },
  { id: 'diagnostic', label: 'Diagnostic' },
];

function selectedKey(selected: Set<string>): string {
  return [...selected].sort().join('\u0001');
}

function checkboxLabel(label: string, checked: boolean, onChange: (value: boolean) => void) {
  return <label className="studio-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /> {label}</label>;
}

export function TrajectoryStudio({
  handoff,
  focusRequest,
  themeKey,
  onHandoffConsumed,
  onFocusConsumed,
  onShowInConverter,
}: {
  handoff?: ClosestApproachHandoff | null;
  focusRequest?: StudioFocusRequest | null;
  themeKey?: string;
  onHandoffConsumed?: () => void;
  onFocusConsumed?: () => void;
  onShowInConverter?: (request: ConverterFocusRequest) => void;
}) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const [current, setCurrent] = useState<StudioViewId>('3d');
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('x');
  const [diagnosticMode, setDiagnosticMode] = useState<DiagnosticMode>('inc');
  const [dlsUnit, setDlsUnit] = useState<DlsUnit>('30m');
  const [dlsLimit30m, setDlsLimit30m] = useState(3);
  const [sectionEqualScale, setSectionEqualScale] = useState(true);
  const [zExag, setZExag] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [primary, setPrimary] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showStations, setShowStations] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showStationLabels, setShowStationLabels] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<'wells' | 'inspector' | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measure, setMeasure] = useState<MeasureSelection[]>([]);
  const [inspectStation, setInspectStation] = useState<InspectorSelection | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [prefsRevision, setPrefsRevision] = useState(0);

  const cv3dRef = useRef<HTMLCanvasElement>(null);
  const cvPlanRef = useRef<HTMLCanvasElement>(null);
  const cvSectionRef = useRef<HTMLCanvasElement>(null);
  const cvDiagnosticRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3DApi | null>(null);
  const chartsRef = useRef<Partial<Record<Exclude<StudioViewId, '3d'>, StudioChartApi>>>({});
  const initializedRef = useRef(false);
  const selectedRef = useRef(selected);
  const currentRef = useRef(current);
  const diagnosticModeRef = useRef(diagnosticMode);
  const dlsUnitRef = useRef(dlsUnit);
  const measureModeRef = useRef(measureMode);
  const approachRef = useRef<StudioApproach | null>(null);
  const keepViewOnSelectionRef = useRef(false);

  selectedRef.current = selected;
  currentRef.current = current;
  diagnosticModeRef.current = diagnosticMode;
  dlsUnitRef.current = dlsUnit;
  measureModeRef.current = measureMode;

  const selectedRecords = useMemo(() => [...selected]
    .map(name => database.get(name))
    .filter((record): record is WellRecord => Boolean(record))
    .sort((a, b) => a.name === primary ? -1 : b.name === primary ? 1 : 0),
  [database, selected, primary, snapshot.revision]);

  const recordsKey = useMemo(() => selectedKey(selected), [selected]);

  function clearApproach() {
    approachRef.current = null;
    sceneRef.current?.setApproach(null);
  }

  function applySelection(names: string[], primaryName?: string | null) {
    keepViewOnSelectionRef.current = false;
    const canonical = names.map(name => database.get(name)?.name).filter((name): name is string => Boolean(name));
    const next = new Set(canonical);
    setSelected(next);
    setPrimary(primaryName && next.has(primaryName) ? primaryName : canonical[0] || null);
    setInspectStation(null);
    setMeasure([]);
    clearApproach();
  }

  function toggleWell(name: string, exclusive: boolean) {
    const record = database.get(name);
    if (!record) return;
    preferences.pushRecent(record.name);
    if (exclusive) {
      applySelection([record.name], record.name);
      return;
    }
    const next = new Set(selectedRef.current);
    keepViewOnSelectionRef.current = true;
    if (next.has(record.name)) {
      next.delete(record.name);
      setPrimary(currentPrimary => next.has(currentPrimary || '') ? currentPrimary : [...next][0] || null);
    } else {
      next.add(record.name);
      setPrimary(record.name);
    }
    setSelected(next);
  }

  const favoriteSet = useMemo(() => new Set(preferences.getFavorites()), [prefsRevision]);
  const filteredNames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const names = snapshot.names.filter(name => !query || name.toLowerCase().includes(query));
    const favorites = names.filter(name => favoriteSet.has(name));
    return favorites.concat(names.filter(name => !favoriteSet.has(name)));
  }, [snapshot.names, search, favoriteSet]);

  function toggleFavorite(name: string) {
    const currentFavorites = preferences.getFavorites();
    preferences.setFavorites(currentFavorites.includes(name) ? currentFavorites.filter(item => item !== name) : [...currentFavorites, name]);
    setPrefsRevision(value => value + 1);
  }

  function seriesFor(view: Exclude<StudioViewId, '3d'>): StudioSeries[] {
    return selectedRecords.map(record => {
      const buffer = database.buffers(record);
      let x: Float64Array;
      let y: Float64Array;
      if (view === 'plan') {
        x = absoluteX(buffer, snapshot.origin.x);
        y = absoluteY(buffer, snapshot.origin.y);
      } else if (view === 'section') {
        x = sectionAxis === 'x' ? absoluteX(buffer, snapshot.origin.x) : absoluteY(buffer, snapshot.origin.y);
        y = buffer.z;
      } else {
        x = diagnosticMode === 'inc' ? buffer.inc : diagnosticMode === 'azi' ? buffer.azi : dlsSeries(buffer, dlsUnit);
        y = buffer.md;
      }
      return {
        key: record.name,
        label: record.name,
        color: colorForWell(record.name),
        x, y, n: buffer.n, rec: record, buf: buffer,
        primary: record.name === primary,
        width: record.name === primary ? 2.4 : 1.7,
      };
    });
  }

  function tooltipText(view: StudioViewId, record: WellRecord, index: number): string {
    const b = database.buffers(record);
    const lines = [
      record.name,
      `MD    ${fmt(b.md[index], 2)} m`,
      `TVD   ${fmt(b.tvd[index], 2)} m`,
      `ASL   ${fmt(b.z[index], 2)} m`,
      `Inc   ${fmt(b.inc[index], 2)}°`,
      `Azi   ${fmt(b.azi[index], 2)}°`,
    ];
    if (view === 'diagnostic' && diagnosticModeRef.current === 'dls') {
      lines.push(`DLS   ${fmt(dlsSeries(b, dlsUnitRef.current)[index], 2)} ${dlsUnitLabel(dlsUnitRef.current)}`);
    }
    return lines.join('\n');
  }

  function showTooltip(view: StudioViewId, record: WellRecord | null, index: number | null, px?: number, py?: number) {
    if (!record || index == null || px == null || py == null) { setTooltip(null); return; }
    const wrap = wrapRef.current;
    const width = wrap?.clientWidth || 0;
    const height = wrap?.clientHeight || 0;
    setTooltip({ text: tooltipText(view, record, index), x: Math.min(px + 14, Math.max(8, width - 180)), y: Math.max(6, Math.min(py + 14, Math.max(6, height - 110))) });
  }

  function pickStation(view: StudioViewId, record: WellRecord, index: number) {
    if (measureModeRef.current && view !== 'diagnostic') {
      const key = `${record.name}|${index}`;
      setMeasure(currentMeasure => {
        if (currentMeasure.some(item => item.key === key)) return currentMeasure;
        const base = currentMeasure.length >= 2 ? [] : currentMeasure;
        return [...base, { well: record.name, index, key }];
      });
    } else {
      setInspectStation({ well: record.name, index });
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 980px)').matches) setMobilePane('inspector');
    }
  }

  useEffect(() => {
    const cv3d = cv3dRef.current;
    const cvPlan = cvPlanRef.current;
    const cvSection = cvSectionRef.current;
    const cvDiagnostic = cvDiagnosticRef.current;
    if (!cv3d || !cvPlan || !cvSection || !cvDiagnostic) return;

    const scene = createScene3D(cv3d);
    const plan = createStudioChart(cvPlan, { id: 'plan', xLabel: 'X — Easting (m)', yLabel: 'Y — Northing (m)', equalAspect: true, markers: true });
    const section = createStudioChart(cvSection, { id: 'section', xLabel: 'X — Easting (m)', yLabel: 'Elevation Z (mASL)', equalAspect: true, markers: true });
    const diagnostic = createStudioChart(cvDiagnostic, { id: 'diagnostic', xLabel: 'Inclination (°)', yLabel: 'MD (m)', yDown: true, includeYZero: true });
    sceneRef.current = scene;
    chartsRef.current = { plan, section, diagnostic };

    scene.on('hover', (hit: Scene3DHit | null, px?: number, py?: number) => showTooltip('3d', hit?.well.rec ?? null, hit?.index ?? null, px, py));
    scene.on('pick', (hit: Scene3DHit) => pickStation('3d', hit.well.rec, hit.index));
    plan.on('hover', (hit: StudioChartHit | null, px?: number, py?: number) => showTooltip('plan', hit?.series.rec ?? null, hit?.index ?? null, px, py));
    plan.on('pick', (hit: StudioChartHit) => pickStation('plan', hit.series.rec, hit.index));
    section.on('hover', (hit: StudioChartHit | null, px?: number, py?: number) => showTooltip('section', hit?.series.rec ?? null, hit?.index ?? null, px, py));
    section.on('pick', (hit: StudioChartHit) => pickStation('section', hit.series.rec, hit.index));
    diagnostic.on('hover', (hit: StudioChartHit | null, px?: number, py?: number) => showTooltip('diagnostic', hit?.series.rec ?? null, hit?.index ?? null, px, py));
    diagnostic.on('pick', (hit: StudioChartHit) => pickStation('diagnostic', hit.series.rec, hit.index));

    const resize = () => {
      scene.resize(); plan.resize(); section.resize(); diagnostic.resize();
    };
    const observer = typeof ResizeObserver !== 'undefined' && wrapRef.current ? new ResizeObserver(resize) : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);

    return () => {
      observer?.disconnect(); window.removeEventListener('resize', resize);
      scene.destroy(); plan.destroy(); section.destroy(); diagnostic.destroy();
      sceneRef.current = null; chartsRef.current = {};
    };
    // Canvas engines are created once. Mutable handlers read current state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (snapshot.names.length) {
        const recent = preferences.getRecent().find(name => database.get(name));
        const first = recent || snapshot.names[0];
        setSelected(new Set([first])); setPrimary(first);
      }
      return;
    }
    const alive = [...selectedRef.current].filter(name => database.get(name));
    if (alive.length !== selectedRef.current.size) {
      setSelected(new Set(alive));
      setPrimary(value => value && alive.includes(value) ? value : alive[0] || null);
      setInspectStation(value => value && database.get(value.well) ? value : null);
      setMeasure(value => value.filter(item => database.get(item.well)));
      clearApproach();
    }
  }, [database, snapshot.revision, snapshot.names]);

  useEffect(() => {
    const scene = sceneRef.current;
    const plan = chartsRef.current.plan;
    const section = chartsRef.current.section;
    const diagnostic = chartsRef.current.diagnostic;
    if (!scene || !plan || !section || !diagnostic) return;
    const keepCurrent = keepViewOnSelectionRef.current;
    scene.setWells(selectedRecords.map(record => ({ key: record.name, label: record.name, color: colorForWell(record.name), rec: record, buf: database.buffers(record), primary: record.name === primary })), keepCurrent && currentRef.current === '3d');
    plan.setSeries(seriesFor('plan'), keepCurrent && currentRef.current === 'plan');
    section.setSeries(seriesFor('section'), keepCurrent && currentRef.current === 'section');
    diagnostic.setSeries(seriesFor('diagnostic'), keepCurrent && currentRef.current === 'diagnostic');
    keepViewOnSelectionRef.current = false;
    if (approachRef.current) scene.setApproach(approachRef.current);
    requestAnimationFrame(() => { scene.resize(); plan.resize(); section.resize(); diagnostic.resize(); });
    // Selection/revision change intentionally re-frames views, matching WTM 4.3 setSelection behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordsKey, primary, snapshot.revision]);

  useEffect(() => {
    const section = chartsRef.current.section;
    if (!section) return;
    section.setAxes(sectionAxis === 'x' ? 'X — Easting (m)' : 'Y — Northing (m)', 'Elevation Z (mASL)');
    section.setOptions({ equalAspect: sectionEqualScale, yDown: false, includeYZero: false });
    section.setSeries(seriesFor('section'), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionAxis, sectionEqualScale]);

  useEffect(() => {
    const chart = chartsRef.current.diagnostic;
    if (!chart) return;
    const xLabel = diagnosticMode === 'inc' ? 'Inclination (°)' : diagnosticMode === 'azi' ? 'Azimuth (°)' : `Dogleg severity (${dlsUnitLabel(dlsUnit)})`;
    chart.setAxes(xLabel, 'MD (m)');
    chart.setOptions({ equalAspect: false, yDown: true, includeYZero: true, wrap360: diagnosticMode === 'azi' });
    chart.setReferenceLines(diagnosticMode === 'dls' && Number.isFinite(dlsLimit30m) ? [{ axis: 'x', value: dlsLimit30m * dlsFactor(dlsUnit), label: 'DLS limit' }] : []);
    chart.setSeries(seriesFor('diagnostic'), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosticMode, dlsUnit, dlsLimit30m]);

  useEffect(() => {
    const options = { showStations, showLabels, showGrid };
    chartsRef.current.plan?.setOptions(options);
    chartsRef.current.section?.setOptions(options);
    chartsRef.current.diagnostic?.setOptions(options);
    sceneRef.current?.setOptions({ ...options, showStationLabels });
  }, [showStations, showLabels, showGrid, showStationLabels]);

  useEffect(() => { sceneRef.current?.setZExag(zExag); }, [zExag]);

  useEffect(() => {
    if (current === '3d') sceneRef.current?.resize();
    else chartsRef.current[current]?.resize();
    setTooltip(null);
    if (current === 'diagnostic' && measureMode) { setMeasureMode(false); setMeasure([]); }
  }, [current, measureMode]);

  useEffect(() => {
    const chart = current === '3d' ? null : chartsRef.current[current];
    const scene = sceneRef.current;
    if (current === '3d') {
      const marks = measure.map(item => {
        const record = database.get(item.well); if (!record) return null;
        const buffer = database.buffers(record); return { x: buffer.x[item.index], y: buffer.y[item.index], z: buffer.z[item.index] };
      }).filter((item): item is {x:number;y:number;z:number} => Boolean(item));
      scene?.setMarks(marks);
      if (inspectStation) {
        const record = database.get(inspectStation.well);
        if (record) { const buffer = database.buffers(record); scene?.setSelected({ x: buffer.x[inspectStation.index], y: buffer.y[inspectStation.index], z: buffer.z[inspectStation.index] }); }
        else scene?.setSelected(null);
      } else scene?.setSelected(null);
      return;
    }
    if (!chart) return;
    const makeMark = (item: InspectorSelection) => {
      const record = database.get(item.well); if (!record) return null;
      const buffer = database.buffers(record);
      let x: Float64Array, y: Float64Array;
      if (current === 'plan') { x = absoluteX(buffer, snapshot.origin.x); y = absoluteY(buffer, snapshot.origin.y); }
      else if (current === 'section') { x = sectionAxis === 'x' ? absoluteX(buffer, snapshot.origin.x) : absoluteY(buffer, snapshot.origin.y); y = buffer.z; }
      else { x = diagnosticMode === 'inc' ? buffer.inc : diagnosticMode === 'azi' ? buffer.azi : dlsSeries(buffer, dlsUnit); y = buffer.md; }
      return { x: x[item.index], y: y[item.index], view: current };
    };
    chart.setMarks(current === 'diagnostic' ? [] : measure.map(makeMark).filter(Boolean) as StudioMark2D[]);
    const selectedMark = inspectStation && selected.has(inspectStation.well) ? makeMark(inspectStation) : null;
    chart.setSelected(selectedMark ? { x: selectedMark.x, y: selectedMark.y } : null);
  }, [current, measure, inspectStation, database, snapshot.origin.x, snapshot.origin.y, sectionAxis, diagnosticMode, dlsUnit, selected]);

  useEffect(() => {
    sceneRef.current?.redraw(); chartsRef.current.plan?.redraw(); chartsRef.current.section?.redraw(); chartsRef.current.diagnostic?.redraw();
  }, [themeKey]);

  useEffect(() => {
    if (!focusRequest) return;
    const record = database.get(focusRequest.well);
    if (record) {
      keepViewOnSelectionRef.current = false;
      setSelected(new Set([record.name])); setPrimary(record.name); clearApproach();
      if (focusRequest.md != null) {
        const buffer = database.buffers(record); let best = 0, bestDistance = Infinity;
        for (let i = 0; i < buffer.n; i++) { const distance = Math.abs(buffer.md[i] - focusRequest.md); if (distance < bestDistance) { bestDistance = distance; best = i; } }
        setInspectStation({ well: record.name, index: best });
      }
    }
    onFocusConsumed?.();
  }, [focusRequest, database, onFocusConsumed]);

  useEffect(() => {
    if (!handoff) return;
    const ref = database.get(handoff.referenceWell), off = database.get(handoff.offsetWell);
    if (ref && off) {
      keepViewOnSelectionRef.current = false;
      setSelected(new Set([ref.name, off.name])); setPrimary(ref.name); setCurrent('3d'); setInspectStation(null); setMeasure([]);
      const approach: StudioApproach = {
        a: { x: handoff.a.X - snapshot.origin.x, y: handoff.a.Y - snapshot.origin.y, z: handoff.a.Z },
        b: { x: handoff.b.X - snapshot.origin.x, y: handoff.b.Y - snapshot.origin.y, z: handoff.b.Z },
        distance: handoff.distance,
        ref: ref.name,
        off: off.name,
      };
      approachRef.current = approach;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sceneRef.current?.setApproach(approach);
        sceneRef.current?.focusApproach(approach.a, approach.b);
      }));
      setMessage({ kind: 'info', text: `Closest Approach · ${ref.name} ↔ ${off.name} · ${fmt(handoff.distance, 3)} m` });
    }
    onHandoffConsumed?.();
  }, [handoff, database, snapshot.origin.x, snapshot.origin.y, onHandoffConsumed]);

  const inspectedRecord = inspectStation ? database.get(inspectStation.well) : null;
  const inspected = inspectedRecord && inspectStation ? inspectedRecord.rows[inspectStation.index] : null;
  const inspectedBuffer = inspectedRecord ? database.buffers(inspectedRecord) : null;
  const measurement = useMemo(() => {
    if (measure.length !== 2) return null;
    const aRecord = database.get(measure[0].well), bRecord = database.get(measure[1].well);
    if (!aRecord || !bRecord) return null;
    const a = aRecord.rows[measure[0].index], b = bRecord.rows[measure[1].index];
    return a && b ? measureStations(a, b) : null;
  }, [database, measure]);

  const dlsSummary = useMemo(() => {
    if (diagnosticMode !== 'dls' || !selectedRecords.length) return '';
    const factor = dlsFactor(dlsUnit);
    let max = 0, sum = 0;
    for (const record of selectedRecords) { const b = database.buffers(record); max = Math.max(max, b.dlsMax * factor); sum += b.dlsAvg * factor; }
    return `Max ${fmt(max, 2)} ${dlsUnitLabel(dlsUnit)} · Avg ${fmt(sum / selectedRecords.length, 2)} ${dlsUnitLabel(dlsUnit)}`;
  }, [diagnosticMode, dlsUnit, selectedRecords, database]);

  const hint = current === '3d'
    ? 'Drag to rotate · shift/right-drag or two-finger drag to pan · pinch/wheel to zoom · double-click to reset'
    : current === 'plan'
      ? 'X vs Y · drag to pan · pinch/wheel to zoom · double-click to reset · tap/click a station to inspect'
      : current === 'section'
        ? `${sectionAxis === 'x' ? 'X vs Z' : 'Y vs Z'} · drag to pan · pinch/wheel to zoom · double-click to reset · tap/click a station to inspect`
        : 'MD increases downward from 0 · drag to pan · pinch/wheel to zoom · tap/click a station to inspect';

  const exportCurrentCsv = () => {
    if (!selectedRecords.length) { setMessage({ kind: 'bad', text: 'Select a well first.' }); return; }
    if (current === '3d') {
      const rows = selectedRecords.flatMap(record => record.rows.map(station => ({
        Well: station.Well, MD: raw(station.MD), TVD: raw(station.TVD), X: raw(station.X), Y: raw(station.Y), Z: raw(station.Z), Azimuth: raw(station.Azimuth), Inclination: raw(station.Inclination),
      })));
      exportRows(rows, [primary || 'Wells', 'Studio_3D']); setMessage({ kind: 'ok', text: 'Studio 3D CSV exported.' }); return;
    }
    const series = seriesFor(current);
    const xLabel = current === 'plan' ? 'X — Easting (m)' : current === 'section' ? (sectionAxis === 'x' ? 'X — Easting (m)' : 'Y — Northing (m)') : diagnosticMode === 'inc' ? 'Inclination (°)' : diagnosticMode === 'azi' ? 'Azimuth (°)' : `Dogleg severity (${dlsUnitLabel(dlsUnit)})`;
    const yLabel = current === 'plan' ? 'Y — Northing (m)' : current === 'section' ? 'Elevation Z (mASL)' : 'MD (m)';
    const rows: Array<Record<string, unknown>> = [];
    for (const item of series) for (let i = 0; i < item.n; i++) rows.push({ Well: item.label, [xLabel]: +item.x[i].toFixed(4), [yLabel]: +item.y[i].toFixed(4) });
    const suffix = current === 'section' ? `section_${sectionAxis}z` : current === 'diagnostic' ? `diagnostic_${diagnosticMode}` : current;
    exportRows(rows, [primary || 'Wells', 'Studio', suffix], ['Well', xLabel, yLabel]); setMessage({ kind: 'ok', text: 'Studio CSV exported.' });
  };

  const exportCurrentPng = async () => {
    const suffix = current === 'section' ? `section_${sectionAxis}z` : current === 'diagnostic' ? `diagnostic_${diagnosticMode}` : current;
    const filename = `WTM_${suffix}_${primary ? safeName(primary) : 'view'}.png`;
    const ok = current === '3d' ? await sceneRef.current?.exportPNG(filename) : await chartsRef.current[current]?.exportPNG(filename);
    setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'PNG exported.' : 'PNG export failed.' });
  };

  function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
    return <div className="insp-row"><span>{label}</span><b>{children}</b></div>;
  }

  return (
    <div className="content studio-content">
      <section className="studio-module">
        <div className={`studio ${rightOpen ? '' : 'no-right'}`}>
          {mobilePane ? <button className="studio-drawer-scrim" type="button" aria-label="Close Studio panel" onClick={() => setMobilePane(null)} /> : null}
          <aside className={`studio-pane left ${mobilePane === 'wells' ? 'mobile-open' : ''}`}>
            <div className="pane-head"><h4>Wells</h4><span className="right" /><button className="ghost btn-xs studio-mobile-only" type="button" onClick={() => setMobilePane(null)}>Close</button><button className="ghost btn-xs" type="button" onClick={() => applySelection(snapshot.names.filter(name => !search.trim() || name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 500), snapshot.names[0])}>All</button><button className="ghost btn-xs" type="button" onClick={() => applySelection([])}>None</button></div>
            <div className="studio-search"><input type="search" placeholder="Search wells…" value={search} onChange={event => setSearch(event.target.value)} /></div>
            <div className="pane-body"><div className="well-list">
              {!filteredNames.length ? <p className="empty">{snapshot.names.length ? 'No well matches.' : 'Database is empty.'}</p> : filteredNames.slice(0, 800).map(name => {
                const record = database.get(name)!; const on = selected.has(name); const color = colorForWell(name);
                return <div className={`well-row ${on ? 'on' : ''} ${primary === name ? 'primary' : ''}`} key={name} onClick={event => toggleWell(name, !(event.ctrlKey || event.metaKey || event.shiftKey))}>
                  <span className="swatch" style={{ background: on ? color : 'transparent', borderColor: color }} /><span className="nm">{name}</span><span className="meta">{fmt(record.mdMax, 0)} m</span>
                  <button className={`star ${favoriteSet.has(name) ? 'on' : ''}`} type="button" onClick={event => { event.stopPropagation(); toggleFavorite(name); }}>{favoriteSet.has(name) ? '★' : '☆'}</button>
                </div>;
              })}
            </div></div>
            <div className="pane-section"><h5>Display</h5>{checkboxLabel('Survey stations', showStations, setShowStations)}{checkboxLabel('Well labels', showLabels, setShowLabels)}{checkboxLabel('Station labels (3D)', showStationLabels, setShowStationLabels)}{checkboxLabel('Grid', showGrid, setShowGrid)}{checkboxLabel('Legend', showLegend, setShowLegend)}</div>
          </aside>

          <div className="studio-main">
            <div className="studio-tabs">{VIEWS.map(view => <button key={view.id} className={`stab ${current === view.id ? 'active' : ''}`} type="button" onClick={() => setCurrent(view.id)}>{view.label}</button>)}</div>
            <div className="studio-toolbar">
              <button className="btn-sm" type="button" onClick={() => current === '3d' ? sceneRef.current?.reset() : chartsRef.current[current]?.reset()}>⟲ Reset view</button><span className="sep" />
              {current === '3d' ? <span className="row studio-tool-group"><button className="btn-sm" type="button" onClick={() => sceneRef.current?.preset('top')}>Top</button><button className="btn-sm" type="button" onClick={() => sceneRef.current?.preset('front')}>Front</button><button className="btn-sm" type="button" onClick={() => sceneRef.current?.preset('side')}>Side</button><button className="btn-sm" type="button" onClick={() => sceneRef.current?.preset('iso')}>Iso</button><label>Z ×<input className="z-exag" type="range" min="1" max="8" step="0.5" value={zExag} onChange={event => setZExag(Number(event.target.value))} /><span className="mono">{zExag}</span></label></span> : null}
              {current === 'section' ? <span className="row studio-tool-group"><span className="seg-btns"><button className={`btn-sm section-axis-btn ${sectionAxis === 'x' ? 'active' : ''}`} type="button" onClick={() => setSectionAxis('x')}>X vs Z</button><button className={`btn-sm section-axis-btn ${sectionAxis === 'y' ? 'active' : ''}`} type="button" onClick={() => setSectionAxis('y')}>Y vs Z</button></span><label><input type="checkbox" checked={sectionEqualScale} onChange={event => setSectionEqualScale(event.target.checked)} /> Equal Scale</label></span> : null}
              {current === 'diagnostic' ? <span className="row studio-tool-group"><label>Diagnostic<select value={diagnosticMode} onChange={event => setDiagnosticMode(event.target.value as DiagnosticMode)}><option value="inc">Inclination</option><option value="azi">Azimuth</option><option value="dls">Dogleg</option></select></label>{diagnosticMode === 'dls' ? <><label>Units<select value={dlsUnit} onChange={event => setDlsUnit(event.target.value as DlsUnit)}><option value="30m">deg/30m</option><option value="100ft">deg/100ft</option></select></label><label className="dls-limit-control">Limit<input type="number" min="0" step="0.1" value={raw(dlsLimit30m * dlsFactor(dlsUnit), 2)} onChange={event => { const value = Number(event.target.value); setDlsLimit30m(Number.isFinite(value) && value >= 0 ? value / dlsFactor(dlsUnit) : Number.NaN); }} /><span>{dlsUnitLabel(dlsUnit)}</span></label><span className="mono dls-summary">{dlsSummary}</span></> : null}</span> : null}
              {current !== 'diagnostic' ? <><span className="sep" /><label><input type="checkbox" checked={measureMode} onChange={event => { setMeasureMode(event.target.checked); if (!event.target.checked) setMeasure([]); else setMessage({ kind: 'info', text: 'Measure mode: click two survey stations.' }); }} /> Measure</label></> : null}
              <span className="right" /><button className="btn-sm studio-mobile-only" type="button" onClick={() => setMobilePane('wells')}>☷ Wells</button><button className="btn-sm studio-mobile-only" type="button" onClick={() => setMobilePane('inspector')}>ⓘ Inspector</button><button className="btn-sm" type="button" onClick={() => void exportCurrentPng()}>🖼 PNG</button><button className="btn-sm" type="button" onClick={exportCurrentCsv}>⭳ CSV</button><button className="btn-sm studio-desktop-only" type="button" onClick={() => setRightOpen(value => !value)}>⇥ Panel</button>
            </div>
            <div className="studio-canvas-wrap" ref={wrapRef}>
              <div className={`view-panel ${current === '3d' ? 'active' : ''}`}><canvas className="plot" ref={cv3dRef} /></div>
              <div className={`view-panel ${current === 'plan' ? 'active' : ''}`}><canvas className="plot" ref={cvPlanRef} /></div>
              <div className={`view-panel ${current === 'section' ? 'active' : ''}`}><canvas className="plot" ref={cvSectionRef} /></div>
              <div className={`view-panel ${current === 'diagnostic' ? 'active' : ''}`}><canvas className="plot" ref={cvDiagnosticRef} /></div>
              {tooltip ? <div className="tooltip studio-tooltip" style={{ display: 'block', left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div> : null}
              {showLegend && selectedRecords.length ? <div className="legend"><h6>Wells ({selectedRecords.length})</h6>{selectedRecords.slice(0, 40).map(record => <div className="legend-item" key={record.name}><span className="swatch" style={{ background: colorForWell(record.name) }} />{record.name}</div>)}{selectedRecords.length > 40 ? <div className="legend-item">… {selectedRecords.length - 40} more</div> : null}</div> : null}
              <div className="canvas-hint">{hint}</div>
              {!selected.size ? <div className="studio-empty">Select one or more wells to start plotting.</div> : null}
            </div>
          </div>

          <aside className={`studio-pane right ${mobilePane === 'inspector' ? 'mobile-open' : ''}`}>
            <div className="pane-head"><h4>Trajectory Inspector</h4><span className="right" /><button className="ghost btn-xs studio-mobile-only" type="button" onClick={() => setMobilePane(null)}>Close</button></div>
            <div className="pane-body">
              {!inspected || !inspectedRecord || !inspectedBuffer || !inspectStation ? <p className="empty">Click a survey station in any view to inspect it.</p> : <>
                <InspectorRow label="Well">{inspected.Well}</InspectorRow>
                <InspectorRow label="Survey #">{inspectStation.index + 1} / {inspectedRecord.count}</InspectorRow>
                <InspectorRow label="MD"><>{fmt(inspected.MD, 2)} m<br />{fmt(inspected.MD * FT, 2)} ft</></InspectorRow>
                <InspectorRow label="TVD">{fmt(inspected.TVD, 2)} m</InspectorRow>
                <InspectorRow label="Elevation">{fmt(inspected.Z, 2)} mASL</InspectorRow>
                <InspectorRow label="X">{fmt(inspected.X, 2)}</InspectorRow><InspectorRow label="Y">{fmt(inspected.Y, 2)}</InspectorRow>
                <InspectorRow label="Azimuth">{fmt(inspected.Azimuth, 2)}°</InspectorRow><InspectorRow label="Inclination">{fmt(inspected.Inclination, 2)}°</InspectorRow>
                <InspectorRow label="DLS">{fmt(inspectedBuffer.dls[inspectStation.index] * dlsFactor(dlsUnit), 2)} {dlsUnitLabel(dlsUnit)}</InspectorRow>
                <InspectorRow label="From previous">{stationDistance(inspected, inspectedRecord.rows[inspectStation.index - 1]) == null ? '—' : `${fmt(stationDistance(inspected, inspectedRecord.rows[inspectStation.index - 1]), 2)} m`}</InspectorRow>
                <InspectorRow label="To next">{stationDistance(inspected, inspectedRecord.rows[inspectStation.index + 1]) == null ? '—' : `${fmt(stationDistance(inspected, inspectedRecord.rows[inspectStation.index + 1]), 2)} m`}</InspectorRow>
                <div className="seg-btns inspector-actions"><button className="btn-sm" type="button" onClick={async () => { const ok = await copyText([raw(inspected.X, 3), raw(inspected.Y, 3), raw(inspected.Z, 3)].join('\t')); setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Coordinates copied (X, Y, Z).' : 'Copy failed.' }); }}>📋 Coordinates</button><button className="btn-sm" type="button" onClick={async () => { const ok = await copyText(raw(inspected.MD, 3)); setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'MD copied.' : 'Copy failed.' }); }}>📋 MD</button><button className="btn-sm primary" type="button" onClick={() => onShowInConverter?.({ well: inspected.Well, md: inspected.MD, token: Date.now() })}>📍 Calculator</button></div>
              </>}
              <Message message={message} />
            </div>
            {current !== 'diagnostic' ? <div className="pane-section"><h5>Measurement Tool</h5><p className="hint studio-measure-hint">Enable <b>Measure</b> in the toolbar, then click two survey stations.</p>
              {!measure.length ? <p className="empty">No stations selected.</p> : measure.length === 1 ? <><div className="mini-stat"><span>Point 1</span><b>{measure[0].well} @ {fmt(database.get(measure[0].well)?.rows[measure[0].index]?.MD, 1)} m</b></div><p className="empty">Click a second station.</p></> : measurement ? <><div className="mini-stat"><span>Point 1</span><b>{measurement.a.Well} @ {fmt(measurement.a.MD, 1)}</b></div><div className="mini-stat"><span>Point 2</span><b>{measurement.b.Well} @ {fmt(measurement.b.MD, 1)}</b></div><div className="mini-stat"><span>3D distance</span><b>{fmt(measurement.d3, 2)} m</b></div><div className="mini-stat"><span>Horizontal</span><b>{fmt(measurement.horiz, 2)} m</b></div><div className="mini-stat"><span>Vertical</span><b>{fmt(measurement.vert, 2)} m</b></div><div className="mini-stat"><span>Bearing</span><b>{fmt(measurement.bearing, 2)}°</b></div><div className="mini-stat"><span>ΔMD</span><b>{fmt(measurement.dMD, 2)} m</b></div></> : null}
              <div className="seg-btns studio-measure-actions"><button className="btn-sm" type="button" onClick={() => setMeasure([])}>Clear</button><button className="btn-sm" type="button" disabled={!measurement} onClick={async () => { if (!measurement) return; const ok = await copyText([`Point 1\t${measurement.a.Well}\t${raw(measurement.a.MD, 3)}`, `Point 2\t${measurement.b.Well}\t${raw(measurement.b.MD, 3)}`, `3D distance\t${raw(measurement.d3, 3)}`, `Horizontal\t${raw(measurement.horiz, 3)}`, `Vertical\t${raw(measurement.vert, 3)}`, `Bearing\t${raw(measurement.bearing, 3)}`, `Delta MD\t${raw(measurement.dMD, 3)}`].join('\n')); setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Measurement copied.' : 'Copy failed.' }); }}>📋 Copy</button></div>
            </div> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
