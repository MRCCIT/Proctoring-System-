# Phase delivery notes

## What was built (all phases)

### Phase 1 — IA
- `/live` and `/reviews` exam list → `/…/exams/:examId/candidates` → detail
- Shared `ExamCandidateExplorer` (`mode: live | review`)
- Views: list (dense), grid, wall (live), severity board, timeline (review) — TanStack Virtual
- URL state for view/filters; skeletons; bulk assign/flag/message; keyboard ↑↓/Enter

### Phase 2 — Backend scale reads
- `exam_aggregates` + Redis `exam:agg:{id}` (60s)
- Slim session list DTO; cursor pagination; risk scoring; indexes `012`

### Phase 3 — Report + exports
- `/exams/:id/report` with filters, severity breakdown, candidate Load more
- Async CSV / Excel (`exceljs` stream) / PDF (`pdfkit`); audit on create/download

### Phase 4 — Lockdown
- Signed `LockdownPolicy`; SDK `LockdownClient` primary; SEB STRICT headers; system-check

### Phase 5 — Media
- Presign chunk upload; snapshots; post-exam HLS stub + clip metadata; player tiers

### Phase 6 — Design
- `docs/system-design-100k.md`

### Phase 7 — Perf / elasticity
- `perf-budgets.json`, capacity planner, load-level L0–L4 + WS, priority lanes, k6 scripts, EXPLAIN test, GitHub CI

## Run / test

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
node scripts/seed-scale-exams.mjs          # 50 candidates
node scripts/seed-scale-exams.mjs --large  # +100k (slow)
npm run test:unit -w @proctorshield/platform-api
npm run dev:backend
npm run dev:tenant
```

## Known limits
See `docs/MASTER_PROMPT.md` — SFU fleet, Kafka, and ClickHouse remain XL infra choices, not embedded runtimes.
