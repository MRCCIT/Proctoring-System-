-- Phase 2: composite indexes for tenant exam session list/report filters.

CREATE INDEX IF NOT EXISTS exam_sessions_tenant_exam_status_created_idx
  ON exam_sessions (tenant_id, exam_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS exam_sessions_tenant_exam_review_created_idx
  ON exam_sessions (tenant_id, exam_id, review_status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS exam_sessions_tenant_exam_risk_id_idx
  ON exam_sessions (tenant_id, exam_id, risk_score DESC, id DESC);

CREATE INDEX IF NOT EXISTS exam_sessions_tenant_exam_severity_created_idx
  ON exam_sessions (tenant_id, exam_id, highest_severity, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS session_events_session_occurred_idx
  ON session_events (session_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS session_events_tenant_occurred_idx
  ON session_events (tenant_id, occurred_at DESC);
