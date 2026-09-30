const THEME_KEY = 'wtc.theme';
const FAVORITES_KEY = 'wtc.favorites';
const RECENT_KEY = 'wtc.recent';

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are best-effort, matching WTM 4.3 behavior.
  }
}

export type Theme = 'dark' | 'light';

export const preferences = {
  getTheme(): Theme {
    const value = read<string>(THEME_KEY, 'dark');
    return value === 'light' ? 'light' : 'dark';
  },
  setTheme(theme: Theme): void {
    write(THEME_KEY, theme);
  },
  getFavorites(): string[] {
    return read<string[]>(FAVORITES_KEY, []);
  },
  setFavorites(names: string[]): void {
    write(FAVORITES_KEY, names);
  },
  getRecent(): string[] {
    return read<string[]>(RECENT_KEY, []);
  },
  pushRecent(name: string): void {
    if (!name) return;
    const next = [name, ...this.getRecent().filter(item => item !== name)].slice(0, 10);
    write(RECENT_KEY, next);
  },
};
