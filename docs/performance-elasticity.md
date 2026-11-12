# Performance & elasticity (Phase 7)

Companion to `docs/system-design-100k.md`. Source files: [`perf-budgets.json`](../perf-budgets.json),
`services/platform-api/src/services/capacity/planner.js`, `…/capacity/loadLevel.js`, `loadtests/k6/`.

> The budgets and planner constants are **planning targets**, not measurements. Nothing in this repository has been load-tested at scale yet.
> The budget table was reconstructed from `docs/ProctorShield-10k-Single-Instance-Optimization.md` §9, the scaling guide §7.12 and the Phase 2–4 endpoints.

## 1. Capacity planner tiers

`planCapacity(nCandidates, overrides?)` is a pure function: concurrent candidates in → tier, expected load, replica counts, infrastructure choices, warnings out. No I/O.

| Tier | Candidates | Topology | Summary |
|------|-----------|----------|---------|
| **S** | ≤ 1,000 | `single_node` | Today's stack: one API process (WS in-process), Postgres, local disk, Python sidecar |
| **M** | ≤ 10,000 | `single_instance_hardened` | One large API/WS process + Redis + MinIO direct upload + PgBouncer + async telemetry/AI workers |
| **L** | ≤ 50,000 | `horizontal_small` | API and WS fleets split, Redis pub/sub, S3, read replicas, Kafka/SQS |
| **XL** | > 50,000 | `horizontal_fleet` | WS gateway fleet, Aurora + replicas + partitioning, GPU worker pool, S3 + CDN |

Output of the current model (replicas; `headroom` 1.25 on L/XL):

| N | Tier | API | WS gw | Telemetry | GPU AI | Merge | coturn | PgBouncer | Redis shards | Read replicas | WS conns | API rps | Uploads/s | Ingress |
|---|------|-----|-------|-----------|--------|-------|--------|-----------|--------------|---------------|----------|---------|-----------|---------|
| 100 | S | 1 | – (in-proc) | inline | 0 | 0 | 0 | 0 | 0 | 0 | 105 | 17 | 10 | 0.07 Gbps |
| 1,000 | S | 1 | – | inline | 0 | 0 | 0 | 0 | 0 | 0 | 1,050 | 167 | 100 | 0.65 Gbps |
| 10,000 | M | 1 | – (in-proc) | 1 | 3 | 5 | 1 | 1 | 1 | 0 | 10,500 | 1,667 | 1,000 | 6.5 Gbps |
| 50,000 | L | 42 | 33 | 2 | 14 | 25 | 5 | 2 | 3 | 2 | 52,500 | 8,333 | 5,000 | 32.5 Gbps |
| 100,000 | XL | 84 | 66 | 4 | 27 | 50 | 9 | 3 | 6 | 4 | 105,000 | 16,667 | 10,000 | 65 Gbps |
| 150,000 | XL | 125 | 99 | 5 | 40 | 75 | 13 | 3 | 7 | 5 | 157,500 | 25,000 | 15,000 | 97.5 Gbps |

Key model constants (`CAPACITY_MODEL`, all overridable): 1,500 sessions/API replica, 2,000 WS connections/replica, 10 API req/session/min, 15 s face-check interval, 100 rows per batched INSERT,
2 tracks × 20 s chunks, 0.65 Mbps average media per session, 2 % "hot" sessions × 30 s sample for server AI at 5 ticks/s/GPU, 5 % proctors / 5 % live-watch.
The 100k–150k rows reproduce the scaling guide's figures (API 80–150 pods, WS 60–100 pods, ~12 GB/s, ~86 TB per 2 h exam). Tests assert those ranges and monotonicity.

Warnings the planner can emit: S above ~200 sessions (unproven defaults), server-AI sidecar limits, DB write rate above one primary (→ partition/write-behind), > 200k (out of model).

## 2. Load levels

L0 normal · L1 elevated · L2 degraded · L3 severe · L4 survival. Pure controller in `loadLevel.js`:

- `evaluateSignals(signals, thresholds)` — per-metric level via cut-offs, worst metric wins; missing/NaN metrics never escalate.
  Default cut-offs (L1/L2/L3/L4): API p95 200/400/800/1500 ms · 5xx 1/3/8/20 % · CPU 70/80/90/97 % · DB pool wait 20/100/500/2000 ms · queue lag 5/15/60/300 s · WS connect failures 0.5/2/5/15 %.
- `nextLoadState(state, signals, nowMs, opts)` — escalate immediately (multi-level jumps allowed); de-escalate **one level per cooldown** (default 120 s) and only when signals are below **0.8×** the current level's cut-offs.
  A relapse inside the band resets the calm timer.
- `featuresForLevel(level)` — knobs per level (server AI, identity, snapshot interval, face-check interval, chunk length, telemetry flush, new-session policy, live video, admin reads, exports).
  Includes `aiDegradationLevel` to drive the existing `infra/degradation.js`.
- `LANES` / `LANE_POLICY` / `laneDecision` / `shouldShed` / `retryAfterSeconds` — P0–P4 priority lanes (P0 never shed; shedding is monotonic in level).

Recovery time = cooldown × levels stepped (L4 → L0 ≥ 8 min at defaults; budget `level.recovery.time` ≤ 600 s).

**Status:** pure functions + 100 % unit-tested; **no runtime wiring** (no metric collector, no shared level in Redis, no middleware). Wiring plan: a 5 s timer reads `/metrics`-style counters → `nextLoadState` → publish `system:load_level` →
middleware reads a cached level and applies `laneDecision` per route class; `featuresForLevel(level).aiDegradationLevel` → `setAiDegradationLevel`.

## 3. Budgets (`perf-budgets.json`)

Per-tier targets for latency, success rates, resource ceilings and the shed rate of P0. Each budget has an `id`, `metric`, `unit`, `direction` (`max`/`min`), `gate`:

- `load-test` — enforced as k6 thresholds (`loadtests/k6/smoke.js` reads this file).
- `ci` — enforced by tests (`admission.enforced`).
- `monitor` — production alert only (needs the metrics pipeline).

Headline numbers: p95 non-media API < 200 ms (p99 < 500 ms); session init p99 < 500 ms; event ingest p95 < 150 ms; snapshot p95 < 400 ms; chunk-complete p95 < 250 ms;
WS connect ≥ 99.5 % (M) → 99.9 % (XL); recording upload ≥ 99 %; 5xx < 0.5 %; DB pool wait p95 < 20 ms; DB CPU < 70 %; server AI within 300 rps (M); **P0 shed rate 0**.
The file also lists soak sizes (30 min at 10k / 50k / 100k connections) and mirrors the degradation ladder. `test/capacity.test.mjs` validates the file's structure.

## 4. Measurement gates

A tier is "ready" only when **all** of these have been recorded for that tier (store results next to the run, e.g. `loadtests/results/<date>-<tier>/`):

1. **Gate 0 — unit/CI:** `npm run test:unit -w @proctorshield/platform-api` green (planner, controller, lanes, budgets file, lockdown signing).
2. **Gate 1 — smoke:** `k6 run -e SCENARIO=smoke` green; `/health` db/ai up.
3. **Gate 2 — soak at tier size:** hold the tier's connection count ≥ 30 min, then a 2 h exam-shaped run (join wave 20 min, steady state, leave wave). All `load-test` budgets for the tier pass.
4. **Gate 3 — resource gates (monitor):** DB CPU < 70 %, pool wait stable, API CPU from media ≈ 0, AI queue lag p95 < 5 s, telemetry write lag within budget, no OOM kills.
5. **Gate 4 — degradation drill:** the `underprovisioned` scenario: P0 failures < 1 %, background lanes shed, no crash, back to L0 within the recovery budget after load drops. (Requires the controller to be wired.)
6. **Gate 5 — first-bottleneck loop:** record which resource saturated first and what was changed; re-run. Do not declare a tier ready from a smaller run.

What to record per run: planner output for N, k6 summary (per-lane p50/p95/p99, error rate, shed rate), DB (CPU, connections, pool wait, write rows/s, replication lag), API/WS (CPU, RSS, event-loop lag, open sockets), storage (ingress, request rate), AI (queue depth, ticks/s), and the controller level timeline.

## 5. Not done

Runtime wiring of the controller and lanes; a metrics collector feeding it; WS load scenarios; media-byte benchmarks; measured constants for the planner; per-tenant fairness inside lanes; autoscaler (HPA/KEDA) rules derived from the planner.
