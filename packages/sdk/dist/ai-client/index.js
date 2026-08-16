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
    return this.client.monitorTickAi(sessionId, imageDataUrl, persist);
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
      voice_detected: voiceRatio > 0.22 && rms > 0.06,
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

// src/ai-client/AiSidecarThrottle.ts
var AiSidecarThrottle = class {
  constructor(opts = {}) {
    this.nextAllowedAt = /* @__PURE__ */ new Map();
    this.failures = 0;
    this.openedAt = 0;
    this.minIntervalMs = opts.minIntervalMs ?? 3e4;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 6e4;
  }
  /** Returns true if a call on `channel` may proceed now. */
  allow(channel) {
    const now = Date.now();
    if (this.openedAt && now - this.openedAt < this.cooldownMs) return false;
    if (this.openedAt && now - this.openedAt >= this.cooldownMs) {
      this.openedAt = 0;
      this.failures = 0;
    }
    const next = this.nextAllowedAt.get(channel) ?? 0;
    return now >= next;
  }
  /** Records that a call has been issued so we don't double-fire. */
  reserve(channel) {
    this.nextAllowedAt.set(channel, Date.now() + this.minIntervalMs);
  }
  recordSuccess() {
    this.failures = 0;
    this.openedAt = 0;
  }
  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = Date.now();
  }
  get state() {
    const now = Date.now();
    const open = Boolean(this.openedAt && now - this.openedAt < this.cooldownMs);
    return {
      open,
      failures: this.failures,
      cooldownRemainingMs: open ? this.cooldownMs - (now - this.openedAt) : 0
    };
  }
};

// src/media/captureFrame.ts
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function resolveMediaStream(stream, video) {
  if (stream?.getVideoTracks().some((t) => t.readyState === "live")) return stream;
  if (video?.srcObject instanceof MediaStream) {
    const s = video.srcObject;
    if (s.getVideoTracks().some((t) => t.readyState === "live")) return s;
  }
  return stream || (video?.srcObject instanceof MediaStream ? video.srcObject : null);
}
function waitForVideoReady(video, timeoutMs = 6e3) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("playing", onReady);
      resolve(ok);
    };
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("playing", onReady);
    void video.play().catch(() => {
    });
    window.setTimeout(() => finish(video.videoWidth > 0 && video.videoHeight > 0), timeoutMs);
  });
}
function drawVideoToJpeg(video, quality = 0.82, maxWidth = 960) {
  try {
    if (!video.videoWidth || !video.videoHeight) return null;
    const targetW = Math.min(maxWidth, video.videoWidth);
    const scale = targetW / video.videoWidth;
    const targetH = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}
async function captureViaImageCapture(track) {
  const ImageCaptureCtor = window.ImageCapture;
  if (!ImageCaptureCtor) return null;
  try {
    const blob = await new ImageCaptureCtor(track).takePhoto();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}
async function captureViaTempVideo(stream, timeoutMs = 6e3) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.srcObject = stream;
  const ready = await waitForVideoReady(v, timeoutMs);
  if (!ready) {
    v.srcObject = null;
    return null;
  }
  const url = drawVideoToJpeg(v);
  v.srcObject = null;
  return url;
}
async function captureFrameForAi(stream, existingVideo) {
  const raw = await captureFrameFromStream(stream, existingVideo, { maxWidth: 480, quality: 0.72 });
  if (!raw) return null;
  return downscaleDataUrl(raw, 360, 0.62);
}
async function captureFrameFromStream(stream, existingVideo, opts = {}) {
  const maxWidth = opts.maxWidth ?? 960;
  const quality = opts.quality ?? 0.82;
  const resolved = resolveMediaStream(stream, existingVideo);
  if (existingVideo?.videoWidth && existingVideo.videoHeight) {
    const direct = drawVideoToJpeg(existingVideo, quality, maxWidth);
    if (direct) return direct;
  }
  if (resolved) {
    const track = resolved.getVideoTracks().find((t) => t.readyState === "live");
    if (track) {
      const fromCapture = await captureViaImageCapture(track);
      if (fromCapture) {
        if (maxWidth < 960) return downscaleDataUrl(fromCapture, maxWidth, quality);
        return fromCapture;
      }
    }
    if (existingVideo) {
      if (existingVideo.srcObject !== resolved) {
        existingVideo.srcObject = resolved;
        await existingVideo.play().catch(() => {
        });
      }
      const ready = await waitForVideoReady(existingVideo);
      if (ready) {
        const fromBound = drawVideoToJpeg(existingVideo, quality, maxWidth);
        if (fromBound) return fromBound;
      }
    }
    const fromTemp = await captureViaTempVideo(resolved);
    if (fromTemp && maxWidth < 960) {
      return downscaleDataUrl(fromTemp, maxWidth, quality);
    }
    return fromTemp;
  }
  if (existingVideo) {
    const ready = await waitForVideoReady(existingVideo);
    if (ready) return drawVideoToJpeg(existingVideo, quality, maxWidth);
  }
  return null;
}
function downscaleDataUrl(dataUrl, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(maxWidth, img.width);
        const h = Math.round(img.height / img.width * w) || 1;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
async function dataUrlToImageBitmap(dataUrl) {
  try {
    if (typeof createImageBitmap === "function") {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    }
  } catch {
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        void createImageBitmap(canvas).then(resolve).catch(() => resolve(null));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// src/ai-client/identityMatch.ts
var DEFAULT_IDENTITY_MIN_SIMILARITY = 62;
function normalizeMinSimilarity(threshold) {
  if (threshold > 1 && threshold <= 100) return threshold;
  if (threshold > 0 && threshold <= 1) return threshold * 100;
  return DEFAULT_IDENTITY_MIN_SIMILARITY;
}
function similarityPercent(data) {
  if (!data) return null;
  const raw = data.similarity ?? data.similarity_score;
  const sim = Number(raw);
  if (!Number.isFinite(sim)) return null;
  return sim <= 1 ? sim * 100 : sim;
}
function isIdentityVerified(data, minSimilarity = DEFAULT_IDENTITY_MIN_SIMILARITY) {
  if (!data) return false;
  const min = normalizeMinSimilarity(minSimilarity);
  const pct = similarityPercent(data);
  if (pct == null) return false;
  if (pct < min) return false;
  if (data.verified === false) return false;
  return true;
}

// src/ai-client/FaceCheckService.ts
var FaceCheckService = class {
  constructor(client, sessionId, opts = {}) {
    this.client = client;
    this.sessionId = sessionId;
    this.worker = null;
    this.timer = null;
    this.flushTimer = null;
    this.serverInterval = null;
    this.serverTickInFlight = false;
    this.serverTickSerial = 0;
    this.serverCatchUp = false;
    this.queue = [];
    this.running = false;
    this.msgId = 0;
    this.localCheckCount = 0;
    this.localMultiFaceStreak = 0;
    this.currentVideo = null;
    this.opts = {
      intervalMs: opts.intervalMs ?? 1e4,
      flushAt: opts.flushAt ?? 6,
      flushIntervalMs: opts.flushIntervalMs ?? 3e4,
      onResult: opts.onResult ?? (() => {
      }),
      getStream: opts.getStream ?? (() => null),
      serverAi: opts.serverAi ?? false,
      analyzeMinIntervalMs: opts.analyzeMinIntervalMs ?? 500,
      phoneCheckMinIntervalMs: opts.phoneCheckMinIntervalMs ?? 1e3,
      serverHeartbeatEvery: opts.serverHeartbeatEvery ?? 3,
      onServerAnalysis: opts.onServerAnalysis ?? (() => {
      }),
      onServerPhoneCheck: opts.onServerPhoneCheck ?? (() => {
      }),
      onServerTick: opts.onServerTick ?? (() => {
      }),
      onServerError: opts.onServerError ?? (() => {
      }),
      persistServerAi: opts.persistServerAi ?? true,
      referenceImage: opts.referenceImage ?? null,
      identityThreshold: opts.identityThreshold ?? DEFAULT_IDENTITY_MIN_SIMILARITY
    };
    this.monitorThrottle = new AiSidecarThrottle({
      minIntervalMs: 0,
      failureThreshold: 12,
      cooldownMs: 1e4
    });
  }
  start(video) {
    if (this.running) return;
    this.running = true;
    this.currentVideo = video;
    this.worker = createFaceCheckWorker();
    this.timer = setInterval(() => void this.captureOnce(video), this.opts.intervalMs);
    this.flushTimer = setInterval(() => void this.flush(), this.opts.flushIntervalMs);
    if (this.opts.serverAi) {
      void this.runServerAi("heartbeat");
      this.serverInterval = setInterval(
        () => void this.runServerAi("heartbeat"),
        this.opts.analyzeMinIntervalMs
      );
    }
  }
  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.serverInterval) clearInterval(this.serverInterval);
    this.timer = null;
    this.flushTimer = null;
    this.serverInterval = null;
    try {
      this.worker?.terminate();
    } catch {
    }
    this.worker = null;
    this.currentVideo = null;
    void this.flush();
  }
  get aiState() {
    return { monitor: this.monitorThrottle.state };
  }
  setReferenceImage(dataUrl) {
    this.opts.referenceImage = dataUrl;
  }
  async captureFrame() {
    const stream = this.opts.getStream();
    const video = this.currentVideo;
    if (!stream && !video) return null;
    return captureFrameForAi(stream, video);
  }
  async captureOnce(video) {
    if (!this.worker) return;
    try {
      const dataUrl = await captureFrameFromStream(this.opts.getStream(), video, { maxWidth: 320, quality: 0.7 });
      if (!dataUrl) return;
      const bitmap = await dataUrlToImageBitmap(dataUrl);
      if (bitmap) {
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
          }, 2500);
        });
        this.worker.postMessage({ id, bitmap }, [bitmap]);
        const res = await promise;
        if (res) {
          const violations2 = [];
          if (res.face_count === 0) violations2.push("no_face_detected");
          const trustedMultiFace = res.detector === "native_FaceDetector" && res.face_count > 1;
          this.localMultiFaceStreak = trustedMultiFace ? this.localMultiFaceStreak + 1 : 0;
          if (!this.opts.serverAi && this.localMultiFaceStreak >= 2) {
            violations2.push("multiple_faces_detected");
          }
          const result = { ...res, violations: violations2 };
          this.enqueueLocal(result);
          if (this.opts.serverAi && violations2.includes("no_face_detected")) {
            void this.runServerAi("suspicious");
          }
          return;
        }
      }
      const fc = await this.estimateFaceCountFromDataUrl(dataUrl);
      const violations = [];
      if (fc === 0) violations.push("no_face_detected");
      this.localMultiFaceStreak = 0;
      this.enqueueLocal({
        face_count: fc,
        detector: "canvas_fallback",
        ts: Date.now(),
        violations
      });
      if (this.opts.serverAi && violations.length) void this.runServerAi("suspicious");
    } catch {
    }
  }
  enqueueLocal(result) {
    this.queue.push(result);
    this.opts.onResult(result);
    this.localCheckCount += 1;
    if (this.queue.length >= this.opts.flushAt) void this.flush();
  }
  async estimateFaceCountFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = 160;
          const h = Math.round(img.height / img.width * w) || 120;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(1);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let skin = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) skin += 1;
          }
          const ratio = skin / (w * h);
          if (ratio < 0.08) resolve(0);
          else resolve(1);
        } catch {
          resolve(1);
        }
      };
      img.onerror = () => resolve(1);
      img.src = dataUrl;
    });
  }
  async runServerAi(_reason) {
    if (!this.opts.serverAi || !this.running) return;
    if (this.serverTickInFlight) {
      this.serverCatchUp = true;
      return;
    }
    if (!this.monitorThrottle.allow("monitor")) {
      const st = this.monitorThrottle.state;
      if (st.open) {
        this.opts.onServerError(`AI paused (circuit open, retry in ${Math.ceil(st.cooldownRemainingMs / 1e3)}s)`);
      }
      return;
    }
    const tickId = ++this.serverTickSerial;
    this.serverTickInFlight = true;
    try {
      const img = await this.captureFrame();
      if (!img || tickId !== this.serverTickSerial) return;
      const body = { load_reference: true };
      if (this.opts.referenceImage) {
        body.reference_image = this.opts.referenceImage;
        body.load_reference = false;
      }
      body.identity_threshold = normalizeMinSimilarity(this.opts.identityThreshold);
      const r = await this.client.monitorTickAi(this.sessionId, img, this.opts.persistServerAi, body);
      if (tickId !== this.serverTickSerial) return;
      this.monitorThrottle.recordSuccess();
      const payload = r?.data;
      const analysis = payload && typeof payload === "object" && "analysis" in payload ? payload.analysis : payload;
      if (!analysis || typeof analysis !== "object" || !("face_count" in analysis)) {
        this.opts.onServerError("AI returned an empty analysis payload");
        return;
      }
      this.opts.onServerAnalysis(analysis);
      this.opts.onServerTick({
        ...analysis,
        ok: true
      });
      this.opts.onServerPhoneCheck({
        phone_detected: Boolean(analysis.phone_detected),
        yolo_enabled: Boolean(analysis.phone_yolo_enabled)
      });
    } catch (e) {
      this.monitorThrottle.recordFailure();
      this.opts.onServerError(e.message || "AI monitor-tick failed");
    } finally {
      this.serverTickInFlight = false;
      if (this.serverCatchUp && this.running) {
        this.serverCatchUp = false;
        void this.runServerAi("heartbeat");
      }
    }
  }
  async flush() {
    if (!this.queue.length) return;
    const items = this.queue.splice(0, this.queue.length).map((r) => ({
      face_count: r.face_count,
      detector: r.detector,
      occurred_at: new Date(r.ts).toISOString(),
      violations: r.violations,
      source: "local_worker"
    }));
    try {
      await this.client.postFaceChecks(this.sessionId, items);
    } catch {
      this.queue.unshift(
        ...items.map((it) => ({
          face_count: Number(it.face_count) || 0,
          detector: String(it.detector || "unknown"),
          ts: new Date(it.occurred_at).getTime(),
          violations: it.violations || []
        }))
      );
    }
  }
};

// src/ai-client/IdentityCheckService.ts
var IdentityCheckService = class {
  constructor(client, sessionId, referenceDataUrl, opts = {}) {
    this.client = client;
    this.sessionId = sessionId;
    this.referenceDataUrl = referenceDataUrl;
    this.timer = null;
    this.throttle = new AiSidecarThrottle({ minIntervalMs: 9e3, failureThreshold: 4, cooldownMs: 3e4 });
    this.currentVideo = null;
    this.consecutiveFailures = 0;
    this.lastVerified = true;
    this.busy = false;
    this.opts = {
      intervalMs: opts.intervalMs ?? 1e4,
      threshold: opts.threshold ?? DEFAULT_IDENTITY_MIN_SIMILARITY,
      failuresBeforeViolation: opts.failuresBeforeViolation ?? 2,
      persist: opts.persist ?? true,
      getStream: opts.getStream ?? (() => null),
      onResult: opts.onResult ?? (() => {
      }),
      onMismatch: opts.onMismatch ?? (() => {
      }),
      onRestored: opts.onRestored ?? (() => {
      })
    };
  }
  start(video) {
    if (this.timer) return;
    this.currentVideo = video;
    this.timer = setInterval(() => void this.runOnce(), this.opts.intervalMs);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.currentVideo = null;
  }
  /** Force a one-shot check, e.g. immediately after the identity step. */
  async runOnce() {
    if (this.busy) return null;
    if (!this.currentVideo) return null;
    if (!this.throttle.allow("identity")) return null;
    const img = await captureFrameFromStream(this.opts.getStream(), this.currentVideo);
    if (!img) return null;
    this.busy = true;
    this.throttle.reserve("identity");
    try {
      const resp = await this.client.faceCompareAi(this.sessionId, {
        reference_image: this.referenceDataUrl,
        live_image: img,
        identity_threshold: this.opts.threshold
      });
      this.throttle.recordSuccess();
      const sim = Number(resp?.data?.similarity ?? 0);
      const min = normalizeMinSimilarity(this.opts.threshold);
      const verified = isIdentityVerified(resp?.data, min);
      const result = {
        ts: Date.now(),
        similarity: sim,
        verified,
        detector: String(resp?.data?.detector || "arcface"),
        source: "arcface"
      };
      this.opts.onResult(result);
      if (this.opts.persist) {
        void this.client.postFaceChecks(this.sessionId, [
          {
            face_count: 1,
            match_score: result.similarity,
            detector: result.detector,
            source: "identity_check",
            violations: verified ? [] : ["identity_mismatch"],
            occurred_at: new Date(result.ts).toISOString()
          }
        ]).catch(() => {
        });
      }
      if (!verified) {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.opts.failuresBeforeViolation && this.lastVerified) {
          this.lastVerified = false;
          this.opts.onMismatch(result);
        }
      } else {
        this.consecutiveFailures = 0;
        if (!this.lastVerified) {
          this.lastVerified = true;
          this.opts.onRestored(result);
        }
      }
      return result;
    } catch {
      this.throttle.recordFailure();
      return null;
    } finally {
      this.busy = false;
    }
  }
};
export {
  AiSidecarThrottle,
  AudioAnalyzer,
  CloudInference,
  FACE_CHECK_WORKER_SOURCE,
  FaceCheckService,
  FaceDetector,
  GazeEstimator,
  IdentityCheckService,
  LocalInference,
  ObjectDetector,
  createFaceCheckWorker
};
//# sourceMappingURL=index.js.map