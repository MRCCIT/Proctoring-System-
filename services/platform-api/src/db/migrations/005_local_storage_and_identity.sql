-- 005_local_storage_and_identity.sql
-- Adds enrolled reference photo per candidate, on-disk file paths for
-- recording chunks / snapshots, and a violation_count denormalization
-- so the SDK and admin UI can show storage paths.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS reference_photo_key TEXT,
  ADD COLUMN IF NOT EXISTS reference_photo_mime TEXT;

ALTER TABLE session_recording_chunks
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE session_snapshots
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS bytes BIGINT,
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE session_face_checks
  ADD COLUMN IF NOT EXISTS source TEXT;
