import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { getAppServiceUser, type AuthUser } from '../services/auth';
import { getRuntimeConfig, type RuntimeConfig } from '../services/runtimeConfig';

interface AuthState {
  config: RuntimeConfig;
  user: AuthUser | null;
  loading: boolean;
}

const DEFAULT_CONFIG: RuntimeConfig = { authMode: 'off', environment: 'local', version: '1.0.0' };
const AuthContext = createContext<AuthState>({ config: DEFAULT_CONFIG, user: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_CONFIG);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const runtime = await getRuntimeConfig();
      if (cancelled) return;
      setConfig(runtime);
      const nextUser = runtime.authMode === 'appservice' ? await getAppServiceUser() : null;
      if (!cancelled) {
        setUser(nextUser);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ config, user, loading }), [config, user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
