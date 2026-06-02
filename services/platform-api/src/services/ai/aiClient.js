import { config } from '../../config/index.js';

function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function postJson(path, body) {
  const url = joinUrl(config.aiServiceUrl, path);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.aiServiceTimeoutMs);
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

export async function probeAiHealth() {
  const url = joinUrl(config.aiServiceUrl, '/health');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
