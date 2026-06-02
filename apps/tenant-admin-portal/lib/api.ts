import { ProctorShieldClient } from '@proctorshield/sdk';
import { SessionTokenManager } from '@proctorshield/sdk/core';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const tokens = new SessionTokenManager('ps_tenant_token');

export function getClient() {
  return new ProctorShieldClient({ baseUrl: API_BASE, accessToken: tokens.get() ?? undefined });
}

export { tokens as tenantTokens };
