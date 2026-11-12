import { query } from '../../config/database.js';
import { config } from '../../config/index.js';
import { DEFAULT_LOCKDOWN_POLICY } from './policy.js';
import { signPolicy } from './sign.js';

function signingSecret() {
  return process.env.LOCKDOWN_SIGNING_SECRET || config.jwtSecret;
}

export async function getLatestLockdownPolicy(tenantId, examId) {
  const { rows } = await query(
    `SELECT * FROM lockdown_policies WHERE tenant_id = $1 AND exam_id = $2 ORDER BY version DESC LIMIT 1`,
    [tenantId, examId]
  );
  return rows[0] || null;
}

export async function getOrCreateExamLockdownPolicy(tenantId, examId) {
  const existing = await getLatestLockdownPolicy(tenantId, examId);
  if (existing) {
    return {
      exam_id: examId,
      version: existing.version,
      policy: existing.policy,
      signature: existing.signature,
      signed_at: existing.signed_at,
    };
  }
  return putExamLockdownPolicy(tenantId, examId, DEFAULT_LOCKDOWN_POLICY);
}

export async function putExamLockdownPolicy(tenantId, examId, policyInput) {
  const latest = await getLatestLockdownPolicy(tenantId, examId);
  const version = (latest?.version || 0) + 1;
  const policy = { ...DEFAULT_LOCKDOWN_POLICY, ...(policyInput || {}), version };
  const { signature, signed_at } = signPolicy(policy, signingSecret(), examId);
  const { rows } = await query(
    `INSERT INTO lockdown_policies (exam_id, tenant_id, version, policy, signature, signed_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     RETURNING *`,
    [examId, tenantId, version, JSON.stringify(policy), signature, signed_at]
  );
  const row = rows[0];
  return {
    exam_id: examId,
    version: row.version,
    policy: row.policy,
    signature: row.signature,
    signed_at: row.signed_at,
  };
}
