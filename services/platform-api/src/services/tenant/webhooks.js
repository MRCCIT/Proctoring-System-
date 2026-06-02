import crypto from 'crypto';
import { query } from '../../config/database.js';

export async function listWebhooks(tenantId) {
  const { rows } = await query(
    `SELECT id, target_url, events, is_active, created_at, updated_at FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function createWebhook(tenantId, body) {
  const target_url = String(body.target_url || '').trim();
  if (!target_url) {
    const e = new Error('target_url is required');
    e.status = 422;
    throw e;
  }
  const events = Array.isArray(body.events) && body.events.length ? body.events : ['session.started', 'session.ended'];
  const signing_secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const { rows } = await query(
    `INSERT INTO webhooks (tenant_id, target_url, events, is_active, signing_secret)
     VALUES ($1, $2, $3::text[], $4, $5)
     RETURNING id, target_url, events, is_active, created_at`,
    [tenantId, target_url, events, body.is_active !== false, signing_secret]
  );
  return { ...rows[0], signing_secret };
}
