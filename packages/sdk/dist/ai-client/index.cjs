"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/ai-client/index.ts
var ai_client_exports = {};
__export(ai_client_exports, {
  AudioAnalyzer: () => AudioAnalyzer,
  CloudInference: () => CloudInference,
  FACE_CHECK_WORKER_SOURCE: () => FACE_CHECK_WORKER_SOURCE,
  FaceCheckService: () => FaceCheckService,
  FaceDetector: () => FaceDetector,
  GazeEstimator: () => GazeEstimator,
  LocalInference: () => LocalInference,
  ObjectDetector: () => ObjectDetector,
  createFaceCheckWorker: () => createFaceCheckWorker
});
module.exports = __toCommonJS(ai_client_exports);

// src/ai-client/LocalInference.ts
var LocalInference = class {
  async analyzeFrame(_imageDataUrl) {
    return { violations: [] };
  }
};

// src/ai-client/CloudInference.ts
var CloudInference = class {
  constructor(client) {
    this.client = client;
  }
  async analyzeFrame(sessionId, imageDataUrl, persist = true) {
    return this.client.analyzeFrameAi(sessionId, imageDataUrl, persist);
  }
};

// src/ai-client/FaceDetector.ts
var FaceDetector = class {
  constructor() {
    this.detector = null;
    this.kind = "unavailable";
  }
  init() {
    try {
      const Native = window.FaceDetector;
      if (Native) {
        this.detector = new Native({ fastMode: true, maxDetectedFaces: 5 });
        this.kind = "native";
      }
    } catch {
    }
  }
  async detect(source) {
    if (!this.detector) this.init();
    if (this.kind === "native" && this.detector) {
      try {
        const det = this.detector;
        const r = await det.detect(source);
        return { faceCount: r.length, detector: "native_FaceDetector" };
      } catch {
        return { faceCount: 0, detector: "native_error" };
      }
    }
    return { faceCount: 0, detector: "unavailable" };
  }
  async detectFromDataUrl(imageDataUrl) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = imageDataUrl;
    });
    const r = await this.detect(img);
    return { faceCount: r.faceCount };
  }
};

// src/ai-client/GazeEstimator.ts
var GazeEstimator = class {
  estimate(_landmarks) {
    return { direction: "center", away: false };
  }
};

// src/ai-client/ObjectDetector.ts
var ObjectDetector = class {
  async detectPhone(_imageDataUrl) {
    return false;
  }
};

// src/ai-client/AudioAnalyzer.ts
var AudioAnalyzer = class {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.timer = null;
    this.listeners = /* @__PURE__ */ new Set();
  }
  start(stream, intervalMs = 1500) {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.source.connect(this.analyser);
      this.timer = setInterval(() => this.tick(), intervalMs);
    } catch {
    }
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  tick() {
    if (!this.analyser || !this.ctx) return;
    const bufLen = this.analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < bufLen; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / bufLen) / 255;
    const hzPerBin = this.ctx.sampleRate / 2 / bufLen;
    const voiceLow = Math.floor(300 / hzPerBin);
    const voiceHigh = Math.min(bufLen - 1, Math.floor(3e3 / hzPerBin));
    let voiceEnergy = 0;
    for (let i = voiceLow; i < voiceHigh; i++) voiceEnergy += data[i];
    const voiceRatio = voiceEnergy / ((voiceHigh - voiceLow) * 255 || 1);
    const reading = {
      level: rms,
      voice_detected: voiceRatio > 0.12,
      noise: Math.min(1, rms * 1.5),
      ts: Date.now()
    };
    this.listeners.forEach((fn) => fn(reading));
  }
  /** Legacy alias used by ExamFrame placeholder */
  async analyze(_buffer) {
    return { voice_detected: false, noise: 0 };
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      void this.ctx?.close();
    } catch {
    }
    this.ctx = null;
    this.source = null;
    this.analyser = null;
  }
};

// src/ai-client/FaceCheckWorker.ts
var FACE_CHECK_WORKER_SOURCE = `
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
  // Map "rows with edges" to a coarse face_count estimate.
  if (strongRows < 4) return 0;
  if (strongRows < 18) return 1;
  return 2;
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
function createFaceCheckWorker() {
  if (typeof Worker === "undefined") return null;
  try {
    const blob = new Blob([FACE_CHECK_WORKER_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
  } catch {
    return null;
  }
}

// src/ai-client/FaceCheckService.ts
var FaceCheckService = class {
  constructor(client, sessionId, opts = {}) {
    this.client = client;
    this.sessionId = sessionId;
    this.worker = null;
    this.timer = null;
    this.flushTimer = null;
    this.queue = [];
    this.running = false;
    this.msgId = 0;
    this.opts = {
      intervalMs: opts.intervalMs ?? 1e4,
      flushAt: opts.flushAt ?? 6,
      flushIntervalMs: opts.flushIntervalMs ?? 3e4,
      onResult: opts.onResult ?? (() => {
      })
    };
  }
  start(video) {
    if (this.running) return;
    this.running = true;
    this.worker = createFaceCheckWorker();
    this.timer = setInterval(() => void this.captureOnce(video), this.opts.intervalMs);
    this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs);
  }
  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.timer = null;
    this.flushTimer = null;
    try {
      this.worker?.terminate();
    } catch {
    }
    this.worker = null;
    void this.flush();
  }
  async captureOnce(video) {
    if (!this.worker || !video.videoWidth) return;
    try {
      const bitmap = await this.captureBitmap(video);
      if (!bitmap) return;
      const id = ++this.msgId;
      const promise = new Promise((resolve) => {
        const handler = (e) => {
          if (e.data?.id !== id) return;
          this.worker?.removeEventListener("message", handler);
          resolve(e.data.result || null);
        };
        this.worker?.addEventListener("message", handler);
        setTimeout(() => {
          this.worker?.removeEventListener("message", handler);
          resolve(null);
        }, 4e3);
      });
      this.worker.postMessage({ id, bitmap }, [bitmap]);
      const res = await promise;
      if (!res) return;
      const violations = [];
      if (res.face_count === 0) violations.push("no_face_detected");
      if (res.face_count > 1) violations.push("multiple_faces_detected");
      const result = { ...res, violations };
      this.queue.push(result);
      this.opts.onResult(result);
      if (this.queue.length >= this.opts.flushAt) void this.flush();
    } catch {
    }
  }
  async captureBitmap(video) {
    try {
      if (typeof window.createImageBitmap === "function") {
        return await createImageBitmap(video, {
          resizeWidth: 320,
          resizeHeight: 240,
          resizeQuality: "low"
        });
      }
    } catch {
    }
    return null;
  }
  async flush() {
    if (!this.queue.length) return;
    const items = this.queue.splice(0, this.queue.length).map((r) => ({
      face_count: r.face_count,
      detector: r.detector,
      occurred_at: new Date(r.ts).toISOString(),
      violations: r.violations
    }));
    try {
      await this.client.postFaceChecks(this.sessionId, items);
    } catch {
      this.queue.unshift(...items.map((it) => ({
        face_count: Number(it.face_count) || 0,
        detector: String(it.detector || "unknown"),
        ts: new Date(it.occurred_at).getTime(),
        violations: it.violations || []
      })));
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AudioAnalyzer,
  CloudInference,
  FACE_CHECK_WORKER_SOURCE,
  FaceCheckService,
  FaceDetector,
  GazeEstimator,
  LocalInference,
  ObjectDetector,
  createFaceCheckWorker
});
//# sourceMappingURL=index.cjs.map