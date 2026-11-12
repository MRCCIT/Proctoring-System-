import './loadEnv.js';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  /** Base URL used in signed media/report links (no trailing slash) */
  publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  signedLinkTtlSeconds: parseInt(process.env.SIGNED_LINK_TTL_SECONDS || '900', 10),
  /** Comma-separated STUN/TURN URLs for SDK (first used as public STUN if no JSON) */
  turnUrls: process.env.TURN_URLS || 'stun:stun.l.google.com:19302',
  turnUsername: process.env.TURN_USERNAME || 'sdk',
  aiServiceUrl: (process.env.AI_SERVICE_URL || 'http://127.0.0.1:5055').replace(/\/$/, ''),
  aiServiceTimeoutMs: parseInt(process.env.AI_SERVICE_TIMEOUT_MS || '60000', 10),
  /** Candidate proctoring app origin used to build launch/access links (no trailing slash) */
  candidateAppUrl: (process.env.CANDIDATE_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  /** Tenant admin portal origin for invite/reset links (no trailing slash) */
  tenantAdminPortalUrl: (process.env.TENANT_ADMIN_PORTAL_URL || 'http://localhost:3200').replace(/\/$/, ''),
  inviteTokenTtlHours: parseInt(process.env.INVITE_TOKEN_TTL_HOURS || '72', 10) || 72,
  resetTokenTtlHours: parseInt(process.env.RESET_TOKEN_TTL_HOURS || '2', 10) || 2,
  launchTokenTtlSeconds: parseInt(process.env.LAUNCH_TOKEN_TTL_SECONDS || '1800', 10),
  turnCredentialTtlSeconds: parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS || '600', 10),
  /** Redis (optional) — counters, presence, policy cache */
  redisUrl: process.env.REDIS_URL || process.env.REDIS_URI || '',
  aiDegradationLevel: parseInt(process.env.AI_DEGRADATION_LEVEL || '0', 10) || 0,
  observabilityEnabled: process.env.OBSERVABILITY_ENABLED !== '0',
  observabilityIntervalMs: parseInt(process.env.OBSERVABILITY_INTERVAL_MS || '15000', 10),
  observabilityFlushMs: parseInt(process.env.OBSERVABILITY_FLUSH_MS || '5000', 10),
};
