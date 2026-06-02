-- SDK enhancements: branding, policy templates, session templates, sub-admin permissions,
-- recording chunks, face checks, proctor assignments, proctor chat, session extensions.

-- Tenant branding (per-tenant defaults; overridden by exam.branding when set)
CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#0f172a',
  secondary_color TEXT NOT NULL DEFAULT '#3b82f6',
  accent_color TEXT NOT NULL DEFAULT '#22c55e',
  organization_name TEXT,
  support_email TEXT,
  support_phone TEXT,
  candidate_welcome_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sub-admin permissions for tenant_users
ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';

-- Allow more roles for finer-grained tenant users
ALTER TABLE tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;
ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('admin', 'sub_admin', 'proctor', 'viewer'));

-- Reusable exam policy templates
CREATE TABLE IF NOT EXISTS policy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}',
  ai_modules JSONB NOT NULL DEFAULT '{}',
  ai_sensitivity TEXT NOT NULL DEFAULT 'normal',
  grace_period_seconds INT NOT NULL DEFAULT 5,
  severity_thresholds JSONB NOT NULL DEFAULT '{"warn": 1, "flag": 3, "terminate": 8}',
  whitelist JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_templates_tenant ON policy_templates (tenant_id, created_at DESC);

-- Session templates for recurring exam types
CREATE TABLE IF NOT EXISTS session_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_duration_minutes INT NOT NULL DEFAULT 60,
  default_ai_modules JSONB NOT NULL DEFAULT '{}',
  default_ai_sensitivity TEXT NOT NULL DEFAULT 'normal',
  default_branding JSONB NOT NULL DEFAULT '{}',
  default_policy_template_id UUID REFERENCES policy_templates (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_templates_tenant ON session_templates (tenant_id, created_at DESC);

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS policy_template_id UUID REFERENCES policy_templates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_template_id UUID REFERENCES session_templates (id) ON DELETE SET NULL;

-- Proctor assignment (proctor or viewer assigned to exam or specific session)
CREATE TABLE IF NOT EXISTS proctor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  proctor_user_id UUID NOT NULL REFERENCES tenant_users (id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams (id) ON DELETE CASCADE,
  session_id UUID REFERENCES exam_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'proctor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (exam_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_proctor_assignments_tenant ON proctor_assignments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proctor_assignments_session ON proctor_assignments (session_id);
CREATE INDEX IF NOT EXISTS idx_proctor_assignments_exam ON proctor_assignments (exam_id);
CREATE INDEX IF NOT EXISTS idx_proctor_assignments_proctor ON proctor_assignments (proctor_user_id);

-- Track session pause / extend events
CREATE TABLE IF NOT EXISTS session_extensions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('pause', 'resume', 'extend', 'shorten')),
  extra_seconds INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_seconds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS screen_record_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS camera_record_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS proctor_notes_json JSONB NOT NULL DEFAULT '[]';

-- Per-status check 'paused' allowed
ALTER TABLE exam_sessions
  DROP CONSTRAINT IF EXISTS exam_sessions_status_check;
ALTER TABLE exam_sessions
  ADD CONSTRAINT exam_sessions_status_check
  CHECK (status IN ('scheduled', 'active', 'paused', 'completed', 'failed', 'terminated'));

CREATE INDEX IF NOT EXISTS idx_session_extensions_session ON session_extensions (session_id, created_at DESC);

-- Recording chunks (camera + screen).  Tenants upload binary to object storage; this row stores metadata only.
CREATE TABLE IF NOT EXISTS session_recording_chunks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  track TEXT NOT NULL CHECK (track IN ('camera', 'screen', 'audio', 'composite')),
  sequence INT NOT NULL,
  object_key TEXT,
  duration_ms INT,
  bytes BIGINT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, track, sequence)
);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_session ON session_recording_chunks (session_id, track, sequence);

-- 10-second face presence check log (very high volume; partition-friendly schema)
CREATE TABLE IF NOT EXISTS session_face_checks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  face_count INT NOT NULL DEFAULT 0,
  match_score REAL,
  gaze_direction TEXT,
  gaze_score REAL,
  sideways_score REAL,
  detector TEXT,
  violations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_checks_session_time ON session_face_checks (session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_checks_tenant_time ON session_face_checks (tenant_id, occurred_at DESC);

-- Proctor chat messages (proctor <-> candidate)
CREATE TABLE IF NOT EXISTS proctor_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('candidate', 'proctor', 'system')),
  sender_user_id UUID,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_session_time ON proctor_chat_messages (session_id, created_at DESC);

-- Convenience: latest snapshot view for live monitoring
CREATE OR REPLACE VIEW v_session_latest_snapshot AS
SELECT DISTINCT ON (session_id)
  session_id, id AS snapshot_id, object_key, caption, violation_context, captured_at
FROM session_snapshots
ORDER BY session_id, captured_at DESC;
