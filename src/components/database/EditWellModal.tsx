import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Message, type MessageState } from '../common/Message';
import type { EditableSurveyRow } from '../../types/database';
import type { WellRecord } from '../../types/well';
import { raw } from '../../utils/format';

interface EditableRow extends EditableSurveyRow {
  selected: boolean;
}

interface Props {
  record: WellRecord | null;
  onClose: () => void;
  onSave: (oldName: string, newName: string, rows: EditableSurveyRow[]) => void;
}

const FIELDS: Array<keyof EditableSurveyRow> = ['MD', 'X', 'Y', 'Z', 'TVD', 'Azimuth', 'Inclination', 'NOTES'];

export function EditWellModal({ record, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    if (!record) return;
    setName(record.name);
    setRows(record.rows.map(station => ({
      MD: raw(station.MD),
      X: raw(station.X),
      Y: raw(station.Y),
      Z: raw(station.Z),
      TVD: raw(station.TVD),
      Azimuth: raw(station.Azimuth),
      Inclination: raw(station.Inclination),
      SURV_Type: station.SURV_Type,
      BHT: station.BHT,
      NOTES: station.NOTES,
      selected: false,
    })));
    setMessage(null);
  }, [record]);

  if (!record) return null;

  const updateCell = (index: number, field: keyof EditableSurveyRow, value: string) => {
    const next = rows.slice();
    next[index] = { ...next[index], [field]: value };
    setRows(next);
  };

  const deleteSelected = () => {
    const count = rows.filter(row => row.selected).length;
    if (!count) {
      setMessage({ kind: 'warn', text: 'Select one or more survey stations first.' });
      return;
    }
    setRows(rows.filter(row => !row.selected));
    setMessage(null);
  };

  const save = () => {
    try {
      onSave(record.name, name, rows.map(({ selected: _selected, ...row }) => row));
      onClose();
    } catch (error) {
      setMessage({ kind: 'bad', text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Modal
      open={Boolean(record)}
      title="Edit Well Data"
      subtitle="Changes are validated and re-indexed when saved; missing directional angles are derived where required."
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={save}>Save Changes</button>
        </>
      )}
    >
      <div className="row">
        <div className="field grow"><label>Well Name</label><input value={name} onChange={event => setName(event.target.value)} /></div>
        <button type="button" onClick={() => setRows([...rows, { MD: '', X: '', Y: '', Z: '', TVD: '', Azimuth: '', Inclination: '', selected: false }])}>Add Row</button>
        <button type="button" className="danger" onClick={deleteSelected}>Delete Selected</button>
      </div>
      <Message message={message} />
      <div className="table-wrap edit-table-wrap">
        <table className="db-edit-table">
          <thead><tr><th></th>{FIELDS.map(field => <th key={field}>{field}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td><input type="checkbox" checked={row.selected} onChange={event => {
                  const next = rows.slice();
                  next[rowIndex] = { ...next[rowIndex], selected: event.target.checked };
                  setRows(next);
                }} /></td>
                {FIELDS.map(field => (
                  <td key={field}>
                    <input
                      type="text"
                      inputMode={field === 'NOTES' ? 'text' : 'decimal'}
                      value={String(row[field] ?? '')}
                      onChange={event => updateCell(rowIndex, field, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
