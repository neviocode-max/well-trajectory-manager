export type AuthMode = 'off' | 'appservice';

export interface RuntimeConfig {
  authMode: AuthMode;
  environment: string;
  version: string;
}

const FALLBACK: RuntimeConfig = {
  authMode: 'off',
  environment: 'local',
  version: '1.0.0',
};

let cached: Promise<RuntimeConfig> | null = null;

function normalize(value: unknown): RuntimeConfig {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    authMode: source.authMode === 'appservice' ? 'appservice' : 'off',
    environment: typeof source.environment === 'string' && source.environment.trim() ? source.environment.trim() : FALLBACK.environment,
    version: typeof source.version === 'string' && source.version.trim() ? source.version.trim() : FALLBACK.version,
  };
}

/** Runtime settings are served by the Node host in production. Vite dev mode
 * intentionally falls back to local/off when the endpoint does not exist. */
export function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  cached = fetch('/api/runtime-config', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(async response => response.ok ? normalize(await response.json()) : FALLBACK)
    .catch(() => FALLBACK);
  return cached;
}
