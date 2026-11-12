-- Phase 2/3/4 foundations: aggregates, risk columns, export jobs, lockdown policies.
-- Also backfills review/integration columns that older branches may lack (006/007 were missing).

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS external_exam_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highest_severity TEXT,
  ADD COLUMN IF NOT EXISTS candidate_name TEXT,
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS external_attempt_id TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_decision TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_summary TEXT,
  ADD COLUMN IF NOT EXISTS connection_state TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stream_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS violation_flags INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS integration_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_link_id UUID,
  ADD COLUMN IF NOT EXISTS sdk_init_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS proctor_notes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_seconds INT NOT NULL DEFAULT 0;

ALTER TABLE session_events
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS exam_aggregates (
  exam_id UUID PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  total_candidates INT NOT NULL DEFAULT 0,
  appeared INT NOT NULL DEFAULT 0,
  absent INT NOT NULL DEFAULT 0,
  submitted INT NOT NULL DEFAULT 0,
  terminated INT NOT NULL DEFAULT 0,
  live_count INT NOT NULL DEFAULT 0,
  flagged_count INT NOT NULL DEFAULT 0,
  critical_violation_count INT NOT NULL DEFAULT 0,
  total_violations INT NOT NULL DEFAULT 0,
  avg_risk_score NUMERIC(8, 2),
  review_pending INT NOT NULL DEFAULT 0,
  review_done INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_aggregates_tenant_idx ON exam_aggregates (tenant_id);

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('csv', 'xlsx', 'pdf')),
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'filtered', 'selected')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress INT NOT NULL DEFAULT 0,
  file_path TEXT,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS export_jobs_exam_created_idx ON export_jobs (exam_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_tenant_status_idx ON export_jobs (tenant_id, status);

CREATE TABLE IF NOT EXISTS lockdown_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  policy JSONB NOT NULL,
  signature TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, version)
);

CREATE INDEX IF NOT EXISTS lockdown_policies_exam_idx ON lockdown_policies (exam_id, version DESC);

CREATE INDEX IF NOT EXISTS exam_sessions_exam_created_idx
  ON exam_sessions (exam_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS exam_sessions_exam_risk_idx
  ON exam_sessions (exam_id, risk_score DESC, id);

CREATE INDEX IF NOT EXISTS exam_sessions_exam_severity_idx
  ON exam_sessions (exam_id, highest_severity, created_at DESC, id);
