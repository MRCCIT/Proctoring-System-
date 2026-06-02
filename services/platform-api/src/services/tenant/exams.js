import { query } from '../../config/database.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function listExams(tenantId, { cursor, limit: rawLimit }) {
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId];
  let where = 'WHERE e.tenant_id = $1';
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (e.created_at, e.id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT e.* FROM exams e ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return { items: slice, next_cursor };
}

export async function createExam(tenantId, body) {
  const title = String(body.title || '').trim();
  if (!title) {
    const e = new Error('title is required');
    e.status = 422;
    throw e;
  }
  const { rows } = await query(
    `INSERT INTO exams (tenant_id, title, description, scheduling, ai_sensitivity, ai_modules, policy_template, branding)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb)
     RETURNING *`,
    [
      tenantId,
      title,
      body.description || null,
      JSON.stringify(body.scheduling || {}),
      String(body.ai_sensitivity || 'normal'),
      JSON.stringify(body.ai_modules || {}),
      JSON.stringify(body.policy_template || {}),
      JSON.stringify(body.branding || {}),
    ]
  );
  return rows[0];
}

export async function getExam(tenantId, examId) {
  const { rows } = await query(`SELECT * FROM exams WHERE id = $1 AND tenant_id = $2`, [examId, tenantId]);
  return rows[0] || null;
}

export async function listSessionsForExam(tenantId, examId, { cursor, limit: rawLimit }) {
  const exam = await getExam(tenantId, examId);
  if (!exam) return null;
  const limit = clampLimit(rawLimit);
  const c = decodeCursor(cursor);
  const params = [tenantId, examId];
  let where = `WHERE s.tenant_id = $1 AND s.exam_id = $2`;
  if (c?.created_at && c?.id) {
    params.push(c.created_at, c.id);
    where += ` AND (s.created_at, s.id) < ($3::timestamptz, $4::uuid)`;
  }
  params.push(limit + 1);
  const limIdx = params.length;
  const { rows } = await query(
    `SELECT s.* FROM exam_sessions s ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT $${limIdx}`,
    params
  );
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  let next_cursor = null;
  if (hasMore && slice.length) {
    const last = slice[slice.length - 1];
    next_cursor = encodeCursor({ created_at: last.created_at.toISOString(), id: last.id });
  }
  return { items: slice, next_cursor };
}
