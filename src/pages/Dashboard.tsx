import { useEffect, useMemo, useState } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../app/DatabaseContext';
import { copyRows, exportRows } from '../services/browserFiles';
import { preferences } from '../services/preferences';
import { DataTable } from '../components/tables/DataTable';
import { EmptyState } from '../components/common/EmptyState';
import { Message, type MessageState } from '../components/common/Message';
import { fmt } from '../utils/format';

const SURVEY_KEYS = ['Well', 'MD', 'X', 'Y', 'Z', 'TVD', 'Azimuth', 'Inclination'];

export function Dashboard() {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const stats = database.stats();
  const [selectedWell, setSelectedWell] = useState('');
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    if (!snapshot.names.length) {
      setSelectedWell('');
      return;
    }
    if (!selectedWell || !database.get(selectedWell)) setSelectedWell(snapshot.names[0]);
  }, [database, selectedWell, snapshot.names]);

  const rows = useMemo(() => {
    if (!selectedWell) return [];
    return database.wellRows(selectedWell);
  }, [database, selectedWell, snapshot.revision]);

  const chooseWell = (well: string) => {
    setSelectedWell(well);
    preferences.pushRecent(well);
  };

  const copy = async () => {
    const ok = await copyRows(rows, SURVEY_KEYS);
    setMessage({ kind: ok ? 'ok' : 'bad', text: ok ? 'Survey rows copied.' : 'Copy failed.' });
  };

  const exportCsv = () => {
    if (!selectedWell || !rows.length) return;
    exportRows(rows, [selectedWell, 'Data_Viewer'], SURVEY_KEYS);
    setMessage({ kind: 'ok', text: 'Data Viewer CSV exported.' });
  };

  return (
    <div className="content">
      <div className="stat-grid dashboard-stats">
        <div className="stat"><b>Total Wells</b><span>{fmt(stats.wells, 0)}</span><small>indexed trajectory records</small></div>
        <div className="stat"><b>Survey Stations</b><span>{fmt(stats.stations, 0)}</span><small>current in-memory database</small></div>
        <div className="stat"><b>Longest Well</b><span className="text">{stats.longest}</span><small>{stats.maxMD ? `${fmt(stats.maxMD, 2)} mMD` : '—'}</small></div>
        <div className="stat"><b>Last Imported Database</b><span className="text" title={stats.lastImport}>{stats.lastImport}</span><small>{snapshot.meta.project || 'No project metadata'}</small></div>
      </div>

      <section className="card">
        <h3>Data Viewer</h3>
        <p className="hint">Inspect the currently loaded trajectory database without modifying it.</p>
        {!snapshot.names.length ? (
          <EmptyState>The database is empty. Open Database Manager to load a CSV, TSV, or TXT trajectory file.</EmptyState>
        ) : (
          <>
            <div className="row viewer-toolbar">
              <div className="field grow">
                <label htmlFor="dashboard-well">Well</label>
                <select id="dashboard-well" value={selectedWell} onChange={event => chooseWell(event.target.value)}>
                  {snapshot.names.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <button type="button" onClick={copy} disabled={!rows.length}>Copy Results</button>
              <button type="button" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
            </div>
            <Message message={message} />
            <DataTable rows={rows} keys={SURVEY_KEYS} empty="No survey stations are available for this well." />
            {rows.length ? <p className="hint table-note">{fmt(rows.length, 0)} survey station(s).</p> : null}
          </>
        )}
      </section>

      <section className="card phase-note">
        <h3>WTM 1.0 Migration Status</h3>
        <p className="hint">Phases 1–4 are active: engineering engine, data/QC layer, React shell/data pages, Trajectory Converter, Trajectory Splitter and Coordinate Converter.</p>
      </section>
    </div>
  );
}
