-- Dual original + compressed recording metadata (backward compatible).

ALTER TABLE session_recording_chunks
  ADD COLUMN IF NOT EXISTS variant TEXT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS compression_status TEXT,
  ADD COLUMN IF NOT EXISTS compression_error TEXT,
  ADD COLUMN IF NOT EXISTS compression_profile TEXT,
  ADD COLUMN IF NOT EXISTS width INT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS fps REAL;

-- Backfill variants from legacy merged rows / segments.
UPDATE session_recording_chunks
   SET variant = CASE
     WHEN COALESCE((metadata->>'merged')::boolean, false) = true
       AND COALESCE((metadata->>'compressed')::boolean, false) = true THEN 'compressed'
     WHEN COALESCE((metadata->>'merged')::boolean, false) = true THEN 'original'
     WHEN sequence >= 999997 THEN 'compressed'
     ELSE 'segment'
   END
 WHERE variant IS NULL;

ALTER TABLE session_recording_chunks
  ALTER COLUMN variant SET DEFAULT 'segment';

UPDATE session_recording_chunks SET variant = 'segment' WHERE variant IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_recording_chunks_variant_check'
  ) THEN
    ALTER TABLE session_recording_chunks
      ADD CONSTRAINT session_recording_chunks_variant_check
      CHECK (variant IN ('segment', 'original', 'compressed', 'fallback'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recording_chunks_variant
  ON session_recording_chunks (tenant_id, session_id, variant, track);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_compression_status
  ON session_recording_chunks (tenant_id, compression_status)
  WHERE compression_status IS NOT NULL;
