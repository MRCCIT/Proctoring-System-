# MASTER PROMPT (delivery tracker)

## Stack

| Layer | Choice |
|-------|--------|
| Admin UI | Next.js 14 — `apps/tenant-admin-portal` |
| Candidate | Vite — `apps/candidate-exam-app` |
| Design system | `@proctorshield/ui-components` |
| SDK | `@proctorshield/sdk` |
| Backend | Express ESM — `services/platform-api` |
| DB | Postgres 16 (`:15432`) |
| Cache / queue | Redis + BullMQ optional |
| Auth | Tenant JWT · SDK API keys · session tokens |
| Storage | Local `storage/` + optional S3 |
| CI | `.github/workflows/ci.yml` |

## Phase status

| Phase | Status | Delivered |
|-------|--------|-----------|
| **1 IA** | **DONE** | Exam list → candidates → detail; shared `ExamCandidateExplorer`; virtualized grid/wall/board/timeline; dense list; URL state; skeletons; bulk actions API+UI; keyboard nav; review inline panel |
| **2 Backend** | **DONE** | `exam_aggregates` + Redis cache; slim list DTOs; cursor pagination; risk model; migration `012` covering indexes; exam list reads aggregates |
| **3 Report** | **DONE** | `/exams/:id/report` filters + severity breakdown + candidate cursor table; async CSV/XLSX/PDF; job history; export audit |
| **4 Lockdown** | **DONE** | Signed policy; `LockdownClient` primary in ExamWindow; strict batch sig; SEB middleware + docs; system-check; kiosk stub |
| **5 Media** | **DONE (foundations→usable)** | Presign + chunk-complete; local upload; snapshot ticker; post-exam HLS stub + clip metadata; player tier helper; WebRTC live retained |
| **6 Design** | **DONE** | `docs/system-design-100k.md` |
| **7 Perf** | **DONE** | `perf-budgets.json`; capacity planner; load-level store + WS; P0–P4 lanes; k6 1k/10k/under-provisioned; EXPLAIN test; CI |

## Migrations

`001`…`013_integration_access_links.sql` — run `npm run db:migrate`.

## How to run

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev:backend
npm run dev:tenant    # :3200
npm run dev:candidate
npm run test:unit -w @proctorshield/platform-api
k6 run loadtests/k6/smoke.js
```

## Honest limits (still by design)

- Full SFU fleet (LiveKit/mediasoup) not embedded — peer WebRTC + HLS stub; scale-out is infra.
- Excel/PDF stream for 100k rows needs worker capacity; jobs are async and cursor-paged.
- Browser lockdown cannot be absolute — STRICT mode expects SEB/kiosk.
- Redis/BullMQ optional; without them system falls back to Postgres/in-process.
- Kafka/ClickHouse marked for XL in system-design doc; not required for S/M.

## Assumptions

- Session row ≈ candidate attempt
- Answer/exam delivery path stays isolated from proctoring failures
- Capacity tiers S/M/L/XL via planner + load levels L0–L4
