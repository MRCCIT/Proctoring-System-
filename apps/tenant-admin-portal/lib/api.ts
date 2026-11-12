import { ProctorShieldClient } from '@proctorshield/sdk';
import { SessionTokenManager } from '@proctorshield/sdk/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const tokens = new SessionTokenManager('ps_tenant_token');
const PROFILE_KEY = 'ps_tenant_profile';

export interface TenantProfile {
  email?: string | null;
  name?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  role?: string | null;
  /** @deprecated legacy field; use tenant_name */
  org?: string | null;
}

export function getClient() {
  return new ProctorShieldClient({ baseUrl: API_BASE, accessToken: tokens.get() ?? undefined });
}

export function saveProfile(p: TenantProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function loadProfile(): TenantProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as TenantProfile) : null;
  } catch {
    return null;
  }
}

export function signOut() {
  tokens.clear();
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

export { tokens as tenantTokens };
