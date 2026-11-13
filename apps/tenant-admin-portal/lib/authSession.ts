import { loadProfile, tenantTokens, type TenantProfile } from './api';

export type TokenClaims = {
  exp?: number;
  impersonation?: boolean;
  impersonator_email?: string;
  email?: string;
  role?: string;
};

export function decodeJwtPayload(token: string): TokenClaims | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

export function getAccessTokenClaims(): TokenClaims | null {
  const token = tenantTokens.get();
  if (!token) return null;
  return decodeJwtPayload(token);
}

/** Seconds until JWT exp; null if unknown / no token. Negative if already expired. */
export function getTokenSecondsRemaining(): number | null {
  const claims = getAccessTokenClaims();
  if (!claims?.exp) return null;
  return claims.exp - Math.floor(Date.now() / 1000);
}

export function isTokenExpired(): boolean {
  const rem = getTokenSecondsRemaining();
  return rem !== null && rem <= 0;
}

/** Warn when fewer than this many seconds remain. */
export const TOKEN_WARN_SECONDS = 10 * 60;

export function isTokenNearExpiry(warnSeconds = TOKEN_WARN_SECONDS): boolean {
  const rem = getTokenSecondsRemaining();
  return rem !== null && rem > 0 && rem <= warnSeconds;
}

/**
 * Impersonation is defined by the JWT claim — not a stale localStorage profile flag.
 * After a normal tenant login the new token has no `impersonation` claim, so banners clear.
 */
export function isImpersonationSession(_profile?: TenantProfile | null): boolean {
  return Boolean(getAccessTokenClaims()?.impersonation);
}

/** Keep local profile flag aligned with the live token (fixes leftover SA handoff state). */
export function syncProfileWithToken(profile: TenantProfile | null): TenantProfile | null {
  if (!profile) return null;
  const claims = getAccessTokenClaims();
  const imp = Boolean(claims?.impersonation);
  if (Boolean(profile.impersonation) === imp) {
    if (!imp || profile.impersonator_email) return profile;
  }
  const next: TenantProfile = {
    ...profile,
    impersonation: imp,
    impersonator_email: imp
      ? profile.impersonator_email ||
        (typeof claims?.impersonator_email === 'string' ? claims.impersonator_email : null)
      : null,
  };
  return next;
}

export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'expired';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function currentProfile(): TenantProfile | null {
  return loadProfile();
}
