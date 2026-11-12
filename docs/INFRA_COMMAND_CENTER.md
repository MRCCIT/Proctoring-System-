# Infrastructure Command Center

Super Admin surface under `/infrastructure/*` backed by `/v1/superadmin/infrastructure/*`.

## Safety

- Collectors never throw into exam/request paths.
- P0 heartbeats and P1 violations are never shed by lane policy.
- Monitoring failure does not block session init (admission errors other than 429 fail open on integration path).
- Optimization starts in **OBSERVE** mode — approve/reject only; no destructive auto actions.
- Hardware missing sensors render as **Unavailable**, not `0`.

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `OBSERVABILITY_ENABLED` | on (`!== '0'`) | Collector + emit |
| `OBSERVABILITY_INTERVAL_MS` | `15000` | Probe/snapshot interval |
| `OBSERVABILITY_FLUSH_MS` | `5000` | Rollup flush |
| `REDIS_URL` | empty | Optional Redis |
| `AI_DEGRADATION_LEVEL` | `0` | Initial degrade |

## Key endpoints

- `GET /v1/superadmin/infrastructure/overview`
- `GET /v1/superadmin/infrastructure/services/:service`
- `GET /v1/superadmin/infrastructure/tenants/:id`
- `PUT /v1/superadmin/infrastructure/global-policies`
- `PUT /v1/superadmin/infrastructure/tenants/:id/policies`
- `GET /metrics` (Prometheus)

## Migration

`014_infra_command_center.sql` — policies, rollups, nodes, alerts, recommendations, control audit.
