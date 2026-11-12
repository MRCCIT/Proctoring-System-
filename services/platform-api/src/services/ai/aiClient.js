import { config } from '../../config/index.js';

function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

const callStats = {
  total: 0,
  errors: 0,
  rejected: 0,
  samples: [],
};

function recordCall(ok, latencyMs, status) {
  callStats.total += 1;
  if (!ok) callStats.errors += 1;
  if (status === 503) callStats.rejected += 1;
  callStats.samples.push({ ts: Date.now(), ok, latency_ms: latencyMs, status });
  if (callStats.samples.length > 500) callStats.samples.splice(0, callStats.samples.length - 500);
}

export function getAiGatewayStats() {
  const now = Date.now();
  const window = callStats.samples.filter((s) => now - s.ts <= 60_000);
  const lat = window.map((s) => s.latency_ms).sort((a, b) => a - b);
  const errors = window.filter((s) => !s.ok).length;
  const avg = lat.length ? Math.round((lat.reduce((a, b) => a + b, 0) / lat.length) * 10) / 10 : null;
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.round(lat.length * 0.95))] : null;
  return {
    total_requests: callStats.total,
    total_errors: callStats.errors,
    rejected_503: callStats.rejected,
    last_1m: {
      requests: window.length,
      errors,
      error_rate: window.length ? Number((errors / window.length).toFixed(4)) : 0,
      latency_ms: { avg, p95 },
    },
  };
}

async function postJson(path, body) {
  const url = joinUrl(config.aiServiceUrl, path);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    recordCall(res.ok, Date.now() - started, res.status);
    if (!res.ok) {
      const detail = json?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg || d).join('; ')
            : json?.message || res.statusText || 'AI service error';
      const err = new Error(msg);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } catch (e) {
    if (e?.status == null) recordCall(false, Date.now() - started, 0);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function analyzeFrame(imageDataUrl) {
  return postJson('/internal/analyze-frame', { image: imageDataUrl });
}

export async function detectPhone(imageDataUrl) {
  return postJson('/internal/phone-detect', { image: imageDataUrl });
}

export async function compareFaces(payload) {
  return postJson('/internal/face-compare', payload);
}

/** Unified face + gaze + phone + identity tick (reference backend analyze_frame). */
export async function analyzeSessionFrame(payload) {
  return postJson('/internal/analyze-session', payload);
}

export async function fetchAiHealth() {
  const url = joinUrl(config.aiServiceUrl, '/health');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const latency_ms = Date.now() - started;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      reachable: res.ok,
      http_status: res.status,
      latency_ms,
      url: config.aiServiceUrl,
      body,
    };
  } catch (e) {
    return {
      reachable: false,
      http_status: 0,
      latency_ms: Date.now() - started,
      url: config.aiServiceUrl,
      error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e),
      body: null,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function probeAiHealth() {
  const h = await fetchAiHealth();
  return h.reachable;
}
