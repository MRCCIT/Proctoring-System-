import { query } from '../../config/database.js';
import { getTenantsCompare } from '../analyticsService.js';
import { getLaneStats } from '../queue/laneStats.js';
import { getGlobalPolicies } from './policies.js';

async function upsertRec(rec) {
  try {
    const { rows: ex } = await query(
      `SELECT id FROM optimization_recommendations WHERE status = 'open' AND title = $1 LIMIT 1`,
      [rec.title]
    );
    if (ex[0]) {
      await query(
        `UPDATE optimization_recommendations SET evidence = $2::jsonb, updated_at = now() WHERE id = $1`,
        [ex[0].id, JSON.stringify(rec.evidence || {})]
      );
      return ex[0].id;
    }
    const { rows } = await query(
      `INSERT INTO optimization_recommendations
        (category, severity, title, problem, evidence, affected_service, affected_tenant_id,
         recommended_action, expected_benefit, risk_level, requires_approval)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::uuid,$8,$9,$10,$11)
       RETURNING id`,
      [
        rec.category || 'capacity',
        rec.severity || 'medium',
        rec.title,
        rec.problem || null,
        JSON.stringify(rec.evidence || {}),
        rec.affected_service || null,
        rec.affected_tenant_id || null,
        rec.recommended_action || null,
        rec.expected_benefit || null,
        rec.risk_level || 'low',
        rec.requires_approval !== false,
      ]
    );
    return rows[0].id;
  } catch {
    return null;
  }
}

/** OBSERVE mode only — never auto-enforces. */
export async function generateRecommendations() {
  const policies = await getGlobalPolicies();
  if ((policies.policies.optimization_mode || 'OBSERVE') === 'ENFORCE') {
    /* still only generate; enforcement is explicit approve */
  }

  const compare = await getTenantsCompare().catch(() => []);
  for (const t of compare || []) {
    const storage = Number(t.storage_bytes || 0);
    if (storage > 4 * 1024 * 1024 * 1024) {
      await upsertRec({
        category: 'cost',
        severity: 'medium',
        title: `High storage: ${t.name}`,
        problem: 'Tenant storage consumption is elevated',
        evidence: { storage_bytes: t.storage_bytes },
        affected_service: 'media',
        affected_tenant_id: t.tenant_id,
        recommended_action: 'Review retention policy and raise storage quota only if contractually required',
        expected_benefit: 'Reduce disk pressure and egress cost',
        risk_level: 'low',
      });
    }
    if (Number(t.active_sessions || 0) > 40) {
      await upsertRec({
        category: 'capacity',
        severity: 'high',
        title: `High live load: ${t.name}`,
        problem: 'Many concurrent sessions may stress WS/media/AI',
        evidence: { active_sessions: t.active_sessions },
        affected_service: 'admission',
        affected_tenant_id: t.tenant_id,
        recommended_action: 'Confirm concurrent quota headroom and AI concurrency for this tenant',
        expected_benefit: 'Avoid admission spikes and AI backlog',
        risk_level: 'medium',
      });
    }
  }

  const lanes = getLaneStats();
  const p4 = lanes.lanes?.P4?.deferred || 0;
  const p2 = lanes.lanes?.P2?.deferred || 0;
  if (p2 + p4 > 20) {
    await upsertRec({
      category: 'performance',
      severity: 'medium',
      title: 'Background lane backlog',
      problem: 'P2/P4 work is being deferred under load',
      evidence: { lanes: lanes.lanes },
      affected_service: 'queue',
      recommended_action: 'Increase P2/P4 workers or keep load level until API p95 recovers',
      expected_benefit: 'Clear export/analytics backlog without touching P0/P1',
      risk_level: 'low',
    });
  }
}

export async function listRecommendations({ status = 'open', limit = 50 } = {}) {
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  try {
    const { rows } = await query(
      `SELECT r.*, t.name AS tenant_name
         FROM optimization_recommendations r
         LEFT JOIN tenants t ON t.id = r.affected_tenant_id
        WHERE ($1::text IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [status || null, lim]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function decideRecommendation(id, decision, { actor } = {}) {
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { rows } = await query(
    `UPDATE optimization_recommendations
        SET status = $2, decided_by = $3, decided_at = now(), updated_at = now()
      WHERE id = $1::uuid AND status = 'open'
      RETURNING *`,
    [id, status, actor || 'superadmin']
  );
  return rows[0] || null;
}
