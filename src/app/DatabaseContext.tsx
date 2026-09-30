import { createContext, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { WellDatabase } from '../data/database';
import type { DatabaseSnapshot } from '../types/database';

const DatabaseContext = createContext<WellDatabase | null>(null);

export function DatabaseProvider({ children }: PropsWithChildren) {
  const database = useMemo(() => new WellDatabase(), []);
  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): WellDatabase {
  const database = useContext(DatabaseContext);
  if (!database) throw new Error('useDatabase must be used inside DatabaseProvider.');
  return database;
}

export function useDatabaseSnapshot(): DatabaseSnapshot {
  const database = useDatabase();
  return useSyncExternalStore(
    callback => database.subscribe(callback),
    () => database.getSnapshot(),
    () => database.getSnapshot(),
  );
}
