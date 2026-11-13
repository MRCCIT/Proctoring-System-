-- Dynamic violation-based sub-proctor assignment

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS max_candidate_capacity INT NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

ALTER TABLE proctor_assignments
  ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES candidates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS risk_score_at_assignment NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS assignment_reason TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES tenant_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- One active session owner at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_proctor_assignments_active_session
  ON proctor_assignments (tenant_id, session_id)
  WHERE status = 'active' AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proctor_assignments_status
  ON proctor_assignments (tenant_id, proctor_user_id, status);

CREATE INDEX IF NOT EXISTS idx_proctor_assignments_exam_status
  ON proctor_assignments (tenant_id, exam_id, status);

-- Proctors selected for an ongoing exam (allocation pool)
CREATE TABLE IF NOT EXISTS exam_proctor_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  proctor_user_id UUID NOT NULL REFERENCES tenant_users (id) ON DELETE CASCADE,
  allocation_mode TEXT NOT NULL DEFAULT 'risk_based',
  auto_allocate BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES tenant_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, exam_id, proctor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_proctor_pools_exam
  ON exam_proctor_pools (tenant_id, exam_id, status);

-- Per-tenant risk / allocation settings
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS proctor_settings JSONB NOT NULL DEFAULT '{
    "min_risk_to_assign": 25,
    "critical_threshold": 70,
    "high_threshold": 45,
    "medium_threshold": 25,
    "include_low_risk": false,
    "decay_half_life_seconds": 1800
  }'::jsonb;
