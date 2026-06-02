-- Tenant admin: exams, candidates, tenant users, session extensions, webhooks, evidence

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduling JSONB NOT NULL DEFAULT '{}',
  ai_sensitivity TEXT NOT NULL DEFAULT 'normal',
  ai_modules JSONB NOT NULL DEFAULT '{}',
  policy_template JSONB NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exams_tenant ON exams (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  external_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'proctor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users (tenant_id);

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES exams (id) ON DELETE SET NULL;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES candidates (id) ON DELETE SET NULL;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS ai_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS recording_object_key TEXT;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS proctor_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions (exam_id);

CREATE TABLE IF NOT EXISTS session_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_time ON session_events (session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS session_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  object_key TEXT,
  caption TEXT,
  violation_context JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_snapshots_session ON session_snapshots (session_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['session.started', 'session.ended'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  signing_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks (tenant_id);
