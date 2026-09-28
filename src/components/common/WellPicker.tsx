import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useDatabase, useDatabaseSnapshot } from '../../app/DatabaseContext';
import { preferences } from '../../services/preferences';
import { fmt } from '../../utils/format';

interface WellPickerProps {
  value: string;
  onChange: (name: string) => void;
  onEnter?: () => void;
  label?: string;
  placeholder?: string;
  id?: string;
}

function matchingNames(names: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return names;
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const index = name.toLowerCase().indexOf(q);
    if (index === 0) starts.push(name);
    else if (index > 0) contains.push(name);
  }
  return [...starts, ...contains];
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{name}</>;
  const index = name.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return <>{name}</>;
  return <>{name.slice(0, index)}<mark>{name.slice(index, index + q.length)}</mark>{name.slice(index + q.length)}</>;
}

export function WellPicker({ value, onChange, onEnter, label = 'Well', placeholder = 'Search wells', id }: WellPickerProps) {
  const database = useDatabase();
  const snapshot = useDatabaseSnapshot();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [favorites, setFavorites] = useState(() => new Set(preferences.getFavorites()));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  const grouped = useMemo(() => {
    const found = matchingNames(snapshot.names, query);
    const foundSet = new Set(found);
    const favorite = [...favorites]
      .filter(name => foundSet.has(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const favoriteSet = new Set(favorite);
    const recent = preferences.getRecent().filter(name => foundSet.has(name) && !favoriteSet.has(name));
    const recentSet = new Set(recent);
    const rest = found.filter(name => !favoriteSet.has(name) && !recentSet.has(name)).slice(0, 300);
    return { found, favorite, recent, rest, items: [...favorite, ...recent, ...rest] };
  }, [favorites, query, snapshot.names]);

  useEffect(() => setHighlight(grouped.items.length ? 0 : -1), [grouped.items.length, query]);

  const choose = (name: string) => {
    const record = database.get(name);
    if (!record) return;
    setQuery(record.name);
    setOpen(false);
    preferences.pushRecent(record.name);
    onChange(record.name);
  };

  const toggleFavorite = (event: MouseEvent, name: string) => {
    event.preventDefault();
    event.stopPropagation();
    setFavorites(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      preferences.setFavorites([...next]);
      return next;
    });
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      setOpen(true);
      setHighlight(current => Math.min(Math.max(current + 1, 0), grouped.items.length - 1));
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      setHighlight(current => Math.max(current - 1, 0));
      event.preventDefault();
    } else if (event.key === 'Enter') {
      if (open && highlight >= 0 && grouped.items[highlight]) {
        choose(grouped.items[highlight]);
        event.preventDefault();
      } else onEnter?.();
    } else if (event.key === 'Escape') setOpen(false);
  };

  const group = (title: string, names: string[], offset: number) => names.length ? <>
    <div className="picker-group">{title}</div>
    {names.map((name, index) => {
      const record = database.get(name);
      const itemIndex = offset + index;
      return <div
        className={`picker-opt ${itemIndex === highlight ? 'hi' : ''}`}
        key={name}
        onMouseDown={event => { event.preventDefault(); choose(name); }}
      >
        <button className={`star ${favorites.has(name) ? 'on' : ''}`} type="button" title="Toggle favourite" onMouseDown={event => toggleFavorite(event, name)}>{favorites.has(name) ? '★' : '☆'}</button>
        <span className="name"><HighlightedName name={name} query={query} /></span>
        <span className="meta">{record ? `${fmt(record.count, 0)} stn · ${fmt(record.mdMax, 0)} m` : ''}</span>
      </div>;
    })}
  </> : null;

  return <div className="field" ref={rootRef}>
    <label htmlFor={id}>{label}</label>
    <div className="picker">
      <input
        id={id}
        className="picker-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={keyDown}
        onBlur={() => window.setTimeout(() => {
          setOpen(false);
          const typed = query.trim();
          if (!typed) return;
          const exact = database.get(typed);
          if (exact) {
            setQuery(exact.name);
            if (exact.name !== value) onChange(exact.name);
          } else setQuery(value);
        }, 150)}
      />
      <button className="picker-clear" type="button" title="Clear" onMouseDown={event => { event.preventDefault(); setQuery(''); setOpen(true); onChange(''); }}>✕</button>
      <div className={`picker-menu ${open ? 'open' : ''}`}>
        {!grouped.found.length ? <div className="picker-empty">{snapshot.names.length ? `No well matches “${query}”` : 'The database is empty. Load a database first.'}</div> : <>
          {group('★ Favorites', grouped.favorite, 0)}
          {group('↻ Recent Wells', grouped.recent, grouped.favorite.length)}
          {group(`All Wells (${fmt(grouped.found.length, 0)})`, grouped.rest, grouped.favorite.length + grouped.recent.length)}
        </>}
      </div>
    </div>
  </div>;
}
