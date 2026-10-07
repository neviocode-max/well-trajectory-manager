import { useState } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../../app/DatabaseContext';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { fmt } from '../../utils/format';

/** Cloud controls are a UI preview until a cloud storage service is connected. */
export function SavedDatabaseControls({ project, crs }: { project: string; crs: string }) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const hasDatabase = snapshot.names.length > 0;
  const source = hasDatabase ? snapshot.lastImport || 'Untitled database' : '';
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [name, setName] = useState('');
  const stationCount = database.stats().stations;

  const openSaveAs = () => {
    setName(source.replace(/\.[^.]+$/, ''));
    setSaveAsOpen(true);
  };

  return (
    <>
      <div className="saved-db-heading">
        <div className="saved-db-title"><Icon name="database" size={18} /><h3>Saved Databases</h3></div>
        <span className="saved-db-badge">Session only</span>
      </div>
      <p className="hint">Choose a saved database to load its wells, surveys, and project details.</p>

      <div className="saved-db-toolbar">
        <div className="field">
          <label htmlFor="saved-database-select">Saved Database</label>
          <select id="saved-database-select" value={hasDatabase ? 'working' : ''} disabled aria-describedby="saved-database-help">
            <option value="">No saved databases available</option>
            {hasDatabase ? <option value="working">{source} — current session</option> : null}
          </select>
        </div>
        <div className="saved-db-actions">
          <button type="button" disabled title="Connect cloud storage to update a saved database">Save Changes</button>
          <button type="button" className="primary" disabled={!hasDatabase} onClick={openSaveAs} title={hasDatabase ? 'Preview the Save As form; cloud saving is not connected yet' : 'Load a database to preview Save As'}>Save As…</button>
        </div>
      </div>

      <div className="saved-db-details" aria-live="polite">
        <span className={`saved-db-state ${hasDatabase ? 'unsaved' : ''}`}><span className="dot" />{hasDatabase ? 'Not saved to cloud' : 'No database loaded'}</span>
        <span>{fmt(snapshot.names.length, 0)} wells · {fmt(stationCount, 0)} survey stations</span>
        <span>Last saved: —</span>
      </div>
      <div className="saved-db-notice" id="saved-database-help">
        <Icon name="info" size={16} />
        <div><strong>Cloud storage not connected</strong><p>Uploads stay in the current browser session. Export a CSV to keep a copy. Saved databases will appear here once cloud storage is connected.</p></div>
      </div>

      <Modal open={saveAsOpen} title="Save Database As" subtitle="Preview the name and details for a new saved database." onClose={() => setSaveAsOpen(false)} footer={
        <><button type="button" onClick={() => setSaveAsOpen(false)}>Close Preview</button><button type="button" className="primary" disabled title="Cloud storage must be connected before saving">Save to Cloud</button></>
      }>
        <div className="field">
          <label htmlFor="saved-database-name">Database Name</label>
          <input id="saved-database-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. MUW 2026 — Planned Wells" maxLength={120} autoFocus />
          <p className="hint">Use a distinct name for each dataset or version. Several databases can belong to the same project.</p>
        </div>
        <dl className="saved-db-preview-details">
          <div><dt>Project</dt><dd>{project.trim() || 'Not set'}</dd></div>
          <div><dt>Coordinate Reference System</dt><dd>{crs.trim() || 'Not set'}</dd></div>
          <div><dt>Contents</dt><dd>{fmt(snapshot.names.length, 0)} wells · {fmt(stationCount, 0)} survey stations</dd></div>
          <div><dt>Source file</dt><dd>{source}</dd></div>
        </dl>
        <p className="saved-db-preview-note"><Icon name="info" size={16} />This is a design preview. No data or database name will be saved.</p>
      </Modal>
    </>
  );
}
