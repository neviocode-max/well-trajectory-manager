import { useEffect, useState } from 'react';
import { useDatabase, useDatabaseSnapshot } from './DatabaseContext';
import type { TrajectoryInputType } from '../engine/trajectory';
import { calculateConverterRow, type ConverterRowState } from '../services/trajectoryTools';

export const MIN_CONVERTER_ROWS = 8;

export function blankConverterRow(): ConverterRowState {
  return { well: '', input: '', output: null, error: '' };
}

export function createConverterRows(count = MIN_CONVERTER_ROWS): ConverterRowState[] {
  return Array.from({ length: Math.max(MIN_CONVERTER_ROWS, count) }, blankConverterRow);
}

/** Owned by the shell so navigating away does not discard the working table. */
export function useConverterWorkspace() {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const [inputType, setInputType] = useState<TrajectoryInputType>('mMD');
  const [rows, setRows] = useState<ConverterRowState[]>(() => createConverterRows());
  const [activeRow, setActiveRow] = useState<number | null>(null);

  useEffect(() => {
    setRows(current => current.map(row => row.well.trim() || row.input.trim() !== ''
      ? calculateConverterRow(database.get(row.well), row.well, inputType, row.input)
      : row));
    // Recalculate on database changes, including while another tab is open.
    // Changing input type keeps the converter's existing full-precision outputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.revision]);

  return { inputType, setInputType, rows, setRows, activeRow, setActiveRow };
}
