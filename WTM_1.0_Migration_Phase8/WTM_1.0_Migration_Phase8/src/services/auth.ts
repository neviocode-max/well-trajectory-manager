export interface AuthClaim {
  type: string;
  value: string;
}

export interface AuthUser {
  id: string;
  name: string;
  provider: string;
  claims: AuthClaim[];
}

function claimsFrom(value: unknown): AuthClaim[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const type = String(source.typ ?? source.type ?? '').trim();
    const claimValue = String(source.val ?? source.value ?? '').trim();
    return type && claimValue ? [{ type, value: claimValue }] : [];
  });
}

function claimValue(claims: AuthClaim[], endings: string[]): string {
  const lower = endings.map(value => value.toLowerCase());
  const claim = claims.find(item => lower.some(end => item.type.toLowerCase() === end || item.type.toLowerCase().endsWith(`/${end}`)));
  return claim?.value || '';
}

/**
 * Read identity supplied by Azure App Service built-in authentication (EasyAuth).
 * WTM does not implement passwords or OAuth itself and intentionally discards any
 * provider access/refresh tokens that may also be present in /.auth/me.
 */
export async function getAppServiceUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch('/.auth/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;

    // Azure App Service shape: [{ user_id, user_name, provider_name, user_claims }]
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (!item || typeof item !== 'object') return null;
    const source = item as Record<string, unknown>;

    // Also accept the clientPrincipal shape used by related Azure hosting products.
    const principal = source.clientPrincipal && typeof source.clientPrincipal === 'object'
      ? source.clientPrincipal as Record<string, unknown>
      : source;
    const claims = claimsFrom(principal.user_claims ?? principal.claims);
    const id = String(principal.user_id ?? principal.userId ?? claimValue(claims, ['objectidentifier', 'oid']) ?? '').trim();
    const name = String(principal.user_name ?? principal.userDetails ?? claimValue(claims, ['name', 'preferred_username', 'email']) ?? '').trim();
    const provider = String(principal.provider_name ?? principal.identityProvider ?? 'aad').trim();

    if (!id && !name && !claims.length) return null;
    return { id, name: name || id || 'Authenticated user', provider, claims };
  } catch {
    return null;
  }
}
