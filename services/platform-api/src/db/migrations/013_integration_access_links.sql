-- Integration API + access links schema expected by services/integration/*.

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS external_exam_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS exams_tenant_external_exam_uidx
  ON exams (tenant_id, external_exam_id)
  WHERE external_exam_id IS NOT NULL;

ALTER TABLE candidates
  ALTER COLUMN email DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_tenant_external_ref_uidx
  ON candidates (tenant_id, lower(trim(external_ref)))
  WHERE external_ref IS NOT NULL AND trim(external_ref) <> '';

ALTER TABLE exam_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS callback_url TEXT,
  ADD COLUMN IF NOT EXISTS integration_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS external_attempt_id TEXT,
  ADD COLUMN IF NOT EXISTS access_link_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_tenant_idempotency_uidx
  ON exam_sessions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_links_tenant_exam_idx
  ON access_links (tenant_id, exam_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_access_link_id_fkey'
  ) THEN
    ALTER TABLE exam_sessions
      ADD CONSTRAINT exam_sessions_access_link_id_fkey
      FOREIGN KEY (access_link_id) REFERENCES access_links(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;
