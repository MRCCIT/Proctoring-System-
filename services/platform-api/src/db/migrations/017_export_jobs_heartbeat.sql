-- export_jobs may predate heartbeat_at (CREATE TABLE IF NOT EXISTS skipped alters).
ALTER TABLE export_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;
