import { query } from '../../config/database.js';
import { hashApiKey } from '../../utils/apiKey.js';

export async function findTenantByApiKey(plainKey) {
  const hash = hashApiKey(plainKey);
  const { rows } = await query(
    `SELECT id, slug, name, status, api_key_prefix, feature_flags FROM tenants WHERE api_key_hash = $1 LIMIT 1`,
    [hash]
  );
  return rows[0] || null;
}

export async function getTenantSdkRow(tenantId) {
  const { rows } = await query(
    `SELECT id, slug, name, status, api_key_prefix, integration_status, sdk_version FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0] || null;
}
