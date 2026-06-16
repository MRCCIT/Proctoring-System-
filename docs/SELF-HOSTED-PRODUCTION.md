# Self-Hosted Production Stack

Run ProctorShield without AWS or Twilio using Docker + open-source services.

## Quick start

```bash
# 1. Infra (Postgres, Redis, MinIO, PgBouncer)
npm run infra:up

# 2. Copy env and enable production modes
cp .env.example .env
# Edit .env:
#   REDIS_URL=redis://127.0.0.1:6379
#   AI_MODE=async
#   TELEMETRY_MODE=async
#   STORAGE_BACKEND=s3

npm run db:migrate
npm run db:seed

# 3. Full stack (workers + AI + API)
npm run dev:prod-stack

# 4. Frontends
npm run dev:candidate
```

## What was integrated

| Feature | Env / command |
|---------|----------------|
| Redis session state | `REDIS_URL` |
| Async AI queue | `AI_MODE=async` + `npm run worker:ai` |
| Telemetry batch writes | `TELEMETRY_MODE=async` + `npm run worker:telemetry` |
| MinIO S3 uploads | `STORAGE_BACKEND=s3` + MinIO on :9000 |
| WS pub/sub | `WS_PUBSUB_ENABLED=true` + Redis |
| Admission control | `max_concurrent_sessions` in tenant quotas |
| Client AI intervals | `CLIENT_*` env vars → session config |
| Metrics | `GET /metrics` (Prometheus) |

## Health check

`GET /health` returns `redis`, `storage`, `ai_mode`, `telemetry_mode`.

## Backward compatible defaults

Without Redis, the API runs in **sync** mode with in-memory state (same as before).
