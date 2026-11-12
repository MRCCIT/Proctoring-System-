import { ProctorShieldClient } from '@proctorshield/sdk';
import { SessionTokenManager } from '@proctorshield/sdk/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const tokens = new SessionTokenManager('ps_superadmin_token');
const PROFILE_KEY = 'ps_superadmin_profile';

export type SuperProfile = {
  email?: string | null;
  name?: string | null;
};

export function getClient() {
  const accessToken = tokens.get() ?? undefined;
  return new ProctorShieldClient({ baseUrl: API_BASE, accessToken });
}

export function saveProfile(p: SuperProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function loadProfile(): SuperProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as SuperProfile) : null;
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

export { tokens as superAdminTokens };
