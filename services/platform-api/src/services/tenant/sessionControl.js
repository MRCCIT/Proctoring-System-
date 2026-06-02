import { query } from '../../config/database.js';

async function logExtension(tenantId, sessionId, actor, action, extraSeconds, note) {
  await query(
    `INSERT INTO session_extensions (tenant_id, session_id, actor_type, actor_id, action, extra_seconds, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, sessionId, actor?.type || 'system', actor?.id || null, action, extraSeconds || null, note || null]
  );
}

async function loadSession(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT * FROM exam_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  return rows[0] || null;
}

export async function pauseSession(tenantId, sessionId, body = {}, actor) {
  const s = await loadSession(tenantId, sessionId);
  if (!s) return { notFound: true };
  if (s.status !== 'active') return { invalid: true, status: s.status };
  const { rows } = await query(
    `UPDATE exam_sessions SET status = 'paused', paused_at = now(), updated_at = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, status, paused_at`,
    [sessionId, tenantId]
  );
  await logExtension(tenantId, sessionId, actor, 'pause', null, body.note || null);
  return { session: rows[0] };
}

export async function resumeSession(tenantId, sessionId, body = {}, actor) {
  const s = await loadSession(tenantId, sessionId);
  if (!s) return { notFound: true };
  if (s.status !== 'paused') return { invalid: true, status: s.status };
  const { rows } = await query(
    `UPDATE exam_sessions SET status = 'active', paused_at = NULL, updated_at = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, status`,
    [sessionId, tenantId]
  );
  await logExtension(tenantId, sessionId, actor, 'resume', null, body.note || null);
  return { session: rows[0] };
}

export async function extendSession(tenantId, sessionId, body = {}, actor) {
  const seconds = parseInt(body.extra_seconds, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    const e = new Error('extra_seconds must be a positive integer');
    e.status = 422;
    throw e;
  }
  const s = await loadSession(tenantId, sessionId);
  if (!s) return { notFound: true };
  const { rows } = await query(
    `UPDATE exam_sessions SET extra_seconds = extra_seconds + $1,
       scheduled_end = COALESCE(scheduled_end, now()) + ($1::int * interval '1 second'),
       updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, scheduled_end, extra_seconds`,
    [seconds, sessionId, tenantId]
  );
  await logExtension(tenantId, sessionId, actor, 'extend', seconds, body.note || null);
  return { session: rows[0] };
}

export async function annotateSession(tenantId, sessionId, body = {}, actor) {
  const note = String(body.note || '').trim();
  if (!note) {
    const e = new Error('note is required');
    e.status = 422;
    throw e;
  }
  const entry = {
    note,
    actor: actor || null,
    created_at: new Date().toISOString(),
  };
  const { rows } = await query(
    `UPDATE exam_sessions
     SET proctor_notes_json = proctor_notes_json || $1::jsonb,
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, proctor_notes_json`,
    [JSON.stringify([entry]), sessionId, tenantId]
  );
  if (!rows.length) return { notFound: true };
  return { session: rows[0] };
}

export async function listProctorAssignments(tenantId, { examId, sessionId, proctorUserId }) {
  const params = [tenantId];
  let where = 'WHERE pa.tenant_id = $1';
  if (examId) {
    params.push(examId);
    where += ` AND pa.exam_id = $${params.length}`;
  }
  if (sessionId) {
    params.push(sessionId);
    where += ` AND (pa.session_id = $${params.length} OR (pa.exam_id IS NOT NULL AND pa.exam_id = (SELECT exam_id FROM exam_sessions WHERE id = $${params.length})))`;
  }
  if (proctorUserId) {
    params.push(proctorUserId);
    where += ` AND pa.proctor_user_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT pa.id, pa.exam_id, pa.session_id, pa.proctor_user_id, pa.role, pa.created_at,
            tu.email AS proctor_email, tu.display_name AS proctor_name
     FROM proctor_assignments pa
     LEFT JOIN tenant_users tu ON tu.id = pa.proctor_user_id
     ${where}
     ORDER BY pa.created_at DESC`,
    params
  );
  return rows;
}

export async function assignProctor(tenantId, body) {
  const proctor_user_id = body.proctor_user_id;
  if (!proctor_user_id) {
    const e = new Error('proctor_user_id is required');
    e.status = 422;
    throw e;
  }
  const exam_id = body.exam_id || null;
  const session_id = body.session_id || null;
  if (!exam_id && !session_id) {
    const e = new Error('Provide exam_id or session_id');
    e.status = 422;
    throw e;
  }
  const role = body.role || 'proctor';
  const { rows } = await query(
    `INSERT INTO proctor_assignments (tenant_id, proctor_user_id, exam_id, session_id, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, exam_id, session_id, proctor_user_id, role, created_at`,
    [tenantId, proctor_user_id, exam_id, session_id, role]
  );
  return rows[0];
}

export async function removeProctorAssignment(tenantId, id) {
  const { rowCount } = await query(
    `DELETE FROM proctor_assignments WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return rowCount > 0;
}

export async function listSessionExtensions(tenantId, sessionId) {
  const { rows } = await query(
    `SELECT id, actor_type, actor_id, action, extra_seconds, note, created_at
     FROM session_extensions
     WHERE tenant_id = $1 AND session_id = $2
     ORDER BY created_at ASC`,
    [tenantId, sessionId]
  );
  return rows;
}
