import { useState } from 'react';
import { Modal } from '../common/Modal';
import type { AppendMode } from '../../types/database';

interface Props {
  open: boolean;
  duplicates: string[];
  onCancel: () => void;
  onApply: (mode: AppendMode) => void;
}

export function DuplicateWellModal({ open, duplicates, onCancel, onApply }: Props) {
  const [mode, setMode] = useState<AppendMode>('skip');
  return (
    <Modal
      open={open}
      title="Duplicate Well Names"
      subtitle={`${duplicates.length} incoming well name(s) already exist in the database.`}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={() => onApply(mode)}>Apply</button>
        </>
      )}
    >
      <div className="radio-stack">
        <label><input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} /> Skip existing wells</label>
        <label><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace existing wells</label>
        <label><input type="radio" checked={mode === 'rename'} onChange={() => setMode('rename')} /> Keep incoming wells as renamed copies</label>
      </div>
      <div className="duplicate-list">{duplicates.slice(0, 200).map(name => <div key={name}>{name}</div>)}</div>
    </Modal>
  );
}
