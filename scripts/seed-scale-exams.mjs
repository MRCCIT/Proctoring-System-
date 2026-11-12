#!/usr/bin/env node
/**
 * Scale seed: small exam (50) + optional large exam (100k synthetic sessions).
 *
 * Usage:
 *   node scripts/seed-scale-exams.mjs              # 50 only
 *   node scripts/seed-scale-exams.mjs --large      # 50 + 100k (batched)
 *   SCALE_LARGE=1 node scripts/seed-scale-exams.mjs
 *
 * Requires Postgres up and migrations applied. Uses demo-university tenant.
 */
import '../services/platform-api/src/config/loadEnv.js';
import { query, pool } from '../services/platform-api/src/config/database.js';
import { refreshExamAggregate } from '../services/platform-api/src/services/aggregates/examAggregates.js';

const LARGE = process.argv.includes('--large') || process.env.SCALE_LARGE === '1';
const BATCH = Number(process.env.SEED_BATCH || 500);

async function ensureExam(tenantId, title, external) {
  const { rows } = await query(
    `INSERT INTO exams (tenant_id, title, external_exam_id, source, scheduling)
     VALUES ($1, $2, $3, 'seed', $4::jsonb)
     ON CONFLICT (tenant_id, external_exam_id) WHERE external_exam_id IS NOT NULL
     DO UPDATE SET title = EXCLUDED.title, updated_at = now()
     RETURNING id`,
    [
      tenantId,
      title,
      external,
      JSON.stringify({
        starts_at: new Date(Date.now() - 3600_000).toISOString(),
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ]
  );
  return rows[0].id;
}

async function seedSessions(tenantId, examId, count, label) {
  console.log(`Seeding ${count} sessions for ${label}…`);
  const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null];
  const statuses = ['completed', 'completed', 'completed', 'terminated', 'active', 'scheduled'];
  let inserted = 0;
  while (inserted < count) {
    const n = Math.min(BATCH, count - inserted);
    const values = [];
    const params = [];
    let p = 1;
    for (let i = 0; i < n; i++) {
      const idx = inserted + i;
      const status = statuses[idx % statuses.length];
      const risk = (idx % 97) * 1.7;
      const sev = severities[idx % severities.length];
      const review =
        status === 'completed' || status === 'terminated'
          ? idx % 5 === 0
            ? 'reviewed'
            : 'pending'
          : 'pending';
      values.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
      );
      params.push(
        tenantId,
        examId,
        `seed-${label}-${idx}`,
        `Candidate ${idx}`,
        status,
        risk,
        sev,
        review,
        idx % 11 === 0 ? 'flagged' : null
      );
    }
    await query(
      `INSERT INTO exam_sessions
         (tenant_id, exam_id, external_ref, candidate_name, status, risk_score, highest_severity, review_status, review_decision)
       VALUES ${values.join(',')}`,
      params
    );
    inserted += n;
    if (inserted % 5000 === 0 || inserted === count) console.log(`  …${inserted}/${count}`);
  }

  // Sample violations for first 200 completed-ish rows
  const { rows: sample } = await query(
    `SELECT id FROM exam_sessions WHERE exam_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [examId]
  );
  for (const s of sample) {
    const sev = ['warn', 'flag', 'critical'][Math.floor(Math.random() * 3)];
    await query(
      `INSERT INTO session_events (tenant_id, session_id, event_type, severity, payload, occurred_at, source, review_status)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, now() - ($5 || ' minutes')::interval, 'seed', 'open')`,
      [tenantId, s.id, sev === 'critical' ? 'face_mismatch' : 'tab_switch', sev, String(Math.floor(Math.random() * 40))]
    );
  }
  await refreshExamAggregate(examId, { updateRisk: false });
  console.log(`Done ${label}; aggregate refreshed.`);
}

async function main() {
  const { rows } = await query(`SELECT id FROM tenants WHERE slug = 'demo-university' LIMIT 1`);
  if (!rows[0]) {
    console.error('Demo tenant missing. Run npm run db:seed first.');
    process.exit(1);
  }
  const tenantId = rows[0].id;
  const smallId = await ensureExam(tenantId, 'Scale Seed — Small (50)', 'seed-scale-small');
  await seedSessions(tenantId, smallId, 50, 'small');

  if (LARGE) {
    const largeId = await ensureExam(tenantId, 'Scale Seed — Large (100k)', 'seed-scale-large');
    await seedSessions(tenantId, largeId, 100_000, 'large');
  } else {
    console.log('Skip 100k (pass --large or SCALE_LARGE=1 to include).');
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
