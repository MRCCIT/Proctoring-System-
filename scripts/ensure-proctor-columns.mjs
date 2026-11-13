import '../services/platform-api/src/config/loadEnv.js';
import { query, pool } from '../services/platform-api/src/config/database.js';

const statements = [
  `ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS max_candidate_capacity INT NOT NULL DEFAULT 20`,
  `ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS proctor_settings JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'manual'`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS candidate_id UUID`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS risk_score_at_assignment NUMERIC(8,2)`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS assignment_reason TEXT`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS assigned_by UUID`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ`,
  `ALTER TABLE proctor_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS exam_proctor_pools (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
     exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
     proctor_user_id UUID NOT NULL REFERENCES tenant_users (id) ON DELETE CASCADE,
     allocation_mode TEXT NOT NULL DEFAULT 'risk_based',
     auto_allocate BOOLEAN NOT NULL DEFAULT true,
     status TEXT NOT NULL DEFAULT 'active',
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (tenant_id, exam_id, proctor_user_id)
   )`,
];

for (const sql of statements) {
  try {
    await query(sql);
    console.log('OK:', sql.slice(0, 70).replace(/\s+/g, ' '), '...');
  } catch (e) {
    console.error('FAIL:', e.message, '\n', sql.slice(0, 120));
  }
}

// Allow disabled status for proctors
try {
  await query(`ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS tenant_users_status_check`);
  await query(
    `ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_status_check CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'disabled'::text]))`
  );
  console.log('OK: status check includes disabled');
} catch (e) {
  console.error('status check:', e.message);
}

const cols = await query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='tenant_users' AND column_name IN ('max_candidate_capacity','last_active_at') ORDER BY 1`
);
console.log('columns:', cols.rows);

await pool.end();
