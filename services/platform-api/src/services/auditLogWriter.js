import { query } from '../config/database.js';

export async function writeAuditLog({
  tenantId = null,
  actorType,
  actorId,
  action,
  resourceType = null,
  resourceId = null,
  details = {},
}) {
  await query(
    `INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, resource_type, resource_id, details)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      tenantId,
      actorType,
      actorId,
      action,
      resourceType,
      resourceId,
      JSON.stringify(details),
    ]
  );
}
