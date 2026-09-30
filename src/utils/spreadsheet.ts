import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

export function parseSpreadsheetPaste(text: string): string[][] {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => line.split('\t'));
}

export function moveSpreadsheetFocus(
  event: ReactKeyboardEvent<HTMLElement>,
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
): boolean {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (!target.matches(selector) || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (target.tagName === 'SELECT' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return false;

  const row = Number(target.dataset.row);
  const column = Number(target.dataset.gridCol);
  if (!Number.isInteger(row) || !Number.isInteger(column)) return false;

  let dr = 0;
  let dc = 0;
  if (event.key === 'Enter') dr = event.shiftKey ? -1 : 1;
  else if (event.key === 'ArrowUp') dr = -1;
  else if (event.key === 'ArrowDown') dr = 1;
  else if (event.key === 'ArrowLeft') {
    if (target instanceof HTMLInputElement && target.type === 'text' && target.selectionStart != null && target.selectionStart > 0) return false;
    dc = -1;
  } else if (event.key === 'ArrowRight') {
    if (target instanceof HTMLInputElement && target.type === 'text' && target.selectionEnd != null && target.selectionEnd < target.value.length) return false;
    dc = 1;
  } else return false;

  const next = rootRef.current?.querySelector<HTMLElement>(`${selector}[data-row="${row + dr}"][data-grid-col="${column + dc}"]`);
  if (!next) return false;
  event.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement) next.select();
  return true;
}
