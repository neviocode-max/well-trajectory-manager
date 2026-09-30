import { useMemo, useState } from 'react';
import { Modal } from '../common/Modal';
import { Message, type MessageState } from '../common/Message';
import { reconstructDirectionalGroup } from '../../services/importExport';
import type { ParsedDirectionalSurvey } from '../../types/database';
import type { DirectionalTieIn, SurveyStation } from '../../types/survey';
import { fmt } from '../../utils/format';

interface DirectionalTieInModalProps {
  open: boolean;
  fileName: string;
  parsed: ParsedDirectionalSurvey | null;
  onCancel: () => void;
  onComplete: (stations: SurveyStation[]) => void;
}

interface Draft {
  well: string;
  MD: string;
  X: string;
  Y: string;
  Z: string;
  TVD: string;
}

function defaultDraft(parsed: ParsedDirectionalSurvey, index: number): Draft {
  const group = parsed.groups[index];
  const firstMD = group.rows[0].MD;
  return {
    well: group.suggestedWell || '',
    MD: String(firstMD),
    X: '',
    Y: '',
    Z: '',
    TVD: Math.abs(firstMD) < 1e-7 ? '0' : '',
  };
}

export function DirectionalTieInModal({ open, fileName, parsed, onCancel, onComplete }: DirectionalTieInModalProps) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reconstructed, setReconstructed] = useState<SurveyStation[][]>([]);
  const [message, setMessage] = useState<MessageState | null>(null);

  const group = parsed?.groups[index] ?? null;
  const draft = useMemo(() => {
    if (!parsed) return null;
    return drafts[index] ?? defaultDraft(parsed, index);
  }, [drafts, index, parsed]);

  const close = () => {
    setIndex(0);
    setDrafts([]);
    setReconstructed([]);
    setMessage(null);
    onCancel();
  };

  if (!parsed || !group || !draft) return null;

  const update = (field: keyof Draft, value: string) => {
    setDrafts(current => {
      const next = current.length ? current.slice() : parsed.groups.map((_, i) => defaultDraft(parsed, i));
      next[index] = { ...(next[index] ?? defaultDraft(parsed, index)), [field]: value };
      return next;
    });
  };

  const updateMd = (value: string) => {
    setDrafts(current => {
      const next = current.length ? current.slice() : parsed.groups.map((_, i) => defaultDraft(parsed, i));
      const previous = next[index] ?? defaultDraft(parsed, index);
      next[index] = {
        ...previous,
        MD: value,
        TVD: Math.abs(Number(value)) < 1e-7 && !previous.TVD.trim() ? '0' : previous.TVD,
      };
      return next;
    });
  };

  const previous = () => {
    if (index > 0) {
      setMessage(null);
      setIndex(index - 1);
    }
  };

  const apply = () => {
    try {
      const tie: DirectionalTieIn = {
        well: draft.well,
        MD: Number(draft.MD),
        X: Number(draft.X),
        Y: Number(draft.Y),
        Z: Number(draft.Z),
        TVD: Number(draft.TVD),
      };
      const rows = reconstructDirectionalGroup(group, tie);
      const next = reconstructed.slice();
      next[index] = rows;
      setReconstructed(next);
      setMessage(null);

      if (index < parsed.groups.length - 1) {
        setIndex(index + 1);
      } else {
        onComplete(next.flat());
        setIndex(0);
        setDrafts([]);
        setReconstructed([]);
      }
    } catch (error) {
      setMessage({ kind: 'bad', text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Modal
      open={open}
      title="Directional Survey Tie-In"
      subtitle="Reconstruct MD / Azimuth / Inclination survey data using minimum curvature and a known tie-in station."
      onClose={close}
      footer={(
        <>
          <button type="button" onClick={close}>Cancel</button>
          {index > 0 ? <button type="button" onClick={previous}>Previous</button> : null}
          <button type="button" className="primary" onClick={apply}>
            {index === parsed.groups.length - 1 ? 'Reconstruct & Import' : 'Reconstruct & Continue'}
          </button>
        </>
      )}
    >
      <div className="directional-progress">
        <b>Well {index + 1} of {parsed.groups.length}</b>{group.suggestedWell ? ` · ${group.suggestedWell}` : ''}
      </div>
      <p className="hint">
        <b>{fileName}</b> · {fmt(group.rows.length, 0)} station(s) for this well · MD {fmt(group.rows[0].MD, 2)}–{fmt(group.rows[group.rows.length - 1].MD, 2)} m.
        {group.duplicates ? ` ${fmt(group.duplicates, 0)} duplicate MD row(s) ignored.` : ''}
        <br />File total: {fmt(parsed.groups.length, 0)} well(s), {fmt(parsed.totalStations, 0)} valid directional station(s).
      </p>

      <div className="grid">
        <div className="field">
          <label>Well Name</label>
          <input value={draft.well} readOnly={Boolean(group.suggestedWell)} onChange={event => update('well', event.target.value)} />
        </div>
        <div className="field">
          <label>Tie-in MD (m)</label>
          <select value={draft.MD} onChange={event => updateMd(event.target.value)}>
            {group.rows.map((row, rowIndex) => (
              <option key={row.MD} value={row.MD}>{fmt(row.MD, 3)} mMD{rowIndex === 0 ? ' (first station)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Tie-in X / Easting (m)</label><input inputMode="decimal" value={draft.X} onChange={event => update('X', event.target.value)} /></div>
        <div className="field"><label>Tie-in Y / Northing (m)</label><input inputMode="decimal" value={draft.Y} onChange={event => update('Y', event.target.value)} /></div>
        <div className="field"><label>Tie-in Z / Elevation (mASL)</label><input inputMode="decimal" value={draft.Z} onChange={event => update('Z', event.target.value)} /></div>
        <div className="field"><label>Tie-in TVD (m)</label><input inputMode="decimal" value={draft.TVD} onChange={event => update('TVD', event.target.value)} /></div>
      </div>
      <Message message={message} />
    </Modal>
  );
}
