-- Policy enforcement: one default per tenant + active-session count index

-- At most one default policy template per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_templates_one_default
  ON policy_templates (tenant_id)
  WHERE is_default = true;

-- Speeds admissionControl active-session counts
CREATE INDEX IF NOT EXISTS idx_exam_sessions_tenant_status
  ON exam_sessions (tenant_id, status);
