import { getTenantSdkRow } from './tenantLookup.js';
import { signShortLivedResourceToken } from '../../utils/jwt.js';
import { config } from '../../config/index.js';
import { query } from '../../config/database.js';
import { generateApiKey, hashApiKey, apiKeyPrefix } from '../../utils/apiKey.js';

export async function getSdkCredentials(tenantId) {
  const row = await getTenantSdkRow(tenantId);
  if (!row) return null;
  const status = row.integration_status || 'pending';
  return {
    api_key_prefix: row.api_key_prefix,
    tenant: { id: row.id, slug: row.slug, name: row.name, status: row.status },
    integration_status: status,
    sdk_activated: status === 'active' && Boolean(row.sdk_activated_at),
    sdk_activated_at: row.sdk_activated_at || null,
    sdk_version: row.sdk_version,
    sdk_install_snippet: {
      npm: '@proctorshield/sdk',
      usage: "import { ExamWindow } from '@proctorshield/sdk/exam-window';",
      api_base: config.publicApiBaseUrl,
    },
    note: 'Full API keys are only shown on create/rotate. Keys are stored hashed (SHA-256); plaintext is never saved.',
  };
}

export async function rotateTenantApiKey(tenantId) {
  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);
  const prefix = apiKeyPrefix(plainKey);
  const { rows } = await query(
    `UPDATE tenants
        SET api_key_hash = $1,
            api_key_prefix = $2,
            integration_status = 'pending',
            sdk_activated_at = NULL,
            updated_at = now()
      WHERE id = $3
      RETURNING id, slug, api_key_prefix, integration_status, sdk_activated_at, sdk_version`,
    [keyHash, prefix, tenantId]
  );
  if (!rows.length) return null;
  return { api_key: plainKey, tenant: rows[0] };
}

export function buildRecordingSignedUrl(tenantId, sessionId) {
  const ttl = config.signedLinkTtlSeconds;
  const token = signShortLivedResourceToken({ typ: 'recording', tid: tenantId, sid: sessionId }, ttl);
  return `${config.publicApiBaseUrl}/v1/media/recording?token=${encodeURIComponent(token)}`;
}

/** Short-lived URL for a single stored evidence file (recording chunk or snapshot). */
export function buildEvidenceSignedUrl(tenantId, kind, id, ttlSeconds = config.signedLinkTtlSeconds) {
  const token = signShortLivedResourceToken({ typ: 'evidence', tid: tenantId, kind, id: String(id) }, ttlSeconds);
  return `${config.publicApiBaseUrl}/v1/media/evidence?token=${encodeURIComponent(token)}`;
}

export function buildSessionReportSignedUrl(tenantId, sessionId) {
  const ttl = config.signedLinkTtlSeconds;
  const token = signShortLivedResourceToken({ typ: 'session_report', tid: tenantId, sid: sessionId }, ttl);
  return `${config.publicApiBaseUrl}/v1/media/session-report?token=${encodeURIComponent(token)}`;
}
