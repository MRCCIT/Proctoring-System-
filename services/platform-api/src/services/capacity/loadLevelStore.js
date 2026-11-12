import { LOAD_LEVELS, policyForLevel, recommendLoadLevel } from './loadLevel.js';

export { policyForLevel };
import { query } from '../../config/database.js';
import { broadcastToSession } from '../tenant/chat.js';

const tenantLevel = new Map();
const examLevel = new Map();
let globalLevel = 'L0';
let globalManual = false;

function tenantKey(tenantId) {
  return String(tenantId);
}

function examKey(tenantId, examId) {
  return `${tenantId}:${examId}`;
}

export function getExamLoadLevel(tenantId, examId) {
  const ek = examKey(tenantId, examId);
  if (examLevel.has(ek)) return examLevel.get(ek);
  return tenantLevel.get(tenantKey(tenantId)) || 'L0';
}

export function getTenantLoadLevel(tenantId) {
  return tenantLevel.get(tenantKey(tenantId)) || globalLevel || 'L0';
}

export function getGlobalLoadLevel() {
  return globalLevel || 'L0';
}

export function setGlobalLoadLevel(level, { manual = true } = {}) {
  const lv = LOAD_LEVELS.includes(level) ? level : 'L0';
  globalLevel = lv;
  globalManual = Boolean(manual);
  return { level: lv, policy: policyForLevel(lv), manual: globalManual };
}

export function isGlobalLoadManual() {
  return globalManual;
}

export function setTenantLoadLevel(tenantId, level, { manual = true } = {}) {
  const lv = LOAD_LEVELS.includes(level) ? level : 'L0';
  tenantLevel.set(tenantKey(tenantId), lv);
  return { level: lv, policy: policyForLevel(lv), manual };
}

export function setExamLoadLevel(tenantId, examId, level, { manual = true } = {}) {
  const lv = LOAD_LEVELS.includes(level) ? level : 'L0';
  examLevel.set(examKey(tenantId, examId), lv);
  return { level: lv, policy: policyForLevel(lv), manual };
}

export function recommendAndMaybeSet(tenantId, metrics = {}) {
  const lv = recommendLoadLevel(metrics);
  if (metrics.manual) setTenantLoadLevel(tenantId, lv, { manual: true });
  return { level: lv, policy: policyForLevel(lv) };
}

export async function broadcastLoadLevel(tenantId, examId, level) {
  const policy = policyForLevel(level);
  const params = [tenantId];
  let where = `tenant_id = $1 AND status IN ('active','paused')`;
  if (examId) {
    params.push(examId);
    where += ` AND exam_id = $${params.length}::uuid`;
  }
  const { rows } = await query(`SELECT id FROM exam_sessions WHERE ${where}`, params);
  for (const r of rows) {
    broadcastToSession(r.id, { type: 'load_level', level, policy });
  }
  return rows.length;
}
