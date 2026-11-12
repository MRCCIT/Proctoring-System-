import { query } from '../../config/database.js';
import { isUuid } from '../../utils/validation.js';
import { assignProctor, annotateSession } from './sessionControl.js';
import { postProctorChatMessage } from './chat.js';

const MAX_BULK = 200;

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

async function sessionOwned(tenantId, sessionId) {
  const { rows } = await query(`SELECT id FROM exam_sessions WHERE id = $1 AND tenant_id = $2`, [sessionId, tenantId]);
  return Boolean(rows[0]);
}

export async function bulkSessionActions(tenantId, body, actor, ctx) {
  const action = body?.action;
  if (!['assign_reviewer', 'flag', 'message'].includes(action)) {
    fail(422, "action must be 'assign_reviewer', 'flag', or 'message'");
  }
  const session_ids = Array.isArray(body.session_ids) ? body.session_ids.map(String) : [];
  if (!session_ids.length) fail(422, 'session_ids must be a non-empty array');
  if (session_ids.length > MAX_BULK) fail(422, `At most ${MAX_BULK} session_ids per request`);
  for (const id of session_ids) {
    if (!isUuid(id)) fail(422, `Invalid session id: ${id}`);
  }

  const results = [];
  let ok = 0;
  let failed = 0;

  if (action === 'assign_reviewer') {
    let proctor_user_id = body.proctor_user_id || null;
    if (!proctor_user_id && ctx?.authMode === 'jwt' && ctx.userId) {
      proctor_user_id = ctx.userId;
    }
    if (!proctor_user_id) fail(422, 'proctor_user_id is required when not using a tenant admin JWT');

    for (const session_id of session_ids) {
      try {
        if (!(await sessionOwned(tenantId, session_id))) {
          results.push({ session_id, ok: false, error: 'not_found' });
          failed += 1;
          continue;
        }
        await assignProctor(tenantId, { proctor_user_id, session_id });
        results.push({ session_id, ok: true });
        ok += 1;
      } catch (e) {
        results.push({ session_id, ok: false, error: e.message || 'error' });
        failed += 1;
      }
    }
    return { action, ok, failed, results };
  }

  if (action === 'flag') {
    const note = body.note != null ? String(body.note).trim().slice(0, 4000) : '';
    const reviewer = actor?.email || actor?.id || null;
    for (const session_id of session_ids) {
      try {
        const { rowCount } = await query(
          `UPDATE exam_sessions
             SET review_decision = 'flagged',
                 review_status = 'reviewed',
                 review_summary = COALESCE(NULLIF($3, ''), review_summary),
                 reviewed_by = COALESCE($4, reviewed_by),
                 reviewed_at = now(),
                 updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [session_id, tenantId, note, reviewer]
        );
        if (!rowCount) {
          results.push({ session_id, ok: false, error: 'not_found' });
          failed += 1;
          continue;
        }
        if (note) {
          await annotateSession(tenantId, session_id, { note: `[Bulk flag] ${note}` }, actor).catch(() => {});
        }
        results.push({ session_id, ok: true });
        ok += 1;
      } catch (e) {
        results.push({ session_id, ok: false, error: e.message || 'error' });
        failed += 1;
      }
    }
    return { action, ok, failed, results };
  }

  const text = String(body.message || body.note || '').trim();
  if (!text) fail(422, 'message or note is required for message action');

  for (const session_id of session_ids) {
    try {
      if (!(await sessionOwned(tenantId, session_id))) {
        results.push({ session_id, ok: false, error: 'not_found' });
        failed += 1;
        continue;
      }
      const ann = await annotateSession(tenantId, session_id, { note: text }, actor);
      if (ann.notFound) {
        results.push({ session_id, ok: false, error: 'not_found' });
        failed += 1;
        continue;
      }
      await postProctorChatMessage(tenantId, session_id, { message: text }, actor).catch(() => {});
      results.push({ session_id, ok: true });
      ok += 1;
    } catch (e) {
      results.push({ session_id, ok: false, error: e.message || 'error' });
      failed += 1;
    }
  }
  return { action, ok, failed, results };
}
