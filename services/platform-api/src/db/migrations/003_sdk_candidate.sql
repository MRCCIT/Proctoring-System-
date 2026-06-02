-- Candidate SDK: system checks, identity handoff, stream markers

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS stream_started_at TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS stream_ended_at TIMESTAMPTZ;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS sdk_init_meta JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS sdk_system_checks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  results JSONB NOT NULL DEFAULT '{}',
  client_info JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdk_system_checks_session ON sdk_system_checks (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sdk_identity_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  object_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdk_identity_session ON sdk_identity_submissions (session_id, created_at DESC);
