import { ProctorShieldClient } from '@proctorshield/sdk';
import { SessionTokenManager } from '@proctorshield/sdk/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const tokens = new SessionTokenManager('ps_superadmin_token');

export function getClient() {
  const accessToken = tokens.get() ?? undefined;
  return new ProctorShieldClient({ baseUrl: API_BASE, accessToken });
}

export { tokens as superAdminTokens };
