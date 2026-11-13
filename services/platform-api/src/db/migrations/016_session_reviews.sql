-- Human review audit trail + review status constraints (backfill from missing 006).

ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_review_status_check;
ALTER TABLE exam_sessions
  ADD CONSTRAINT exam_sessions_review_status_check
  CHECK (review_status IN ('pending', 'in_review', 'reviewed'));

ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_review_decision_check;
ALTER TABLE exam_sessions
  ADD CONSTRAINT exam_sessions_review_decision_check
  CHECK (review_decision IS NULL OR review_decision IN ('cleared', 'flagged', 'inconclusive'));

ALTER TABLE session_events DROP CONSTRAINT IF EXISTS session_events_review_status_check;
ALTER TABLE session_events
  ADD CONSTRAINT session_events_review_status_check
  CHECK (review_status IS NULL OR review_status IN ('open', 'confirmed', 'dismissed'));

CREATE TABLE IF NOT EXISTS session_reviews (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES exam_sessions (id) ON DELETE CASCADE,
  event_id BIGINT REFERENCES session_events (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'review_started',
      'session_cleared',
      'session_flagged',
      'session_inconclusive',
      'event_confirmed',
      'event_dismissed',
      'event_reopened',
      'note',
      'manual_incident'
    )
  ),
  note TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_reviews_session ON session_reviews (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_reviews_tenant ON session_reviews (tenant_id, created_at DESC);
