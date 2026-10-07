import { SURVEY_TEMPLATE_KEYS } from '../data/surveyTemplate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { qualityText } from '../data/database';
import { asSurveyInput, parseTrajectoryFile } from '../services/importExport';
import { downloadText, exportRows } from '../services/browserFiles';
import { preferences } from '../services/preferences';
import type {
  AppendMode,
  EditableSurveyRow,
  ParsedDirectionalSurvey,
  SurveyInputStation,
} from '../types/database';
import type { SurveyStation } from '../types/survey';
import type { WellRecord } from '../types/well';
import { Message, type MessageState } from '../components/common/Message';
import { EmptyState } from '../components/common/EmptyState';
import { DataTable } from '../components/tables/DataTable';
import { DirectionalTieInModal } from '../components/database/DirectionalTieInModal';
import { DuplicateWellModal } from '../components/database/DuplicateWellModal';
import { EditWellModal } from '../components/database/EditWellModal';
import { SavedDatabaseControls } from '../components/database/SavedDatabaseControls';
import { fmt } from '../utils/format';

const SURVEY_KEYS = SURVEY_TEMPLATE_KEYS;
type ImportAction = 'load' | 'append';
type QCFilter = 'all' | 'conflict' | 'geometry';

interface DirectionalPending {
  action: ImportAction;
  fileName: string;
  parsed: ParsedDirectionalSurvey;
}

interface AppendPending {
  stations: SurveyInputStation[];
  fileName: string;
  dropped: number;
  directional: boolean;
  duplicates: string[];
}

function resultMessage(prefix: string, quality: string): string {
  return quality ? `${prefix} · ${quality}.` : prefix;
}

export function DatabaseManager({ onPlotWell }: { onPlotWell?: (well: string) => void }) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const stats = database.stats();
  const loadRef = useRef<HTMLInputElement>(null);
  const appendRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<MessageState | null>(null);
  const [search, setSearch] = useState('');
  const [qcFilter, setQcFilter] = useState<QCFilter>('all');
  const [qcWell, setQcWell] = useState('');
  const [project, setProject] = useState(snapshot.meta.project);
  const [crs, setCrs] = useState(snapshot.meta.crs);
  const [directional, setDirectional] = useState<DirectionalPending | null>(null);
  const [pendingAppend, setPendingAppend] = useState<AppendPending | null>(null);
  const [editRecord, setEditRecord] = useState<WellRecord | null>(null);
  const [favorites, setFavorites] = useState(() => new Set(preferences.getFavorites()));

  useEffect(() => {
    setProject(snapshot.meta.project);
    setCrs(snapshot.meta.crs);
  }, [snapshot.meta.crs, snapshot.meta.project]);

  const filteredNames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const names = snapshot.names.filter(name => !query || name.toLowerCase().includes(query));
    const favorite = names.filter(name => favorites.has(name));
    return favorite.concat(names.filter(name => !favorites.has(name)));
  }, [favorites, search, snapshot.names]);

  const qcIssues = useMemo(() => {
    const all = snapshot.importReport?.qcIssues ?? [];
    const wellQuery = qcWell.trim().toLowerCase();
    return all.filter(issue => {
      const type = String(issue.Type || '').toLowerCase();
      const well = String(issue.Well || '').toLowerCase();
      const typeOk = qcFilter === 'all'
        || (qcFilter === 'conflict' && type.includes('duplicate'))
        || (qcFilter === 'geometry' && type.includes('geometry'));
      return typeOk && (!wellQuery || well.includes(wellQuery));
    });
  }, [qcFilter, qcWell, snapshot.importReport]);

  const applyLoad = (stations: SurveyInputStation[], fileName: string, dropped: number, wasDirectional: boolean) => {
    const result = database.replace(stations, fileName, dropped);
    const quality = qualityText(database.importReport);
    const base = `Loaded ${fileName}: ${result.wells} well(s), ${result.stations} survey station(s).${wasDirectional ? ' Directional survey reconstructed from MD/Azimuth/Inclination using minimum curvature and the supplied tie-in station.' : ''}`;
    setMessage({ kind: 'ok', text: resultMessage(base, quality) });
  };

  const applyAppend = (pending: AppendPending, mode: AppendMode) => {
    const result = database.append(pending.stations, pending.fileName, mode, pending.dropped);
    const quality = qualityText(database.importReport);
    const base = `Appended ${pending.fileName}: ${result.added} new well(s), ${result.replaced} replaced, ${result.renamed} kept as copies, ${result.skipped} skipped · ${result.newStations} station(s) added.${pending.directional ? ' Directional survey reconstructed using minimum curvature and the supplied tie-in station.' : ''}`;
    setMessage({ kind: 'ok', text: resultMessage(base, quality) });
    setPendingAppend(null);
  };

  const prepareAppend = (stations: SurveyInputStation[], fileName: string, dropped: number, wasDirectional: boolean) => {
    const duplicates = database.duplicatesOf(stations);
    const pending: AppendPending = { stations, fileName, dropped, directional: wasDirectional, duplicates };
    if (duplicates.length) setPendingAppend(pending);
    else applyAppend(pending, 'skip');
  };

  const handleFile = async (file: File, action: ImportAction) => {
    try {
      const parsedFile = await parseTrajectoryFile(file);
      if (parsedFile.parsed.kind === 'directional') {
        setDirectional({ action, fileName: parsedFile.fileName, parsed: parsedFile.parsed });
        return;
      }
      if (action === 'load') applyLoad(parsedFile.parsed.stations, parsedFile.fileName, parsedFile.parsed.dropped, false);
      else prepareAppend(parsedFile.parsed.stations, parsedFile.fileName, parsedFile.parsed.dropped, false);
    } catch (error) {
      setMessage({ kind: 'bad', text: error instanceof Error ? error.message : String(error) });
    }
  };

  const finishDirectional = (stations: SurveyStation[]) => {
    if (!directional) return;
    const asInput = asSurveyInput(stations);
    const { action, fileName, parsed } = directional;
    setDirectional(null);
    if (action === 'load') applyLoad(asInput, fileName, parsed.dropped, true);
    else prepareAppend(asInput, fileName, parsed.dropped, true);
  };

  const toggleFavorite = (name: string) => {
    const next = new Set(favorites);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setFavorites(next);
    preferences.setFavorites([...next]);
  };

  const exportWell = (name: string) => {
    exportRows(database.wellRows(name), [name, 'Trajectory'], SURVEY_KEYS);
    setMessage({ kind: 'ok', text: `${name} trajectory CSV exported.` });
  };

  const deleteWell = (name: string) => {
    if (!window.confirm(`Delete ${name} from the current in-memory database?`)) return;
    database.deleteWell(name);
    setMessage({ kind: 'warn', text: `${name} deleted from this session.` });
  };

  const saveEdit = (oldName: string, newName: string, rows: EditableSurveyRow[]) => {
    database.updateWell(oldName, newName, rows);
    if (favorites.has(oldName) && oldName !== newName) {
      const next = new Set(favorites);
      next.delete(oldName);
      next.add(newName);
      setFavorites(next);
      preferences.setFavorites([...next]);
    }
    setMessage({ kind: 'ok', text: `Updated well ${newName} and re-indexed its survey data.` });
  };

  const report = snapshot.importReport;

  return (
    <div className="content">
      <section className="card">
        <h3>Database</h3>
        <p className="hint">Load or append trajectory data using the default survey template. UTM_E / UTM_N are metres; DEPTH_VERT and ELEV_FT are feet. DIP = 90 − DEV_ANGLE.</p>
        <p className="hint">{SURVEY_KEYS.join(" · ")}</p>
        <div className="row db-actions">
          <button type="button" onClick={() => downloadText("WTM_Database_Template.csv", SURVEY_KEYS.join(",") + "\n")}>Download Template</button>
          <button type="button" className="primary" onClick={() => loadRef.current?.click()}>Load Database</button>
          <button type="button" onClick={() => appendRef.current?.click()}>Append Database</button>
          <button type="button" onClick={() => {
            if (!stats.wells) {
              setMessage({ kind: 'bad', text: 'Nothing to export — the database is empty.' });
              return;
            }
            exportRows(database.toRows(), ['Master_Database'], SURVEY_KEYS);
            setMessage({ kind: 'ok', text: 'Master database CSV exported.' });
          }}>Export Master</button>
          <button type="button" className="danger" disabled={!stats.wells} onClick={() => {
            if (!window.confirm(`Clear the entire database? ${stats.wells} well(s) and ${stats.stations} station(s) will be removed from this session.`)) return;
            database.clear();
            setMessage({ kind: 'warn', text: 'Database cleared.' });
          }}>Clear Database</button>
          <input
            ref={loadRef}
            className="hidden-input"
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file, 'load');
            }}
          />
          <input
            ref={appendRef}
            className="hidden-input"
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file, 'append');
            }}
          />
        </div>
        <Message message={message} />
      </section>

      <div className="stat-grid">
        <div className="stat"><b>Wells</b><span>{fmt(stats.wells, 0)}</span><small>indexed</small></div>
        <div className="stat"><b>Survey Stations</b><span>{fmt(stats.stations, 0)}</span><small>total records</small></div>
        <div className="stat"><b>Last Imported File</b><span className="text" title={stats.lastImport}>{stats.lastImport}</span><small>source of current data</small></div>
        <div className="stat"><b>Derived Angles</b><span>{fmt(report?.derived ?? 0, 0)}</span><small>stations with reconstructed inc/azi</small></div>
        <div className="stat"><b>Rows Rejected</b><span>{fmt(report?.dropped ?? 0, 0)}</span><small>{fmt(report?.duplicates ?? 0, 0)} duplicate depth(s) removed</small></div>
      </div>

      <section className="card saved-database-card">
        <SavedDatabaseControls project={project} crs={crs} />
        <div className="saved-db-metadata-head"><h4>Project Metadata</h4><p className="hint">These details belong to the current working database.</p></div>
        <div className="grid metadata-grid">
          <div className="field"><label htmlFor="database-project">Project</label><input id="database-project" value={project} onChange={event => setProject(event.target.value)} placeholder="e.g. DEMO Project" /></div>
          <div className="field"><label htmlFor="database-crs">Coordinate Reference System</label><input id="database-crs" value={crs} onChange={event => setCrs(event.target.value)} placeholder="e.g. WGS84 / UTM Zone 48S" /></div>
          <button type="button" onClick={() => {
            database.setMeta(project, crs);
            setMessage({ kind: 'ok', text: 'Project metadata saved for the current in-memory database.' });
          }} title="Apply metadata to this browser session; cloud saving is not connected">Apply Metadata</button>
        </div>
      </section>

      <section className="card">
        <h3>Data Quality</h3>
        <p className="hint">Review non-blocking import quality checks and survey-geometry warnings.</p>
        {!report ? (
          <EmptyState>No import QC report is available.</EmptyState>
        ) : (
          <>
            <div className="qc-summary">
              <span className={`qc-chip ${report.conflicts ? 'bad' : ''}`}>Conflicting MD: <b>{fmt(report.conflicts, 0)}</b></span>
              <span className={`qc-chip ${report.geometryWarnings ? 'warn' : ''}`}>Geometry QC: <b>{fmt(report.geometryWarnings, 0)}</b></span>
              <span className="qc-chip">Incomplete rows: <b>{fmt(report.dropped, 0)}</b></span>
              <span className="qc-chip">Derived angles: <b>{fmt(report.derived, 0)}</b></span>
            </div>
            <div className="qc-filterbar">
              <div className="segmented">
                <button type="button" className={qcFilter === 'all' ? 'active' : ''} onClick={() => setQcFilter('all')}>All Issues</button>
                <button type="button" className={qcFilter === 'conflict' ? 'active' : ''} onClick={() => setQcFilter('conflict')}>Conflicting MD</button>
                <button type="button" className={qcFilter === 'geometry' ? 'active' : ''} onClick={() => setQcFilter('geometry')}>Geometry</button>
              </div>
              <input value={qcWell} onChange={event => setQcWell(event.target.value)} placeholder="Filter by well name…" />
              <span className="filter-count">Showing {qcIssues.length} of {report.qcIssues.length} detailed issue(s)</span>
            </div>
            <DataTable rows={qcIssues as unknown as Array<Record<string, unknown>>} limit={200} empty="No QC issues match the current filter." />
            {report.qcIssues.length >= 500 ? <p className="hint">Detailed QC list is capped at 500 records per import.</p> : null}
          </>
        )}
      </section>

      <section className="card">
        <h3>Wells</h3>
        <div className="row well-filter-row">
          <div className="field grow"><label>Search Wells</label><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search well name…" /></div>
          <span className="filter-count">{filteredNames.length} / {snapshot.names.length} wells</span>
        </div>
        {!snapshot.names.length ? (
          <EmptyState>The database is empty. Use Load Database to import a CSV, TSV, or TXT file.</EmptyState>
        ) : !filteredNames.length ? (
          <EmptyState>No wells match the current filter.</EmptyState>
        ) : (
          <div className="table-wrap wells-table-wrap">
            <table>
              <thead><tr><th>★</th><th>Well</th><th>Stations</th><th>MD Min (m)</th><th>MD Max (m)</th><th>MD Max (ft)</th><th>TVD Max (m)</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredNames.slice(0, 1000).map(name => {
                  const record = database.require(name);
                  return (
                    <tr key={name}>
                      <td><button type="button" className={`star ${favorites.has(name) ? 'on' : ''}`} onClick={() => toggleFavorite(name)}>{favorites.has(name) ? '★' : '☆'}</button></td>
                      <td>{name}</td>
                      <td className="num">{fmt(record.count, 0)}</td>
                      <td className="num">{fmt(record.mdMin, 2)}</td>
                      <td className="num">{fmt(record.mdMax, 2)}</td>
                      <td className="num">{fmt(record.mdMax * 3.280839895013123, 2)}</td>
                      <td className="num">{fmt(record.tvdMax, 2)}</td>
                      <td className="actions-cell">
                        <button type="button" className="ghost btn-xs" disabled={!onPlotWell} title="Open this trajectory in Studio" onClick={() => onPlotWell?.(name)}>Plot</button>
                        <button type="button" className="ghost btn-xs" onClick={() => exportWell(name)}>Export</button>
                        <button type="button" className="ghost btn-xs" onClick={() => setEditRecord(record)}>Edit Data</button>
                        <button type="button" className="ghost btn-xs danger" onClick={() => deleteWell(name)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DirectionalTieInModal
        open={Boolean(directional)}
        fileName={directional?.fileName ?? ''}
        parsed={directional?.parsed ?? null}
        onCancel={() => setDirectional(null)}
        onComplete={finishDirectional}
      />
      <DuplicateWellModal
        open={Boolean(pendingAppend?.duplicates.length)}
        duplicates={pendingAppend?.duplicates ?? []}
        onCancel={() => {
          setPendingAppend(null);
          setMessage({ kind: 'warn', text: 'Append cancelled. The database was not modified.' });
        }}
        onApply={mode => pendingAppend && applyAppend(pendingAppend, mode)}
      />
      <EditWellModal record={editRecord} onClose={() => setEditRecord(null)} onSave={saveEdit} />
    </div>
  );
}
