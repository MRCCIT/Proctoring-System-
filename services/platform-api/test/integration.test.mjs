/**
 * End-to-end tests against a running API (npm run dev:api) with a migrated + seeded database.
 *   npm test -w @proctorshield/platform-api
 * Env overrides: API_URL, TENANT_API_KEY, TENANT_ADMIN_EMAIL/PASSWORD, SUPERADMIN_EMAIL/PASSWORD.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

const API = (process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '');
const KEY_A = process.env.TENANT_API_KEY || 'psk_live_dev-demo-university-local-only-key';
const TENANT_ADMIN = {
  tenant_slug: process.env.TENANT_SLUG || 'demo-university',
  email: process.env.TENANT_ADMIN_EMAIL || 'admin@demo.edu',
  password: process.env.TENANT_ADMIN_PASSWORD || 'TenantAdmin!123',
};
const SUPERADMIN = {
  email: process.env.SUPERADMIN_EMAIL || 'superadmin@proctorshield.local',
  password: process.env.SUPERADMIN_PASSWORD || 'ChangeMe!123',
};
const RUN = `t${Date.now().toString(36)}`;

async function call(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

const keyA = { 'X-API-Key': KEY_A };
let adminA;
let keyB;
let hookServer;
let hookUrl;
let webhookId;
let webhookSecret;
const received = [];

function sessionBody(extra = {}) {
  return {
    external_candidate_id: `cand-${RUN}`,
    candidate_name: 'Test Candidate',
    candidate_email: `cand-${RUN}@example.test`,
    external_exam_id: `exam-${RUN}`,
    exam_title: `Integration Test Exam ${RUN}`,
    external_attempt_id: 'attempt-1',
    metadata: { course: 'QA-101' },
    ...extra,
  };
}

async function waitFor(pred, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = pred();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

before(async () => {
  const health = await call('GET', '/health').catch(() => null);
  assert.ok(health && health.status === 200, `API not reachable at ${API}`);

  const login = await call('POST', '/v1/tenant/auth/login', { body: TENANT_ADMIN });
  assert.equal(login.status, 200, `tenant admin login failed: ${JSON.stringify(login.body)}`);
  adminA = { Authorization: `Bearer ${login.body.access_token}` };

  const sa = await call('POST', '/v1/superadmin/auth/login', { body: SUPERADMIN });
  assert.equal(sa.status, 200, 'superadmin login failed');
  const created = await call('POST', '/v1/superadmin/tenants', {
    headers: { Authorization: `Bearer ${sa.body.access_token}` },
    body: { name: `Isolation Tenant ${RUN}`, slug: `iso-${RUN}` },
  });
  assert.equal(created.status, 201, `create tenant B failed: ${JSON.stringify(created.body)}`);
  keyB = { 'X-API-Key': created.body.api_key };

  hookServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ headers: req.headers, raw, body: JSON.parse(raw || '{}') });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise((r) => hookServer.listen(0, '127.0.0.1', r));
  hookUrl = `http://127.0.0.1:${hookServer.address().port}/hook`;
  const hook = await call('POST', '/v1/webhooks', {
    headers: adminA,
    body: { target_url: hookUrl, events: ['proctoring.*'], description: `test ${RUN}` },
  });
  assert.equal(hook.status, 201, `create webhook failed: ${JSON.stringify(hook.body)}`);
  webhookId = hook.body.data.id;
  webhookSecret = hook.body.data.signing_secret;
});

after(async () => {
  if (webhookId) await call('DELETE', `/v1/webhooks/${webhookId}`, { headers: adminA });
  hookServer?.close();
});

let sessionId;
let launchToken;
let sessionToken;

test('rejects session initiation without required fields', async () => {
  const r = await call('POST', '/v1/integration/sessions', { headers: keyA, body: { candidate_name: 'x' } });
  assert.equal(r.status, 422);
  assert.ok(r.body.errors.some((e) => e.includes('external_candidate_id')));
});

test('rejects integration calls without a valid API key', async () => {
  const r = await call('POST', '/v1/integration/sessions', { headers: { 'X-API-Key': 'psk_live_bogus' }, body: sessionBody() });
  assert.equal(r.status, 401);
});

test('creates a session and returns a launch link', async () => {
  const r = await call('POST', '/v1/integration/sessions', {
    headers: { ...keyA, 'Idempotency-Key': `idem-${RUN}` },
    body: sessionBody(),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.created, true);
  const d = r.body.data;
  sessionId = d.session_id;
  launchToken = d.launch_token;
  assert.equal(d.status, 'scheduled');
  assert.equal(d.candidate.name, 'Test Candidate');
  assert.equal(d.exam.external_exam_id, `exam-${RUN}`);
  assert.match(d.launch_url, /\?launch=/);
  assert.equal(d.metadata.course, 'QA-101');
  assert.equal(d.metadata._fingerprint, undefined);
});

test('idempotent replay returns the same session', async () => {
  const r = await call('POST', '/v1/integration/sessions', {
    headers: { ...keyA, 'Idempotency-Key': `idem-${RUN}` },
    body: sessionBody(),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.created, false);
  assert.equal(r.body.reason, 'idempotent_replay');
  assert.equal(r.body.data.session_id, sessionId);
});

test('reusing an Idempotency-Key with different input is a conflict', async () => {
  const r = await call('POST', '/v1/integration/sessions', {
    headers: { ...keyA, 'Idempotency-Key': `idem-${RUN}` },
    body: sessionBody({ external_attempt_id: 'attempt-other' }),
  });
  assert.equal(r.status, 409);
});

test('duplicate attempt without a key resolves to the existing open session', async () => {
  const r = await call('POST', '/v1/integration/sessions', { headers: keyA, body: sessionBody() });
  assert.equal(r.status, 200);
  assert.equal(r.body.reason, 'existing_open_session');
  assert.equal(r.body.data.session_id, sessionId);
});

test('webhook proctoring.session.created is delivered with a valid HMAC signature', async () => {
  const hit = await waitFor(() =>
    received.find((x) => x.body.type === 'proctoring.session.created' && x.body.data.session_id === sessionId)
  );
  assert.ok(hit, 'webhook not received');
  const sig = hit.headers['x-proctorshield-signature'];
  const [, t, v1] = /^t=(\d+),v1=([a-f0-9]+)$/.exec(sig) || [];
  const expected = crypto.createHmac('sha256', webhookSecret).update(`${t}.${hit.raw}`).digest('hex');
  assert.equal(v1, expected);
  assert.equal(hit.body.data.external_candidate_id, `cand-${RUN}`);
});

test('launch token exchanges for session-scoped credentials', async () => {
  const r = await call('POST', '/v1/sdk/public/launch/exchange', { body: { launch_token: launchToken } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.session_id, sessionId);
  assert.equal(r.body.data.candidate_name, 'Test Candidate');
  sessionToken = r.body.data.session_token;
  assert.ok(sessionToken && r.body.data.ws_token);
});

test('tampered or garbage launch tokens are rejected', async () => {
  const r = await call('POST', '/v1/sdk/public/launch/exchange', { body: { launch_token: `${launchToken}x` } });
  assert.equal(r.status, 401);
});

test('session token is scoped to its own session', async () => {
  const st = { 'X-Session-Token': sessionToken };
  const own = await call('GET', `/v1/sdk/sessions/${sessionId}/config`, { headers: st });
  assert.equal(own.status, 200);
  const other = await call('GET', `/v1/sdk/sessions/${crypto.randomUUID()}/config`, { headers: st });
  assert.equal(other.status, 403);
  const init = await call('POST', '/v1/sdk/sessions/init', { headers: st, body: {} });
  assert.equal(init.status, 403);
  const tenantApi = await call('GET', '/v1/sessions', { headers: { Authorization: `Bearer ${sessionToken}` } });
  assert.equal(tenantApi.status, 401);
});

test('candidate stream start activates the session and events are recorded', async () => {
  const st = { 'X-Session-Token': sessionToken };
  const s = await call('POST', `/v1/sdk/sessions/${sessionId}/stream/start`, { headers: st, body: {} });
  assert.equal(s.status, 200);
  assert.equal(s.body.data.status, 'active');
  const ev = await call('POST', '/v1/sdk/events', {
    headers: st,
    body: {
      session_id: sessionId,
      events: [
        { type: 'violation.tab_hidden', severity: 'warn' },
        { type: 'violation.tab_visible', severity: 'warn' },
      ],
    },
  });
  assert.equal(ev.status, 201);
  const foreign = await call('POST', '/v1/sdk/events', {
    headers: st,
    body: { session_id: crypto.randomUUID(), events: [{ type: 'violation.tab_hidden' }] },
  });
  assert.equal(foreign.status, 403);
});

test('tenant B cannot see or modify tenant A sessions', async () => {
  const get = await call('GET', `/v1/integration/sessions/${sessionId}`, { headers: keyB });
  assert.equal(get.status, 404);
  const end = await call('POST', `/v1/integration/sessions/${sessionId}/end`, { headers: keyB, body: {} });
  assert.equal(end.status, 404);
  const report = await call('GET', `/v1/integration/sessions/${sessionId}/report`, { headers: keyB });
  assert.equal(report.status, 404);
  const sdk = await call('GET', `/v1/sdk/sessions/${sessionId}/config`, { headers: keyB });
  assert.equal(sdk.status, 404);
  const list = await call('GET', `/v1/integration/sessions?external_candidate_id=cand-${RUN}`, { headers: keyB });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 0);
});

test('tenant admin sees enriched session with violation counts (info events excluded)', async () => {
  const r = await call('GET', `/v1/sessions?q=${RUN}`, { headers: adminA });
  assert.equal(r.status, 200);
  const row = r.body.data.find((s) => s.id === sessionId);
  assert.ok(row, 'session not in tenant list');
  assert.equal(row.candidate_name, 'Test Candidate');
  assert.equal(row.status, 'active');
  assert.equal(row.violation_count, 1);
});

test('review workflow: dismiss requires a note, decision is audited', async () => {
  const detail = await call('GET', `/v1/sessions/${sessionId}`, { headers: adminA });
  assert.equal(detail.status, 200);
  const ev = detail.body.data.events.find((e) => e.code === 'tab_hidden');
  assert.ok(ev, 'violation event missing');
  assert.equal(ev.label, 'Left the exam tab');

  const noNote = await call('POST', `/v1/sessions/${sessionId}/events/${ev.id}/review`, {
    headers: adminA,
    body: { action: 'dismiss' },
  });
  assert.equal(noNote.status, 422);
  const ok = await call('POST', `/v1/sessions/${sessionId}/events/${ev.id}/review`, {
    headers: adminA,
    body: { action: 'dismiss', note: 'Candidate reported a notification popup' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.review_status, 'dismissed');

  const noSummary = await call('POST', `/v1/sessions/${sessionId}/review/decision`, {
    headers: adminA,
    body: { decision: 'flagged' },
  });
  assert.equal(noSummary.status, 422);
  const decided = await call('POST', `/v1/sessions/${sessionId}/review/decision`, {
    headers: adminA,
    body: { decision: 'cleared', summary: 'No integrity concerns.' },
  });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.data.review_decision, 'cleared');

  const history = await call('GET', `/v1/sessions/${sessionId}/review`, { headers: adminA });
  assert.ok(history.body.data.some((h) => h.action === 'event_dismissed'));
  assert.ok(history.body.data.some((h) => h.action === 'session_cleared'));
});

test('ending is idempotent and closed sessions cannot be relaunched', async () => {
  const e1 = await call('POST', `/v1/integration/sessions/${sessionId}/end`, { headers: keyA, body: {} });
  assert.equal(e1.status, 200);
  assert.equal(e1.body.data.status, 'completed');
  assert.equal(e1.body.already_closed, false);
  const e2 = await call('POST', `/v1/integration/sessions/${sessionId}/end`, { headers: keyA, body: { status: 'failed' } });
  assert.equal(e2.status, 200);
  assert.equal(e2.body.data.status, 'completed');
  assert.equal(e2.body.already_closed, true);

  const relaunch = await call('POST', '/v1/sdk/public/launch/exchange', { body: { launch_token: launchToken } });
  assert.equal(relaunch.status, 409);
  const again = await call('POST', '/v1/integration/sessions', { headers: keyA, body: sessionBody() });
  assert.equal(again.status, 409);

  const done = await waitFor(() =>
    received.find((x) => x.body.type === 'proctoring.session.completed' && x.body.data.session_id === sessionId)
  );
  assert.ok(done, 'completed webhook not received');
});

test('integrity report summarizes signals without scores or verdicts', async () => {
  const r = await call('GET', `/v1/integration/sessions/${sessionId}/report`, { headers: keyA });
  assert.equal(r.status, 200);
  const rep = r.body.data;
  assert.equal(rep.report_type, 'proctoring_integrity_report');
  assert.equal(rep.candidate.name, 'Test Candidate');
  assert.equal(rep.violations.total, 1);
  assert.equal(rep.violations.dismissed, 1);
  assert.equal(rep.review.decision, 'cleared');
  assert.match(rep.disclaimer, /not determinations of misconduct/);
  const text = JSON.stringify(rep).toLowerCase();
  assert.ok(!text.includes('"score"') && !text.includes('cheat'));
});

test('access link: name + exam name are mandatory and the session reflects in admin', async () => {
  const link = await call('POST', '/v1/access-links', { headers: adminA, body: { label: `Open link ${RUN}` } });
  assert.equal(link.status, 201);
  const token = new URL(link.body.data.url).searchParams.get('link');
  const desc = await call('GET', `/v1/sdk/public/links/describe?token=${encodeURIComponent(token)}`);
  assert.equal(desc.status, 200);
  assert.equal(desc.body.data.requires_exam_title, true);

  const noName = await call('POST', '/v1/sdk/public/links/start', { body: { link_token: token, exam_title: 'X' } });
  assert.equal(noName.status, 422);
  const noExam = await call('POST', '/v1/sdk/public/links/start', { body: { link_token: token, candidate_name: 'Ada Lovelace' } });
  assert.equal(noExam.status, 422);
  const started = await call('POST', '/v1/sdk/public/links/start', {
    body: { link_token: token, candidate_name: 'Ada Lovelace', exam_title: `Link Exam ${RUN}` },
  });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const sid = started.body.data.session_id;

  const list = await call('GET', `/v1/sessions?q=${encodeURIComponent(`Link Exam ${RUN}`)}`, { headers: adminA });
  const row = list.body.data.find((s) => s.id === sid);
  assert.ok(row);
  assert.equal(row.candidate_name, 'Ada Lovelace');
  assert.equal(row.exam_title, `Link Exam ${RUN}`);

  const off = await call('PATCH', `/v1/access-links/${link.body.data.id}`, { headers: adminA, body: { is_active: false } });
  assert.equal(off.status, 200);
  const blocked = await call('POST', '/v1/sdk/public/links/start', {
    body: { link_token: token, candidate_name: 'Someone Else', exam_title: 'X' },
  });
  assert.equal(blocked.status, 403);
});

test('webhook delivery log is visible to the tenant only', async () => {
  const a = await call('GET', `/v1/webhooks/deliveries?webhook_id=${webhookId}`, { headers: adminA });
  assert.equal(a.status, 200);
  assert.ok(a.body.data.some((d) => d.status === 'delivered'));
  const b = await call('GET', `/v1/webhooks/deliveries?webhook_id=${webhookId}`, { headers: keyB });
  assert.equal(b.status, 200);
  assert.equal(b.body.data.length, 0);
});
