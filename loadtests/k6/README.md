# k6 load tests (Phase 7)

| Script | Goal |
|--------|------|
| `smoke.js` | Sanity health check against local API |
| `exam-1k.js` | Ramp ~1k VUs |
| `exam-10k.js` | Ramp ~10k VUs |
| `under-provisioned.js` | Aggressive health polling (under-provisioned soak) |

Run smoke (requires API up):

```bash
k6 run loadtests/k6/smoke.js
```

Pass/fail should align with `perf-budgets.json`.
