# Media pipeline (Phase 5)

## Principle

Do **not** stream 100k live videos to admins. Use tiers.

## Tier 1 — candidate recording (always on)

- `ChunkedRecorder` + `ChunkUploader` in `@proctorshield/sdk`
- Short MediaRecorder chunks (5–10s), adaptive bitrate/fps
- Upload via presigned URL → object storage (never through app servers)
- Offline queue + backoff; degrade fps before pausing screen capture

## Tier 2 — live monitoring (cheap)

- `SnapshotTicker` — JPEG/WebP every 10–30s (+ burst on violation)
- Redis/CDN pointer for latest thumbnail (planned)
- Wall/grid loads thumbnails only for **visible** tiles

## Tier 3 — on-demand live (expensive)

- When proctor opens/pins a candidate: SFU (LiveKit/mediasoup) or LL-HLS fallback
- Candidate publishes higher quality only while watched

## Post-exam

- ffmpeg workers stitch chunks → HLS, sprites, violation clips ±10s
- Review UI prefers clips first; full recording on demand

## API stubs

- `POST /v1/sessions/:id/media/presign`
- `POST /v1/sessions/:id/media/chunk-complete`
- Existing snapshot/recording routes under tenant sessions
