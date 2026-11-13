import { query, pool as dbPool } from '../../config/database.js';
import { sendTenantAuthEmail } from './authEmail.js';
import { config } from '../../config/index.js';
import { writeAuditLog } from '../auditLogWriter.js';

const DEFAULT_SETTINGS = {
  min_risk_to_assign: 25,
  critical_threshold: 70,
  high_threshold: 45,
  medium_threshold: 25,
  include_low_risk: false,
  decay_half_life_seconds: 1800,
};

export function riskBand(score, settings = DEFAULT_SETTINGS) {
  const s = Number(score) || 0;
  if (s >= (settings.critical_threshold ?? 70)) return 'critical';
  if (s >= (settings.high_threshold ?? 45)) return 'high';
  if (s >= (settings.medium_threshold ?? 25)) return 'medium';
  return 'low';
}

export async function getProctorSettings(tenantId) {
  const { rows } = await query(`SELECT proctor_settings FROM tenants WHERE id = $1`, [tenantId]);
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.proctor_settings || {}) };
}

export async function updateProctorSettings(tenantId, patch) {
  const current = await getProctorSettings(tenantId);
  const next = { ...current, ...patch };
  await query(`UPDATE tenants SET proctor_settings = $2::jsonb, updated_at = now() WHERE id = $1`, [
    tenantId,
    JSON.stringify(next),
  ]);
  return next;
}

/** List proctors with capacity / workload for Team + assignment UI. */
export async function listProctorsWithCapacity(tenantId) {
  const { rows } = await query(
    `SELECT tu.id, tu.email, tu.display_name, tu.status, tu.role,
            tu.max_candidate_capacity, tu.last_active_at, tu.invited_at, tu.activated_at, tu.created_at,
            COALESCE((
              SELECT COUNT(*)::int FROM proctor_assignments pa
               WHERE pa.tenant_id = tu.tenant_id AND pa.proctor_user_id = tu.id AND pa.status = 'active'
                 AND pa.session_id IS NOT NULL
            ), 0) AS current_assigned,
            COALESCE((
              SELECT COUNT(DISTINCT pa.exam_id)::int FROM proctor_assignments pa
               WHERE pa.tenant_id = tu.tenant_id AND pa.proctor_user_id = tu.id AND pa.status = 'active'
                 AND pa.exam_id IS NOT NULL
            ), 0) AS active_exam_count
       FROM tenant_users tu
      WHERE tu.tenant_id = $1 AND tu.role = 'proctor'
      ORDER BY tu.created_at DESC`,
    [tenantId]
  );
  return rows.map((r) => ({
    ...r,
    available_capacity: Math.max(0, Number(r.max_candidate_capacity || 0) - Number(r.current_assigned || 0)),
  }));
}

export async function listEligibleSessions(tenantId, examId, settings) {
  const minRisk = settings.include_low_risk ? 0 : Number(settings.min_risk_to_assign ?? 25);
  const { rows } = await query(
    `SELECT s.id AS session_id, s.candidate_id, s.candidate_name, s.status,
            COALESCE(s.risk_score, 0) AS risk_score, s.highest_severity,
            c.name AS candidate_display_name, c.email AS candidate_email
       FROM exam_sessions s
       LEFT JOIN candidates c ON c.id = s.candidate_id
      WHERE s.tenant_id = $1
        AND s.exam_id = $2
        AND s.status IN ('active', 'paused', 'created', 'ready')
        AND COALESCE(s.risk_score, 0) >= $3
        AND NOT EXISTS (
          SELECT 1 FROM proctor_assignments pa
           WHERE pa.tenant_id = s.tenant_id
             AND pa.session_id = s.id
             AND pa.status = 'active'
        )
      ORDER BY COALESCE(s.risk_score, 0) DESC, s.id ASC`,
    [tenantId, examId, minRisk]
  );
  return rows.map((r) => ({
    ...r,
    risk_band: riskBand(r.risk_score, settings),
  }));
}

export async function getExamPool(tenantId, examId) {
  const { rows } = await query(
    `SELECT epp.*, tu.email, tu.display_name, tu.max_candidate_capacity, tu.status AS user_status,
            COALESCE((
              SELECT COUNT(*)::int FROM proctor_assignments pa
               WHERE pa.tenant_id = epp.tenant_id AND pa.proctor_user_id = epp.proctor_user_id
                 AND pa.status = 'active' AND pa.session_id IS NOT NULL
            ), 0) AS current_assigned
       FROM exam_proctor_pools epp
       JOIN tenant_users tu ON tu.id = epp.proctor_user_id
      WHERE epp.tenant_id = $1 AND epp.exam_id = $2 AND epp.status = 'active'
      ORDER BY tu.display_name NULLS LAST, tu.email`,
    [tenantId, examId]
  );
  return rows.map((r) => ({
    ...r,
    available_capacity: Math.max(0, Number(r.max_candidate_capacity || 0) - Number(r.current_assigned || 0)),
  }));
}

export async function setExamProctorPool(tenantId, examId, { proctor_user_ids, allocation_mode, auto_allocate, created_by }) {
  const ids = Array.isArray(proctor_user_ids) ? [...new Set(proctor_user_ids)] : [];
  const mode = allocation_mode === 'random' ? 'random' : 'risk_based';
  const auto = auto_allocate !== false;
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE exam_proctor_pools SET status = 'cancelled', updated_at = now()
        WHERE tenant_id = $1 AND exam_id = $2 AND status = 'active'
          AND NOT (proctor_user_id = ANY($3::uuid[]))`,
      [tenantId, examId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']]
    );
    for (const pid of ids) {
      await client.query(
        `INSERT INTO exam_proctor_pools
           (tenant_id, exam_id, proctor_user_id, allocation_mode, auto_allocate, status, created_by)
         VALUES ($1,$2,$3,$4,$5,'active',$6)
         ON CONFLICT (tenant_id, exam_id, proctor_user_id) DO UPDATE SET
           allocation_mode = EXCLUDED.allocation_mode,
           auto_allocate = EXCLUDED.auto_allocate,
           status = 'active',
           updated_at = now()`,
        [tenantId, examId, pid, mode, auto, created_by || null]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getExamPool(tenantId, examId);
}

function pickProctor(proctors, mode, index) {
  const available = proctors.filter((p) => p.available_capacity > 0 && p.user_status === 'active');
  if (!available.length) return null;
  if (mode === 'random') {
    return available[Math.floor(Math.random() * available.length)];
  }
  // risk_based: fair capacity-aware — prefer highest remaining capacity, rotate on ties
  available.sort((a, b) => b.available_capacity - a.available_capacity || a.proctor_user_id.localeCompare(b.proctor_user_id));
  return available[index % available.length];
}

/**
 * Allocate eligible unassigned sessions to pool proctors.
 * @returns summary
 */
export async function runAllocation(tenantId, examId, { mode, actorId, dry_run = false, notify = true } = {}) {
  const settings = await getProctorSettings(tenantId);
  const examPool = await getExamPool(tenantId, examId);
  if (!examPool.length) {
    const e = new Error('Select at least one active proctor for this exam');
    e.status = 422;
    throw e;
  }
  const allocationMode = mode || examPool[0].allocation_mode || 'risk_based';
  const eligible = await listEligibleSessions(tenantId, examId, settings);
  const totalCapacity = examPool.reduce((s, p) => s + p.available_capacity, 0);

  const preview = {
    exam_id: examId,
    allocation_mode: allocationMode,
    selected_proctors: examPool.length,
    eligible_candidates: eligible.length,
    available_capacity: totalCapacity,
    critical: eligible.filter((x) => x.risk_band === 'critical').length,
    high: eligible.filter((x) => x.risk_band === 'high').length,
    medium: eligible.filter((x) => x.risk_band === 'medium').length,
    low: eligible.filter((x) => x.risk_band === 'low').length,
    will_assign: Math.min(eligible.length, totalCapacity),
    unassigned_overflow: Math.max(0, eligible.length - totalCapacity),
  };

  if (dry_run) return { preview, assignments: [] };

  const working = examPool.map((p) => ({ ...p }));
  const created = [];
  const byProctor = new Map();
  let rr = 0;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    for (const cand of eligible) {
      const proctor = pickProctor(working, allocationMode, rr++);
      if (!proctor) break;
      try {
        const { rows } = await client.query(
          `INSERT INTO proctor_assignments
             (tenant_id, proctor_user_id, exam_id, session_id, candidate_id, role,
              assignment_type, status, risk_score_at_assignment, assignment_reason, assigned_by)
           VALUES ($1,$2,$3,$4,$5,'proctor',$6,'active',$7,$8,$9)
           RETURNING id, proctor_user_id, session_id, exam_id, risk_score_at_assignment, created_at`,
          [
            tenantId,
            proctor.proctor_user_id,
            examId,
            cand.session_id,
            cand.candidate_id || null,
            allocationMode,
            cand.risk_score,
            `auto:${cand.risk_band}`,
            actorId || null,
          ]
        );
        const row = rows[0];
        created.push({
          ...row,
          risk_band: cand.risk_band,
          candidate_name: cand.candidate_name || cand.candidate_display_name,
        });
        proctor.available_capacity -= 1;
        proctor.current_assigned = Number(proctor.current_assigned || 0) + 1;
        if (!byProctor.has(proctor.proctor_user_id)) {
          byProctor.set(proctor.proctor_user_id, { proctor, items: [] });
        }
        byProctor.get(proctor.proctor_user_id).items.push({ ...cand, assignment_id: row.id });
      } catch (err) {
        if (err.code === '23505') continue; // already owned
        throw err;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  void writeAuditLog({
    actorType: 'tenant_user',
    actorId: actorId,
    action: 'proctor.allocation.run',
    resourceType: 'exam',
    resourceId: examId,
    tenantId,
    details: { ...preview, assigned: created.length, mode: allocationMode },
  }).catch(() => {});

  if (notify) {
    for (const [, bundle] of byProctor) {
      void notifyProctorAssignment(tenantId, examId, bundle.proctor, bundle.items).catch(() => {});
    }
  }

  return { preview: { ...preview, assigned: created.length }, assignments: created };
}

async function notifyProctorAssignment(tenantId, examId, proctor, items) {
  const { rows: exams } = await query(`SELECT title FROM exams WHERE id = $1 AND tenant_id = $2`, [examId, tenantId]);
  const examName = exams[0]?.title || 'Exam';
  const settings = await getProctorSettings(tenantId);
  const critical = items.filter((i) => riskBand(i.risk_score, settings) === 'critical').length;
  const high = items.filter((i) => riskBand(i.risk_score, settings) === 'high').length;
  const other = items.length - critical - high;
  const link = `${config.tenantAdminPortalUrl}/proctor/candidates?exam_id=${encodeURIComponent(examId)}`;
  await sendTenantAuthEmail({
    to: proctor.email,
    subject: `New Candidate Monitoring Assignment – ${examName}`,
    url: link,
    body: `You have been assigned ${items.length} candidates for monitoring in ${examName}.

Critical-risk candidates: ${critical}
High-risk candidates: ${high}
Other eligible candidates: ${other}

Open your assigned candidate dashboard: ${link}`,
  });
}

export async function listMyAssignments(tenantId, proctorUserId, { examId } = {}) {
  const params = [tenantId, proctorUserId];
  let extra = '';
  if (examId) {
    params.push(examId);
    extra = ` AND pa.exam_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT pa.id AS assignment_id, pa.exam_id, pa.session_id, pa.candidate_id, pa.status,
            pa.risk_score_at_assignment, pa.assignment_type, pa.assignment_reason, pa.created_at,
            s.status AS session_status, s.candidate_name, COALESCE(s.risk_score, 0) AS risk_score,
            s.highest_severity, s.updated_at AS session_updated_at,
            e.title AS exam_title,
            (
              SELECT MAX(se.occurred_at) FROM session_events se
               WHERE se.session_id = s.id AND se.tenant_id = pa.tenant_id
                 AND se.severity IN ('warn','flag','critical')
            ) AS last_violation_at,
            (
              SELECT COUNT(*)::int FROM session_events se
               WHERE se.session_id = s.id AND se.tenant_id = pa.tenant_id
                 AND se.severity IN ('warn','flag','critical')
                 AND COALESCE(se.review_status, 'open') <> 'dismissed'
            ) AS violation_count
       FROM proctor_assignments pa
       JOIN exam_sessions s ON s.id = pa.session_id
       LEFT JOIN exams e ON e.id = pa.exam_id
      WHERE pa.tenant_id = $1 AND pa.proctor_user_id = $2 AND pa.status = 'active'
        AND pa.session_id IS NOT NULL
        ${extra}
      ORDER BY COALESCE(s.risk_score, 0) DESC, pa.created_at DESC`,
    params
  );
  const settings = await getProctorSettings(tenantId);
  return rows.map((r) => ({ ...r, risk_band: riskBand(r.risk_score, settings) }));
}

export async function completeAssignmentsForExam(tenantId, examId) {
  await query(
    `UPDATE proctor_assignments
        SET status = 'completed', completed_at = now()
      WHERE tenant_id = $1 AND exam_id = $2 AND status = 'active'`,
    [tenantId, examId]
  );
}

export async function reassignSession(tenantId, sessionId, toProctorId, actorId) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const { rows: cur } = await client.query(
      `SELECT * FROM proctor_assignments
        WHERE tenant_id = $1 AND session_id = $2 AND status = 'active'
        FOR UPDATE`,
      [tenantId, sessionId]
    );
    const existing = cur[0];
    if (existing) {
      await client.query(
        `UPDATE proctor_assignments
            SET status = 'reassigned', reassigned_at = now()
          WHERE id = $1`,
        [existing.id]
      );
    }
    const { rows: sess } = await client.query(
      `SELECT id, exam_id, candidate_id, risk_score FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
    if (!sess[0]) {
      const e = new Error('Session not found');
      e.status = 404;
      throw e;
    }
    const { rows } = await client.query(
      `INSERT INTO proctor_assignments
         (tenant_id, proctor_user_id, exam_id, session_id, candidate_id, role,
          assignment_type, status, risk_score_at_assignment, assignment_reason, assigned_by)
       VALUES ($1,$2,$3,$4,$5,'proctor','manual','active',$6,'manual_reassign',$7)
       RETURNING *`,
      [
        tenantId,
        toProctorId,
        sess[0].exam_id,
        sessionId,
        sess[0].candidate_id,
        sess[0].risk_score,
        actorId || null,
      ]
    );
    await client.query('COMMIT');
    void writeAuditLog({
      actorType: 'tenant_user',
      actorId: actorId,
      action: 'proctor.assignment.reassign',
      resourceType: 'session',
      resourceId: sessionId,
      tenantId,
      details: { to: toProctorId, from: existing?.proctor_user_id || null },
    }).catch(() => {});
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
