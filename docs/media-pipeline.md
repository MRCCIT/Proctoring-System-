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

## Post-exam (dual storage)

1. Session end assembles **immutable original** WebM (`variant=original`, sequence `999998`).
2. Background job (BullMQ if Redis, else in-process) compresses to AV1 WebM when `libsvtav1` is available; otherwise VP9 WebM or H.264 MP4 (`variant=compressed`, sequence `999999`).
3. Optional H.264 MP4 fallback (`variant=fallback`, sequence `999997`) via `VIDEO_COMPRESSION_GENERATE_H264_FALLBACK`.
4. Tenant Admin plays **compressed** by default; original remains for evidence. Live AI / WebRTC are unchanged.
5. HLS / violation clips ±10s remain optional (`FFMPEG_PATH`).

## API stubs

- `POST /v1/sessions/:id/media/presign`
- `POST /v1/sessions/:id/media/chunk-complete`
- `POST /v1/sessions/:id/recordings/compress` — admin retry (tenant JWT)
- Existing snapshot/recording routes under tenant sessions

## Worker

```bash
node services/platform-api/scripts/media-compression-worker.mjs
```

Requires Redis for BullMQ. Without Redis, Platform API runs compression in-process via `setImmediate`.

## Manual regression checklist

- [ ] Live WebRTC / proctor live view still works during an exam
- [ ] AI face/gaze/object ticks continue at existing intervals (not tied to 480p/15 storage)
- [ ] Mid-session chunk upload failures do not stop MediaRecorder; refresh resumes IndexedDB queue
- [ ] Session end creates `original/` WebM row (`sequence=999998`) without deleting segment chunks
- [ ] Background compress produces `compressed/` derivative; status becomes `completed` after ffprobe validation
- [ ] Tenant Admin player defaults to compressed; source switch + AV1 decode error falls back to H.264/original
- [ ] `POST /v1/sessions/:id/recordings/compress` with `{ "force": true }` re-queues jobs
- [ ] Compression failure leaves original playable
