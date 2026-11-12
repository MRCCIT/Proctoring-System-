# Safe Exam Browser (SEB) headers

When an exam lockdown policy `mode` is **STRICT**, the API expects SEB integrity headers on candidate session routes (e.g. lockdown-events, media presign).

| Header | Purpose |
|--------|---------|
| `X-SafeExamBrowser-RequestHash` | Browser Exam Key hash for the request |
| `X-SafeExamBrowser-ConfigKeyHash` | SEB configuration key hash |

Set server env to enforce (optional — when unset, headers must still be present but values are not verified):

- `SEB_CONFIG_KEY_HASH` — expected config key (plaintext or precomputed SHA-256 hex)
- `SEB_BROWSER_EXAM_KEY_HASH` — expected Browser Exam Key material

SEB is optional. A normal browser cannot be fully locked; STRICT mode is for organizations that require SEB or a kiosk bridge.
