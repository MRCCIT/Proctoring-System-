/**
 * Worker source code embedded as a string so the SDK can spin up a
 * Web Worker without needing extra bundler config from the integrator.
 *
 * The worker:
 *   1. Lazily loads `FaceDetector` (Chromium) if available — completely off the main thread.
 *   2. Otherwise falls back to a naive luminance-variance heuristic — still off-thread.
 *   3. Posts back {face_count, detector, ts} for each frame received.
 *
 * Heavy face matching (ArcFace) remains a server call; this worker just
 * answers "is a face present? how many?" at ~10s intervals across 50k+
 * concurrent users without ever blocking React renders.
 */
export const FACE_CHECK_WORKER_SOURCE = `
self.faceDetector = null;
self.detectorKind = 'heuristic';

self.tryInitDetector = async function() {
  try {
    if (typeof FaceDetector === 'function') {
      self.faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      self.detectorKind = 'native_FaceDetector';
      return true;
    }
  } catch (_) {}
  return false;
};

self.heuristicFaceCount = function(bitmap) {
  // Very cheap: read a 32x32 luminance grid, count rows that contain a strong vertical edge.
  // This is a fallback. It won't beat a real model, but it is non-blocking and very fast.
  const w = 32, h = 32;
  const off = new OffscreenCanvas(w, h);
  const ctx = off.getContext('2d');
  if (!ctx) return 0;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w*h);
  for (let i = 0; i < w*h; i++) {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    lum[i] = 0.2126*r + 0.7152*g + 0.0722*b;
  }
  let strongRows = 0;
  for (let y = 0; y < h; y++) {
    let edges = 0;
    for (let x = 1; x < w; x++) {
      if (Math.abs(lum[y*w + x] - lum[y*w + x - 1]) > 22) edges++;
    }
    if (edges > 4) strongRows++;
  }
  // This fallback is presence-only. Edge density cannot reliably distinguish
  // a close-up face from multiple people.
  if (strongRows < 4) return 0;
  return 1;
};

self.analyzeBitmap = async function(bitmap) {
  const ts = Date.now();
  if (!self.faceDetector) {
    const ok = await self.tryInitDetector();
    if (!ok) {
      const fc = self.heuristicFaceCount(bitmap);
      return { face_count: fc, detector: 'heuristic', ts };
    }
  }
  try {
    const faces = await self.faceDetector.detect(bitmap);
    return { face_count: faces.length, detector: self.detectorKind, ts };
  } catch (_) {
    const fc = self.heuristicFaceCount(bitmap);
    return { face_count: fc, detector: 'heuristic_fallback', ts };
  }
};

self.onmessage = async function(e) {
  const { id, bitmap } = e.data || {};
  if (!bitmap) {
    self.postMessage({ id, error: 'no_bitmap' });
    return;
  }
  try {
    const result = await self.analyzeBitmap(bitmap);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  } finally {
    try { bitmap.close && bitmap.close(); } catch(_){}
  }
};
`;

export function createFaceCheckWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    const blob = new Blob([FACE_CHECK_WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
  } catch {
    return null;
  }
}
