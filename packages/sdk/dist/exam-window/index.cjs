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

// src/exam-window/index.ts
var exam_window_exports = {};
__export(exam_window_exports, {
  ExamWindow: () => ExamWindow,
  FloatingCameraWindow: () => FloatingCameraWindow,
  IdentityVerification: () => IdentityVerification,
  PermissionGate: () => PermissionGate,
  ProctorChatPanel: () => ProctorChatPanel,
  ProctoringIndicator: () => ProctoringIndicator,
  ProctoringTimer: () => ProctoringTimer,
  SystemCheckRunner: () => SystemCheckRunner,
  ViolationAlert: () => ViolationAlert,
  useProctoringSession: () => useProctoringSession,
  useSystemCheck: () => useSystemCheck
});
module.exports = __toCommonJS(exam_window_exports);

// src/exam-window/components/ExamWindow.tsx
var import_react6 = require("react");

// src/core/ProctorShieldClient.ts
var ProctorShieldClient = class {
  constructor(options) {
    this.options = options;
  }
  headers(init) {
    const h = new Headers(init);
    h.set("Content-Type", "application/json");
    if (this.options.accessToken) h.set("Authorization", `Bearer ${this.options.accessToken}`);
    if (this.options.apiKey) h.set("X-API-Key", this.options.apiKey);
    return h;
  }
  async request(method, path, body) {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const detail = json?.detail;
      const err = new Error(typeof detail === "string" ? detail : res.statusText || "Request failed");
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }
  q(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  }
  /* Super Admin */
  superadminLogin(email, password) {
    return this.request("POST", "/v1/superadmin/auth/login", { email, password });
  }
  listTenants(cursor, limit) {
    return this.request(
      "GET",
      `/v1/superadmin/tenants${this.q({ next_cursor: cursor, limit })}`
    );
  }
  getTenant(id) {
    return this.request("GET", `/v1/superadmin/tenants/${id}`);
  }
  createTenant(body) {
    return this.request("POST", "/v1/superadmin/tenants", body);
  }
  updateTenant(id, body) {
    return this.request("PATCH", `/v1/superadmin/tenants/${id}`, body);
  }
  suspendTenant(id) {
    return this.request("POST", `/v1/superadmin/tenants/${id}/suspend`);
  }
  rotateTenantKey(id) {
    return this.request("POST", `/v1/superadmin/tenants/${id}/rotate-key`);
  }
  listActiveSessionsSa(cursor) {
    return this.request(
      "GET",
      `/v1/superadmin/sessions/active${this.q({ next_cursor: cursor })}`
    );
  }
  getSessionSa(id) {
    return this.request("GET", `/v1/superadmin/sessions/${id}`);
  }
  getPlatformAnalytics() {
    return this.request("GET", "/v1/superadmin/analytics/platform");
  }
  getTenantsCompare() {
    return this.request("GET", "/v1/superadmin/analytics/tenants/compare");
  }
  listAuditLogs(params) {
    return this.request(
      "GET",
      `/v1/superadmin/audit-logs${this.q({
        next_cursor: params?.cursor,
        tenant_id: params?.tenant_id,
        action: params?.action
      })}`
    );
  }
  getInfrastructureHealth() {
    return this.request("GET", "/v1/superadmin/infrastructure/health");
  }
  /* Tenant Admin */
  tenantLogin(tenant_slug, email, password) {
    return this.request("POST", "/v1/tenant/auth/login", { tenant_slug, email, password });
  }
  listExams(cursor) {
    return this.request(
      "GET",
      `/v1/exams${this.q({ next_cursor: cursor })}`
    );
  }
  createExam(body) {
    return this.request("POST", "/v1/exams", body);
  }
  listExamSessions(examId, cursor) {
    return this.request(
      "GET",
      `/v1/exams/${examId}/sessions${this.q({ next_cursor: cursor })}`
    );
  }
  listSessions(cursor, exam_id) {
    return this.request(
      "GET",
      `/v1/sessions${this.q({ next_cursor: cursor, exam_id })}`
    );
  }
  listLiveSessions(cursor) {
    return this.request(
      "GET",
      `/v1/sessions/live${this.q({ next_cursor: cursor })}`
    );
  }
  getSessionDetail(id) {
    return this.request("GET", `/v1/sessions/${id}`);
  }
  getSessionRecording(id) {
    return this.request("GET", `/v1/sessions/${id}/recording`);
  }
  getSessionSnapshots(id) {
    return this.request("GET", `/v1/sessions/${id}/snapshots`);
  }
  getSessionReport(id) {
    return this.request("GET", `/v1/sessions/${id}/report`);
  }
  terminateSession(id) {
    return this.request("POST", `/v1/sessions/${id}/terminate`);
  }
  listCandidates(cursor) {
    return this.request(
      "GET",
      `/v1/candidates${this.q({ next_cursor: cursor })}`
    );
  }
  bulkImportCandidates(body) {
    return this.request("POST", "/v1/candidates/bulk-import", body);
  }
  getUsageAnalytics() {
    return this.request("GET", "/v1/analytics/usage");
  }
  getViolationsAnalytics() {
    return this.request("GET", "/v1/analytics/violations");
  }
  getExamReport(examId) {
    return this.request("GET", `/v1/reports/exam/${examId}`);
  }
  listWebhooks() {
    return this.request("GET", "/v1/webhooks");
  }
  createWebhook(body) {
    return this.request("POST", "/v1/webhooks", body);
  }
  getSdkCredentials() {
    return this.request("GET", "/v1/tenant/sdk/credentials");
  }
  /* Tenant: branding, sub-admins, policy/session templates, assignments */
  getBranding() {
    return this.request("GET", "/v1/tenant/branding");
  }
  updateBranding(body) {
    return this.request("PATCH", "/v1/tenant/branding", body);
  }
  putBranding(body) {
    return this.request("PUT", "/v1/tenant/branding", body);
  }
  listTenantUsers() {
    return this.request("GET", "/v1/tenant/users");
  }
  getTenantUserDefaults() {
    return this.request(
      "GET",
      "/v1/tenant/users/_defaults"
    );
  }
  createTenantUser(body) {
    return this.request("POST", "/v1/tenant/users", body);
  }
  updateTenantUser(id, body) {
    return this.request("PATCH", `/v1/tenant/users/${id}`, body);
  }
  deleteTenantUser(id) {
    return this.request("DELETE", `/v1/tenant/users/${id}`);
  }
  rotateSdkKey() {
    return this.request("POST", "/v1/tenant/sdk/rotate-key");
  }
  listPolicyTemplates() {
    return this.request("GET", "/v1/policy-templates");
  }
  createPolicyTemplate(body) {
    return this.request("POST", "/v1/policy-templates", body);
  }
  updatePolicyTemplate(id, body) {
    return this.request("PATCH", `/v1/policy-templates/${id}`, body);
  }
  deletePolicyTemplate(id) {
    return this.request("DELETE", `/v1/policy-templates/${id}`);
  }
  listSessionTemplates() {
    return this.request("GET", "/v1/session-templates");
  }
  createSessionTemplate(body) {
    return this.request("POST", "/v1/session-templates", body);
  }
  updateSessionTemplate(id, body) {
    return this.request("PATCH", `/v1/session-templates/${id}`, body);
  }
  deleteSessionTemplate(id) {
    return this.request("DELETE", `/v1/session-templates/${id}`);
  }
  listProctorAssignments(params) {
    return this.request(
      "GET",
      `/v1/proctor-assignments${this.q({
        exam_id: params?.exam_id,
        session_id: params?.session_id,
        proctor_user_id: params?.proctor_user_id
      })}`
    );
  }
  assignProctor(body) {
    return this.request("POST", "/v1/proctor-assignments", body);
  }
  removeProctorAssignment(id) {
    return this.request("DELETE", `/v1/proctor-assignments/${id}`);
  }
  /* Session control */
  pauseSession(id, body = {}) {
    return this.request("POST", `/v1/sessions/${id}/pause`, body);
  }
  resumeSession(id, body = {}) {
    return this.request("POST", `/v1/sessions/${id}/resume`, body);
  }
  extendSession(id, extra_seconds, note) {
    return this.request("POST", `/v1/sessions/${id}/extend`, { extra_seconds, note });
  }
  annotateSession(id, note) {
    return this.request("POST", `/v1/sessions/${id}/annotations`, { note });
  }
  listSessionExtensions(id) {
    return this.request("GET", `/v1/sessions/${id}/extensions`);
  }
  listSessionChat(id, limit) {
    return this.request(
      "GET",
      `/v1/sessions/${id}/chat${this.q({ limit: limit ? String(limit) : void 0 })}`
    );
  }
  postSessionChat(id, message) {
    return this.request("POST", `/v1/sessions/${id}/chat`, { message });
  }
  listSessionFaceChecks(id, limit) {
    return this.request(
      "GET",
      `/v1/sessions/${id}/face-checks${this.q({ limit: limit ? String(limit) : void 0 })}`
    );
  }
  listSessionRecordings(id) {
    return this.request("GET", `/v1/sessions/${id}/recordings`);
  }
  getCandidateReport(candidateId) {
    return this.request("GET", `/v1/reports/candidate/${candidateId}`);
  }
  getAttendanceReport(examId) {
    return this.request("GET", `/v1/reports/exam/${examId}/attendance`);
  }
  getAttendanceReportCsv(examId) {
    return `${this.options.baseUrl.replace(/\/$/, "")}/v1/reports/exam/${examId}/attendance?format=csv`;
  }
  /* Candidate SDK */
  initProctoringSession(body = {}) {
    return this.request("POST", "/v1/sdk/sessions/init", body);
  }
  getSessionConfig(sessionId) {
    return this.request("GET", `/v1/sdk/sessions/${sessionId}/config`);
  }
  getSdkBranding() {
    return this.request("GET", "/v1/sdk/branding");
  }
  submitSystemCheck(sessionId, body) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/system-check`, body);
  }
  submitIdentity(sessionId, body) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/identity`, body);
  }
  startStream(sessionId, body = {}) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/stream/start`, body);
  }
  endSession(sessionId, body = {}) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/end`, body);
  }
  postSdkEvents(body) {
    return this.request("POST", "/v1/sdk/events", body);
  }
  postRecordingChunk(sessionId, body) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/recording-chunk`, body);
  }
  postFaceChecks(sessionId, items) {
    return this.request(
      "POST",
      `/v1/sdk/sessions/${sessionId}/face-checks`,
      { items }
    );
  }
  postSnapshot(sessionId, body) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/snapshots`, body);
  }
  postCandidateChat(sessionId, message) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/chat`, { message });
  }
  listCandidateChat(sessionId, limit) {
    return this.request(
      "GET",
      `/v1/sdk/sessions/${sessionId}/chat${this.q({ limit: limit ? String(limit) : void 0 })}`
    );
  }
  getTurnCredentials() {
    return this.request("GET", "/v1/sdk/turn-credentials");
  }
  analyzeFrameAi(sessionId, imageDataUrl, persist = false) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/ai/analyze-frame${persist ? "?persist=1" : ""}`, {
      image: imageDataUrl
    });
  }
  phoneCheckAi(sessionId, imageDataUrl, persist = false) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/ai/phone-check${persist ? "?persist=1" : ""}`, {
      image: imageDataUrl
    });
  }
  faceCompareAi(sessionId, body) {
    return this.request("POST", `/v1/sdk/sessions/${sessionId}/ai/face-compare`, body);
  }
};

// src/media/PermissionManager.ts
var PermissionManager = class {
  constructor() {
    this.state = {
      camera: "unknown",
      microphone: "unknown",
      screen: "unknown"
    };
    this.acquired = {
      cameraStream: null,
      micStream: null,
      screenStream: null,
      cameraAndMicStream: null
    };
    this.listeners = /* @__PURE__ */ new Set();
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }
  async queryStored() {
    try {
      const anyNav = navigator;
      if (!anyNav.permissions?.query) return this.state;
      for (const kind of ["camera", "microphone"]) {
        try {
          const r = await anyNav.permissions.query({ name: kind });
          this.state[kind] = r.state;
        } catch {
        }
      }
      this.emit();
    } catch {
    }
    return this.state;
  }
  async requestCameraAndMic(constraints) {
    this.state.camera = "pending";
    this.state.microphone = "pending";
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        constraints ?? {
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true }
        }
      );
      this.acquired.cameraAndMicStream = stream;
      this.acquired.cameraStream = new MediaStream(stream.getVideoTracks());
      this.acquired.micStream = new MediaStream(stream.getAudioTracks());
      this.state.camera = "granted";
      this.state.microphone = "granted";
      this.emit();
      return stream;
    } catch (err) {
      this.state.camera = "denied";
      this.state.microphone = "denied";
      this.emit();
      throw err;
    }
  }
  async requestScreen() {
    this.state.screen = "pending";
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });
      this.acquired.screenStream = stream;
      this.state.screen = "granted";
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          this.state.screen = "denied";
          this.acquired.screenStream = null;
          this.emit();
        };
      });
      this.emit();
      return stream;
    } catch (err) {
      this.state.screen = "denied";
      this.emit();
      throw err;
    }
  }
  release() {
    Object.values(this.acquired).forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    this.acquired = {
      cameraStream: null,
      micStream: null,
      screenStream: null,
      cameraAndMicStream: null
    };
  }
};

// src/media/ChunkedRecorder.ts
var DEFAULT_MIMES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
function pickMime(list) {
  for (const m of list) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return void 0;
}
var ChunkedRecorder = class {
  constructor(opts) {
    this.opts = opts;
    this.recorder = null;
    this.sequence = 0;
    this.currentChunkStart = 0;
    this.buffer = [];
  }
  start(stream) {
    if (this.recorder) return;
    const chunkMs = this.opts.chunkMs ?? 1e4;
    const mime = pickMime(this.opts.mimeTypes ?? DEFAULT_MIMES);
    this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.currentChunkStart = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      this.buffer.push(e.data);
      const endedAt = Date.now();
      const blob = new Blob(this.buffer, { type: this.buffer[0].type });
      const sequence = this.sequence++;
      const startedAt = new Date(this.currentChunkStart).toISOString();
      this.currentChunkStart = endedAt;
      this.buffer = [];
      try {
        await this.opts.onChunk?.({
          blob,
          sequence,
          track: this.opts.track,
          startedAt,
          endedAt: new Date(endedAt).toISOString()
        });
      } catch {
      }
    };
    this.recorder.start(chunkMs);
  }
  stop() {
    try {
      this.recorder?.stop();
    } catch {
    }
    this.recorder = null;
  }
};
function buildChunkSignaler(client, sessionId) {
  return async ({
    blob,
    sequence,
    track,
    startedAt,
    endedAt
  }) => {
    await client.postRecordingChunk(sessionId, {
      track,
      sequence,
      bytes: blob.size,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      started_at: startedAt,
      ended_at: endedAt,
      metadata: { mime: blob.type }
    });
  };
}

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

// src/lockdown/KeyboardInterceptor.ts
var BLOCKED = /* @__PURE__ */ new Set(["F12", "c", "v", "a", "p", "s"]);
var KeyboardInterceptor = class {
  constructor() {
    this.handler = null;
  }
  start(onBlocked) {
    this.handler = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.ctrlKey || e.metaKey) && BLOCKED.has(key)) {
        e.preventDefault();
        onBlocked();
      }
    };
    window.addEventListener("keydown", this.handler, true);
  }
  stop() {
    if (this.handler) window.removeEventListener("keydown", this.handler, true);
    this.handler = null;
  }
};

// src/lockdown/VisibilityMonitor.ts
var VisibilityMonitor = class {
  constructor() {
    this.handler = null;
  }
  start(onChange) {
    this.handler = () => onChange(document.hidden);
    document.addEventListener("visibilitychange", this.handler);
  }
  stop() {
    if (this.handler) document.removeEventListener("visibilitychange", this.handler);
    this.handler = null;
  }
};

// src/lockdown/ScreenCaptureBlocker.ts
var ScreenCaptureBlocker = class {
  attach() {
    if ("getDisplayMedia" in navigator.mediaDevices) {
      const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException("Screen capture disabled during exam", "NotAllowedError");
      };
      return () => {
        navigator.mediaDevices.getDisplayMedia = orig;
      };
    }
    return () => {
    };
  }
};

// src/lockdown/LockdownEnforcer.ts
var LockdownEnforcer = class {
  constructor() {
    this.keyboard = new KeyboardInterceptor();
    this.visibility = new VisibilityMonitor();
    this.capture = new ScreenCaptureBlocker();
    this.releaseCapture = null;
    this.listeners = [];
    this.onViolation = null;
  }
  start(onViolation, opts = {}) {
    const merged = {
      blockContextMenu: opts.blockContextMenu ?? true,
      blockCopyPaste: opts.blockCopyPaste ?? true,
      blockSelection: opts.blockSelection ?? false,
      blockScreenCapture: opts.blockScreenCapture ?? true,
      forceFullscreen: opts.forceFullscreen ?? false
    };
    this.onViolation = onViolation ?? null;
    this.keyboard.start(() => this.fire("blocked_shortcut"));
    this.visibility.start((hidden) => this.fire(hidden ? "tab_hidden" : "tab_visible"));
    if (merged.blockContextMenu) {
      const h = (e) => {
        e.preventDefault();
        this.fire("context_menu");
      };
      window.addEventListener("contextmenu", h, true);
      this.listeners.push(() => window.removeEventListener("contextmenu", h, true));
    }
    if (merged.blockCopyPaste) {
      const blocked = (kind) => (e) => {
        e.preventDefault();
        this.fire(kind);
      };
      const copy = blocked("copy_attempt");
      const paste = blocked("paste_attempt");
      const cut = blocked("cut_attempt");
      document.addEventListener("copy", copy, true);
      document.addEventListener("paste", paste, true);
      document.addEventListener("cut", cut, true);
      this.listeners.push(() => {
        document.removeEventListener("copy", copy, true);
        document.removeEventListener("paste", paste, true);
        document.removeEventListener("cut", cut, true);
      });
    }
    if (merged.blockSelection) {
      const original = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      this.listeners.push(() => {
        document.body.style.userSelect = original;
      });
    }
    const blur = () => this.fire("window_blur");
    const focus = () => this.fire("window_focus");
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    this.listeners.push(() => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    });
    const fsChange = () => {
      if (!document.fullscreenElement) this.fire("fullscreen_exit");
    };
    document.addEventListener("fullscreenchange", fsChange);
    this.listeners.push(() => document.removeEventListener("fullscreenchange", fsChange));
    if (merged.blockScreenCapture) {
      this.releaseCapture = this.capture.attach();
    }
    if (merged.forceFullscreen) {
      try {
        document.documentElement.requestFullscreen?.().catch(() => {
        });
      } catch {
      }
    }
  }
  fire(r) {
    this.onViolation?.(r);
  }
  stop() {
    this.keyboard.stop();
    this.visibility.stop();
    this.releaseCapture?.();
    this.releaseCapture = null;
    while (this.listeners.length) this.listeners.pop()?.();
    this.onViolation = null;
  }
};

// src/lockdown/NetworkMonitor.ts
var NetworkMonitor = class {
  constructor() {
    this.timer = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.lastOnline = navigator.onLine;
  }
  start(intervalMs = 15e3, probeUrl) {
    const handler = (online) => () => {
      this.lastOnline = online;
      this.emit({ online, rtt_ms: null, downlink_mbps: null, effective_type: null, ts: Date.now() });
    };
    const off = handler(false);
    const on = handler(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    this.timer = setInterval(async () => {
      const snap = await this.probe(probeUrl);
      this.emit(snap);
    }, intervalMs);
    void this.probe(probeUrl).then((s) => this.emit(s));
    this._detach = () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(s) {
    this.listeners.forEach((fn) => fn(s));
  }
  async probe(probeUrl) {
    const c = navigator.connection;
    let rtt = c?.rtt ?? null;
    if (probeUrl && (rtt == null || !rtt)) {
      const t = performance.now();
      try {
        await fetch(probeUrl, { method: "HEAD", cache: "no-store" });
        rtt = Math.round(performance.now() - t);
      } catch {
        rtt = null;
      }
    }
    return {
      online: navigator.onLine,
      rtt_ms: rtt,
      downlink_mbps: c?.downlink ?? null,
      effective_type: c?.effectiveType ?? null,
      ts: Date.now()
    };
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._detach?.();
  }
};

// src/lockdown/KeystrokeAnalyzer.ts
var KeystrokeAnalyzer = class {
  constructor() {
    this.times = [];
    this.onAnomaly = null;
    this.kdHandler = null;
    this.pasteHandler = null;
    this.lastReport = 0;
  }
  start(onAnomaly) {
    this.onAnomaly = onAnomaly;
    this.kdHandler = (e) => this.onKey(e);
    this.pasteHandler = (e) => this.onPaste(e);
    window.addEventListener("keydown", this.kdHandler, true);
    window.addEventListener("paste", this.pasteHandler, true);
  }
  onKey(_e) {
    const now = performance.now();
    this.times.push(now);
    if (this.times.length > 60) this.times.shift();
    if (this.times.length >= 30) {
      const intervals = this.times.slice(1).map((t, i) => t - this.times[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avg < 30 && now - this.lastReport > 5e3) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: "high_velocity", details: { avg_ms: Math.round(avg) } });
      }
      if (avg > 3e4 && now - this.lastReport > 3e4) {
        this.lastReport = now;
        this.onAnomaly?.({ reason: "long_pause", details: { avg_ms: Math.round(avg) } });
      }
    }
  }
  onPaste(_e) {
    this.onAnomaly?.({ reason: "paste_burst" });
  }
  stop() {
    if (this.kdHandler) window.removeEventListener("keydown", this.kdHandler, true);
    if (this.pasteHandler) window.removeEventListener("paste", this.pasteHandler, true);
    this.kdHandler = null;
    this.pasteHandler = null;
    this.onAnomaly = null;
  }
};

// src/events/ProctorChatClient.ts
var ProctorChatClient = class {
  constructor(opts) {
    this.opts = opts;
    this.ws = null;
    this.reconnectTimer = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.opened = false;
    this.destroyed = false;
  }
  connect() {
    if (this.ws) return;
    const url = new URL(this.opts.wsUrl);
    if (this.opts.asProctor && this.opts.token) {
      url.searchParams.set("bearer", this.opts.token);
    } else if (this.opts.token) {
      url.searchParams.set("token", this.opts.token);
    } else if (this.opts.apiKey) {
      url.searchParams.set("x-api-key", this.opts.apiKey);
    }
    try {
      this.ws = new WebSocket(url.toString());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.opened = true;
      this.emit({ type: "ws_open" });
    };
    this.ws.onclose = () => {
      this.opened = false;
      this.ws = null;
      this.emit({ type: "ws_close" });
      if (!this.destroyed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.emit({ type: "ws_error" });
    };
    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.emit(data);
      } catch {
      }
    };
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.connect();
    }, 3e3);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(msg) {
    this.listeners.forEach((fn) => fn(msg));
  }
  send(payload) {
    if (!this.ws || !this.opened) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
  sendChat(message) {
    return this.send({ op: "chat", message });
  }
  ping() {
    return this.send({ op: "ping", ts: Date.now() });
  }
  syncTimer() {
    return this.send({ op: "timer_tick", ts: Date.now() });
  }
  pollStatus() {
    return this.send({ op: "status_poll" });
  }
  close() {
    this.destroyed = true;
    try {
      this.ws?.close();
    } catch {
    }
    this.ws = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};

// src/exam-window/components/PermissionGate.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var ITEM = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  marginBottom: 8,
  background: "#fff"
};
function badge(state) {
  const map = {
    unknown: { bg: "#e2e8f0", fg: "#475569", label: "Required" },
    pending: { bg: "#fde68a", fg: "#92400e", label: "Asking\u2026" },
    granted: { bg: "#bbf7d0", fg: "#166534", label: "Granted" },
    denied: { bg: "#fecaca", fg: "#991b1b", label: "Blocked" }
  };
  const m = map[state] || map.unknown;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { background: m.bg, color: m.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12 }, children: m.label });
}
function PermissionGate(props) {
  const { manager, requireScreen = true, brandPrimary = "#0f172a", onAllReady } = props;
  const [state, setState] = (0, import_react.useState)(manager.state);
  const [error, setError] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    const off = manager.onChange(setState);
    void manager.queryStored();
    return () => {
      off();
    };
  }, [manager]);
  const ready = state.camera === "granted" && state.microphone === "granted" && (!requireScreen || state.screen === "granted");
  const askCamMic = async () => {
    setError(null);
    setBusy("cammic");
    try {
      await manager.requestCameraAndMic();
    } catch (e) {
      setError(`Camera/microphone blocked: ${e.message}. Allow access in the browser address bar and retry.`);
    } finally {
      setBusy(null);
    }
  };
  const askScreen = async () => {
    setError(null);
    setBusy("screen");
    try {
      await manager.requestScreen();
    } catch (e) {
      setError(`Screen share blocked: ${e.message}. Select "Entire screen" then click Share.`);
    } finally {
      setBusy(null);
    }
  };
  const start = () => {
    if (!ready) return;
    onAllReady({
      camMicStream: manager.acquired.cameraAndMicStream,
      screenStream: manager.acquired.screenStream
    });
  };
  const items = (0, import_react.useMemo)(
    () => [
      {
        key: "camera",
        label: "Camera",
        desc: "Used for identity verification and live face presence checks every 10s.",
        state: state.camera,
        cta: "Allow camera & microphone",
        onClick: askCamMic
      },
      {
        key: "microphone",
        label: "Microphone",
        desc: "Audio is monitored for background voices and noise during the exam.",
        state: state.microphone,
        cta: "Allow camera & microphone",
        onClick: askCamMic
      },
      requireScreen ? {
        key: "screen",
        label: "Screen share",
        desc: 'Choose "Entire Screen" so we can record evidence of your full activity.',
        state: state.screen,
        cta: "Share entire screen",
        onClick: askScreen
      } : null
    ],
    [state, requireScreen]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { marginBottom: 4 }, children: "Allow proctoring access" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { color: "#475569", marginBottom: 16, fontSize: 14 }, children: "Before the exam can start we need permission to use your camera, microphone, and screen." }),
    items.filter(Boolean).map((it) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ITEM, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { paddingRight: 16 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { display: "block" }, children: it.label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#64748b", fontSize: 12 }, children: it.desc })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
        badge(it.state),
        it.state !== "granted" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            disabled: busy != null,
            onClick: () => void it.onClick(),
            style: {
              background: brandPrimary,
              color: "#fff",
              border: "none",
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12
            },
            children: busy === "cammic" && (it.key === "camera" || it.key === "microphone") ? "Asking\u2026" : busy === "screen" && it.key === "screen" ? "Asking\u2026" : it.cta
          }
        )
      ] })
    ] }, it.key)),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { color: "#b91c1c", fontSize: 13, marginTop: 12 }, children: error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        disabled: !ready,
        onClick: start,
        style: {
          marginTop: 12,
          background: ready ? brandPrimary : "#cbd5e1",
          color: "#fff",
          border: "none",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 14,
          cursor: ready ? "pointer" : "not-allowed"
        },
        children: ready ? "Continue to identity check" : "Awaiting permissions\u2026"
      }
    )
  ] });
}

// src/exam-window/components/SystemCheckRunner.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function SystemCheckRunner(props) {
  const { camMicStream, probeUrl, brandPrimary = "#0f172a", onComplete } = props;
  const [steps, setSteps] = (0, import_react2.useState)([]);
  const [result, setResult] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    const next = [
      { key: "webcam", label: "Webcam", status: "pending" },
      { key: "microphone", label: "Microphone", status: "pending" },
      { key: "screen", label: "Screen resolution", status: "pending" },
      { key: "browser", label: "Browser compatibility", status: "pending" },
      { key: "network", label: "Network connectivity", status: "pending" },
      { key: "environment", label: "Environment scan", status: "pending" }
    ];
    setSteps(next);
    void run(next);
    async function run(s) {
      const hasVideo = (camMicStream?.getVideoTracks().length ?? 0) > 0;
      const hasAudio = (camMicStream?.getAudioTracks().length ?? 0) > 0;
      s[0].status = hasVideo ? "ok" : "fail";
      s[1].status = hasAudio ? "ok" : "fail";
      const screenOk = window.screen.width >= 1024 && window.screen.height >= 600;
      s[2].status = screenOk ? "ok" : "warn";
      s[2].note = `${window.screen.width}\xD7${window.screen.height}`;
      const ua = navigator.userAgent;
      const browserOk = /Chrome|Edg|Firefox|Safari/.test(ua) && !/MSIE|Trident/.test(ua);
      s[3].status = browserOk ? "ok" : "fail";
      s[3].note = ua.slice(0, 80);
      let rtt = null;
      try {
        const t = performance.now();
        await fetch(probeUrl || "/", { method: "HEAD", cache: "no-store" });
        rtt = Math.round(performance.now() - t);
        s[4].status = rtt < 800 ? "ok" : rtt < 1500 ? "warn" : "fail";
        s[4].note = `${rtt}ms`;
      } catch {
        s[4].status = "fail";
        s[4].note = "unreachable";
      }
      let multiScreen = false;
      try {
        const s2 = window.screen.isExtended;
        multiScreen = Boolean(s2);
      } catch {
      }
      s[5].status = multiScreen ? "warn" : "ok";
      s[5].note = multiScreen ? "Multiple displays detected" : "Single display";
      const r = {
        webcam: hasVideo,
        microphone: hasAudio,
        screen_resolution_ok: screenOk,
        browser_compatible: browserOk,
        network_ok: s[4].status !== "fail",
        rtt_ms: rtt,
        user_agent: ua,
        screen: { width: window.screen.width, height: window.screen.height },
        external_monitor_warning: multiScreen
      };
      setSteps([...s]);
      setResult(r);
    }
  }, [camMicStream, probeUrl]);
  const ready = result && result.webcam && result.microphone && result.browser_compatible;
  const COLOR = { ok: "#16a34a", warn: "#d97706", fail: "#b91c1c", pending: "#64748b" };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { style: { marginBottom: 4 }, children: "Pre-exam system check" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { color: "#475569", fontSize: 14, marginBottom: 12 }, children: "Verifying hardware, network, and environment readiness." }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { style: { listStyle: "none", padding: 0, margin: 0 }, children: steps.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "li",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #e2e8f0",
          fontSize: 14
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: s.label }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { color: COLOR[s.status], fontWeight: 600 }, children: [
            s.status.toUpperCase(),
            s.note ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "#64748b", fontWeight: 400, marginLeft: 8 }, children: s.note }) : null
          ] })
        ]
      },
      s.key
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        disabled: !ready,
        onClick: () => result && onComplete(result),
        style: {
          marginTop: 16,
          background: ready ? brandPrimary : "#cbd5e1",
          color: "#fff",
          border: "none",
          padding: "10px 18px",
          borderRadius: 8,
          cursor: ready ? "pointer" : "not-allowed"
        },
        children: "Continue to identity verification"
      }
    )
  ] });
}

// src/exam-window/components/IdentityVerification.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function IdentityVerification(props) {
  const { client, sessionId, cameraStream, brandPrimary = "#0f172a", onDone } = props;
  const videoRef = (0, import_react3.useRef)(null);
  const [captured, setCaptured] = (0, import_react3.useState)(null);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [err, setErr] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);
  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.8));
    setErr(null);
  };
  const submit = async () => {
    if (!captured) return;
    setBusy(true);
    setErr(null);
    try {
      await client.submitIdentity(sessionId, { image_base64: captured });
      onDone({ image_base64: captured });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { style: { marginBottom: 4 }, children: "Identity verification" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { color: "#475569", fontSize: 14, marginBottom: 12 }, children: "Center your face inside the frame, look straight at the camera, then click Capture." }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { position: "relative", maxWidth: 480, marginBottom: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "video",
        {
          ref: videoRef,
          autoPlay: true,
          muted: true,
          playsInline: true,
          style: {
            width: "100%",
            aspectRatio: "4/3",
            background: "#000",
            borderRadius: 12,
            display: captured ? "none" : "block"
          }
        }
      ),
      captured && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "img",
        {
          src: captured,
          alt: "Captured",
          style: { width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 12 }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", gap: 8 }, children: !captured ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        onClick: capture,
        style: { background: brandPrimary, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer" },
        children: "Capture photo"
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          onClick: () => setCaptured(null),
          style: { background: "#64748b", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer" },
          children: "Retake"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          disabled: busy,
          onClick: () => void submit(),
          style: { background: brandPrimary, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer" },
          children: busy ? "Submitting\u2026" : "Verify & start exam"
        }
      )
    ] }) }),
    err && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { color: "#b91c1c", fontSize: 13, marginTop: 12 }, children: err })
  ] });
}

// src/exam-window/components/FloatingCameraWindow.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function FloatingCameraWindow(props) {
  const {
    stream,
    collapsed = false,
    onCollapseChange,
    statusLabel,
    recording,
    initial = { x: window?.innerWidth ? window.innerWidth - 220 : 24, y: 80 },
    size = { width: 200, height: 160 },
    accentColor = "#dc2626"
  } = props;
  const videoRef = (0, import_react4.useRef)(null);
  const containerRef = (0, import_react4.useRef)(null);
  const [pos, setPos] = (0, import_react4.useState)(initial);
  const dragging = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  (0, import_react4.useEffect)(() => {
    const move = (e) => {
      if (!dragging.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragging.current.dx));
      const y = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragging.current.dy));
      setPos({ x, y });
    };
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [size.width, size.height]);
  const onMouseDown = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };
  if (collapsed) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "button",
      {
        type: "button",
        onClick: () => onCollapseChange?.(false),
        style: {
          position: "fixed",
          top: pos.y,
          left: pos.x,
          zIndex: 2147483646,
          padding: "6px 10px",
          background: "#0f172a",
          color: "#f8fafc",
          border: `2px solid ${accentColor}`,
          borderRadius: 999,
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "system-ui"
        },
        "aria-label": "Show proctoring camera",
        children: [
          recording ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: accentColor }, children: "\u25CF REC" }) : "\u25EF",
          " Proctor"
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      ref: containerRef,
      style: {
        position: "fixed",
        top: pos.y,
        left: pos.x,
        width: size.width,
        height: size.height + 28,
        zIndex: 2147483646,
        background: "#0f172a",
        color: "#f8fafc",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        overflow: "hidden",
        fontFamily: "system-ui",
        border: `2px solid ${accentColor}`,
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "div",
          {
            onMouseDown,
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              background: "#020617",
              cursor: "grab",
              fontSize: 11
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                recording ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: 8, height: 8, borderRadius: 4, background: accentColor, display: "inline-block" } }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { width: 8, height: 8, borderRadius: 4, background: "#475569", display: "inline-block" } }),
                statusLabel || "Proctoring"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => onCollapseChange?.(true),
                  style: {
                    background: "transparent",
                    color: "#94a3b8",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: 0,
                    lineHeight: 1
                  },
                  "aria-label": "Minimize camera",
                  children: "\u2014"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "video",
          {
            ref: videoRef,
            autoPlay: true,
            muted: true,
            playsInline: true,
            style: { width: "100%", height: size.height, objectFit: "cover", background: "#000" }
          }
        )
      ]
    }
  );
}

// src/exam-window/components/ProctoringIndicator.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function ProctoringIndicator(props) {
  const { recording, sessionId, violations, online, brandPrimary = "#0f172a", paused } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        fontSize: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        position: "sticky",
        top: 12,
        zIndex: 10,
        width: "fit-content"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "span",
          {
            style: {
              width: 8,
              height: 8,
              borderRadius: 4,
              background: paused ? "#d97706" : recording ? "#dc2626" : "#94a3b8",
              display: "inline-block"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { style: { color: brandPrimary }, children: paused ? "PAUSED" : recording ? "RECORDING" : "IDLE" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { color: "#64748b" }, children: online ? "Online" : "Offline" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { color: violations > 0 ? "#b91c1c" : "#16a34a" }, children: [
          violations,
          " violation",
          violations === 1 ? "" : "s"
        ] }),
        sessionId && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { color: "#94a3b8" }, children: [
          "#",
          sessionId.slice(0, 8)
        ] })
      ]
    }
  );
}

// src/exam-window/components/ProctorChatPanel.tsx
var import_react5 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function ProctorChatPanel(props) {
  const { client, sessionId, chatWs, brandPrimary = "#0f172a", collapsed = false, onCollapseChange, role = "candidate" } = props;
  const [messages, setMessages] = (0, import_react5.useState)([]);
  const [draft, setDraft] = (0, import_react5.useState)("");
  const [unread, setUnread] = (0, import_react5.useState)(0);
  const scrollerRef = (0, import_react5.useRef)(null);
  (0, import_react5.useEffect)(() => {
    (async () => {
      try {
        const r = role === "candidate" ? await client.listCandidateChat(sessionId, 100) : await client.listSessionChat(sessionId, 100);
        setMessages(r.data || []);
      } catch {
      }
    })();
  }, [client, sessionId, role]);
  (0, import_react5.useEffect)(() => {
    if (!chatWs) return;
    const off = chatWs.on((msg) => {
      if (msg.type === "chat_message") {
        const m = msg;
        setMessages((prev) => [...prev, m]);
        if (collapsed) setUnread((u) => u + 1);
      } else if (msg.type === "session_paused" || msg.type === "session_resumed" || msg.type === "session_terminated" || msg.type === "session_extended") {
        const m = msg;
        setMessages((prev) => [...prev, {
          sender_type: "system",
          message: m.message || m.type,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        }]);
        if (collapsed) setUnread((u) => u + 1);
      }
    });
    return () => {
      off();
    };
  }, [chatWs, collapsed]);
  (0, import_react5.useEffect)(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);
  (0, import_react5.useEffect)(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const send = async () => {
    const m = draft.trim();
    if (!m) return;
    setDraft("");
    setMessages((prev) => [...prev, { sender_type: role === "candidate" ? "candidate" : "proctor", message: m, created_at: (/* @__PURE__ */ new Date()).toISOString() }]);
    const viaWs = chatWs?.sendChat(m);
    if (!viaWs) {
      try {
        if (role === "candidate") await client.postCandidateChat(sessionId, m);
        else await client.postSessionChat(sessionId, m);
      } catch {
      }
    }
  };
  if (collapsed) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "button",
      {
        type: "button",
        onClick: () => onCollapseChange?.(false),
        style: {
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          background: brandPrimary,
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 6px 16px rgba(0,0,0,0.2)"
        },
        children: [
          "Chat",
          unread > 0 ? ` (${unread})` : ""
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "aside",
    {
      style: {
        position: "fixed",
        right: 16,
        bottom: 16,
        width: 320,
        height: 420,
        zIndex: 2147483646,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
        fontFamily: "system-ui"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "header",
          {
            style: {
              background: brandPrimary,
              color: "#fff",
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderRadius: "12px 12px 0 0"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: "Proctor chat" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => onCollapseChange?.(true),
                  style: { background: "transparent", color: "#fff", border: "none", cursor: "pointer", fontSize: 18 },
                  "aria-label": "Minimize chat",
                  children: "\u2014"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { ref: scrollerRef, style: { flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }, children: messages.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { color: "#64748b" }, children: "No messages yet. Your proctor can message you here." }) : messages.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { marginBottom: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { color: "#64748b", fontSize: 11 }, children: m.sender_type === "system" ? "System" : m.sender_type === "proctor" ? "Proctor" : "You" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "div",
            {
              style: {
                background: m.sender_type === (role === "candidate" ? "candidate" : "proctor") ? brandPrimary : "#f1f5f9",
                color: m.sender_type === (role === "candidate" ? "candidate" : "proctor") ? "#fff" : "#0f172a",
                padding: "6px 10px",
                borderRadius: 8,
                display: "inline-block",
                maxWidth: "90%"
              },
              children: m.message
            }
          )
        ] }, i)) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
          "form",
          {
            onSubmit: (e) => {
              e.preventDefault();
              void send();
            },
            style: { display: "flex", padding: 8, borderTop: "1px solid #e2e8f0" },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  value: draft,
                  onChange: (e) => setDraft(e.target.value),
                  placeholder: "Type a message\u2026",
                  style: { flex: 1, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 13 }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  type: "submit",
                  style: { marginLeft: 8, background: brandPrimary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" },
                  children: "Send"
                }
              )
            ]
          }
        )
      ]
    }
  );
}

// src/exam-window/components/ViolationAlert.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var LABELS = {
  blocked_shortcut: "Blocked keyboard shortcut",
  tab_hidden: "Tab switched away",
  tab_visible: "Tab visible again",
  context_menu: "Right-click attempted",
  copy_attempt: "Copy attempted",
  paste_attempt: "Paste attempted",
  cut_attempt: "Cut attempted",
  window_blur: "Lost window focus",
  window_focus: "Window focus returned",
  fullscreen_exit: "Fullscreen exited",
  no_face_detected: "No face detected in camera",
  multiple_faces_detected: "Multiple faces detected",
  audio_voice_detected: "Background voice detected",
  network_offline: "Network connection lost",
  keystroke_paste_burst: "Paste-like keystroke burst",
  keystroke_high_velocity: "Unusually fast typing",
  keystroke_long_pause: "Unusually long pause"
};
function ViolationAlert(props) {
  if (!props.violations.length) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    "div",
    {
      style: {
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        fontSize: 13
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { style: { color: "#9a3412" }, children: "Policy alerts" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { style: { marginTop: 6, marginBottom: 0, paddingLeft: 18 }, children: props.violations.map((v) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { style: { color: "#7c2d12" }, children: LABELS[v] || v }, v)) })
      ]
    }
  );
}

// src/exam-window/components/ExamWindow.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var wsBase = (baseUrl) => baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
function ExamWindow(props) {
  const {
    apiKey,
    baseUrl,
    examUrl,
    examId,
    candidateId,
    externalRef,
    branding: brandingProp,
    disableScreenRecording = false,
    faceCheckIntervalMs = 1e4,
    onSessionEnd,
    children
  } = props;
  const client = (0, import_react6.useMemo)(() => new ProctorShieldClient({ baseUrl, apiKey }), [baseUrl, apiKey]);
  const permsRef = (0, import_react6.useRef)(null);
  if (!permsRef.current) permsRef.current = new PermissionManager();
  const [step, setStep] = (0, import_react6.useState)("permissions");
  const [branding, setBranding] = (0, import_react6.useState)(brandingProp ?? {});
  const [sessionId, setSessionId] = (0, import_react6.useState)(null);
  const [wsToken, setWsToken] = (0, import_react6.useState)(null);
  const [error, setError] = (0, import_react6.useState)(null);
  const [violations, setViolations] = (0, import_react6.useState)([]);
  const [recording, setRecording] = (0, import_react6.useState)(false);
  const [paused, setPaused] = (0, import_react6.useState)(false);
  const [online, setOnline] = (0, import_react6.useState)(true);
  const [chatCollapsed, setChatCollapsed] = (0, import_react6.useState)(true);
  const [camCollapsed, setCamCollapsed] = (0, import_react6.useState)(false);
  const [seconds, setSeconds] = (0, import_react6.useState)(0);
  const [camMicStream, setCamMicStream] = (0, import_react6.useState)(null);
  const [screenStream, setScreenStream] = (0, import_react6.useState)(null);
  const hiddenVideoRef = (0, import_react6.useRef)(null);
  const camRecorderRef = (0, import_react6.useRef)(null);
  const screenRecorderRef = (0, import_react6.useRef)(null);
  const faceServiceRef = (0, import_react6.useRef)(null);
  const audioRef = (0, import_react6.useRef)(null);
  const lockRef = (0, import_react6.useRef)(null);
  const netRef = (0, import_react6.useRef)(null);
  const ksRef = (0, import_react6.useRef)(null);
  const chatRef = (0, import_react6.useRef)(null);
  const accent = branding.accent_color || "#dc2626";
  const primary = branding.primary_color || "#0f172a";
  const addViolation = (0, import_react6.useCallback)(
    (reason) => {
      setViolations((prev) => prev.includes(reason) ? prev : [...prev, reason]);
      if (sessionId) {
        void client.postSdkEvents({
          session_id: sessionId,
          events: [{ type: `violation.${reason}`, severity: "warn", occurred_at: (/* @__PURE__ */ new Date()).toISOString() }]
        }).catch(() => {
        });
      }
    },
    [client, sessionId]
  );
  (0, import_react6.useEffect)(() => {
    if (brandingProp) return;
    void client.getSdkBranding().then((r) => setBranding((b) => ({ ...b, ...r.data }))).catch(() => {
    });
  }, [client, brandingProp]);
  const initSession = (0, import_react6.useCallback)(async () => {
    const { data } = await client.initProctoringSession({
      exam_id: examId,
      candidate_id: candidateId,
      external_candidate_ref: externalRef,
      sdk_version: "0.1.0",
      client_platform: navigator.userAgent
    });
    setSessionId(data.session_id);
    setWsToken(data.ws_token);
    return data;
  }, [client, examId, candidateId, externalRef]);
  const startExam = (0, import_react6.useCallback)(
    async (sid, token) => {
      const wsUrl = `${wsBase(baseUrl)}/v1/sdk/ws/sessions/${sid}`;
      chatRef.current = new ProctorChatClient({ wsUrl, token });
      chatRef.current.connect();
      chatRef.current.on((msg) => {
        const t = msg.type;
        if (t === "session_paused") setPaused(true);
        if (t === "session_resumed") setPaused(false);
        if (t === "session_terminated") {
          setPaused(false);
          setRecording(false);
          setStep("submitted");
          onSessionEnd?.(sid);
        }
      });
      lockRef.current = new LockdownEnforcer();
      lockRef.current.start((r) => addViolation(r), {
        blockContextMenu: true,
        blockCopyPaste: true,
        blockScreenCapture: false
      });
      netRef.current = new NetworkMonitor();
      netRef.current.on((s) => {
        setOnline(s.online);
        if (!s.online) addViolation("network_offline");
      });
      netRef.current.start(15e3, `${baseUrl}/health`);
      ksRef.current = new KeystrokeAnalyzer();
      ksRef.current.start((a) => addViolation(`keystroke_${a.reason}`));
      if (camMicStream) {
        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = camMicStream;
          await hiddenVideoRef.current.play().catch(() => {
          });
        }
        camRecorderRef.current = new ChunkedRecorder({
          track: "camera",
          chunkMs: 1e4,
          onChunk: buildChunkSignaler(client, sid)
        });
        camRecorderRef.current.start(camMicStream);
        audioRef.current = new AudioAnalyzer();
        audioRef.current.on((r) => {
          if (r.voice_detected && r.level > 0.18) addViolation("audio_voice_detected");
        });
        audioRef.current.start(camMicStream);
        faceServiceRef.current = new FaceCheckService(client, sid, {
          intervalMs: faceCheckIntervalMs
        });
        if (hiddenVideoRef.current) faceServiceRef.current.start(hiddenVideoRef.current);
      }
      if (screenStream) {
        screenRecorderRef.current = new ChunkedRecorder({
          track: "screen",
          chunkMs: 15e3,
          onChunk: buildChunkSignaler(client, sid)
        });
        screenRecorderRef.current.start(screenStream);
      }
      await client.startStream(sid, {
        transport: "chunked_post",
        camera: Boolean(camMicStream),
        screen: Boolean(screenStream)
      });
      setRecording(true);
    },
    [baseUrl, camMicStream, client, screenStream, addViolation, faceCheckIntervalMs, onSessionEnd]
  );
  (0, import_react6.useEffect)(() => {
    if (step !== "exam") return;
    const t = setInterval(() => setSeconds((s) => paused ? s : s + 1), 1e3);
    return () => clearInterval(t);
  }, [step, paused]);
  const tearDown = (0, import_react6.useCallback)(() => {
    camRecorderRef.current?.stop();
    screenRecorderRef.current?.stop();
    faceServiceRef.current?.stop();
    audioRef.current?.stop();
    lockRef.current?.stop();
    netRef.current?.stop();
    ksRef.current?.stop();
    chatRef.current?.close();
    permsRef.current?.release();
    camRecorderRef.current = null;
    screenRecorderRef.current = null;
    faceServiceRef.current = null;
    audioRef.current = null;
    lockRef.current = null;
    netRef.current = null;
    ksRef.current = null;
    chatRef.current = null;
  }, []);
  (0, import_react6.useEffect)(() => () => tearDown(), [tearDown]);
  const endExam = async () => {
    if (!sessionId) return;
    try {
      await client.endSession(sessionId, { status: "completed", success: true });
    } catch (e) {
      setError(e.message);
    }
    tearDown();
    setRecording(false);
    setStep("submitted");
    onSessionEnd?.(sessionId);
  };
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto", padding: 24, color: "#0f172a" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }, children: [
      branding.logo_url && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("img", { src: branding.logo_url, alt: branding.organization_name || "logo", style: { height: 36 } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h1", { style: { margin: 0, fontSize: 22, color: primary }, children: branding.organization_name || "ProctorShield Exam" })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { style: { color: "#b91c1c" }, children: error }),
    step === "permissions" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
      branding.candidate_welcome_message && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { style: { color: "#475569", marginBottom: 12 }, children: branding.candidate_welcome_message }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        PermissionGate,
        {
          manager: permsRef.current,
          requireScreen: !disableScreenRecording,
          brandPrimary: primary,
          onAllReady: async ({ camMicStream: cm, screenStream: ss }) => {
            setCamMicStream(cm);
            setScreenStream(ss);
            setStep("system-check");
          }
        }
      )
    ] }),
    step === "system-check" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      SystemCheckRunner,
      {
        camMicStream,
        probeUrl: `${baseUrl}/health`,
        brandPrimary: primary,
        onComplete: async (results) => {
          try {
            const data = await initSession();
            await client.submitSystemCheck(data.session_id, {
              results,
              client_info: { userAgent: navigator.userAgent, screen: results.screen }
            });
            setStep("identity");
          } catch (e) {
            setError(e.message);
          }
        }
      }
    ),
    step === "identity" && sessionId && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      IdentityVerification,
      {
        client,
        sessionId,
        cameraStream: camMicStream,
        brandPrimary: primary,
        onDone: async () => {
          if (!sessionId || !wsToken) return;
          setStep("exam");
          try {
            await startExam(sessionId, wsToken);
          } catch (e) {
            setError(e.message);
          }
        }
      }
    ),
    step === "exam" && sessionId && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          ProctoringIndicator,
          {
            recording,
            sessionId,
            violations: violations.length,
            online,
            brandPrimary: primary,
            paused
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { style: { fontSize: 14, color: "#475569" }, children: [
          "Elapsed\xA0",
          mins,
          ":",
          String(secs).padStart(2, "0")
        ] })
      ] }),
      violations.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ViolationAlert, { violations }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { minHeight: 460, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", overflow: "hidden" }, children: examUrl ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "iframe",
        {
          title: "Exam",
          src: examUrl,
          style: { width: "100%", height: "70vh", border: "none" }
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { padding: 24 }, children: children ?? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { style: { color: "#475569" }, children: [
        "Pass ",
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: "examUrl" }),
        " to embed your LMS, or use the SDK as a wrapper around your own exam UI by providing ",
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("code", { children: "children" }),
        "."
      ] }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { marginTop: 16, display: "flex", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("small", { style: { color: "#64748b" }, children: [
          "Face checks every ",
          Math.round(faceCheckIntervalMs / 1e3),
          "s \xB7 Camera + screen recording chunked every 10\u201315s"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            type: "button",
            onClick: () => void endExam(),
            style: {
              background: accent,
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer"
            },
            children: "Submit & end session"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("video", { ref: hiddenVideoRef, autoPlay: true, muted: true, playsInline: true, style: { display: "none" } }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        FloatingCameraWindow,
        {
          stream: camMicStream,
          collapsed: camCollapsed,
          onCollapseChange: setCamCollapsed,
          statusLabel: paused ? "Paused" : "Proctoring",
          recording: recording && !paused,
          accentColor: accent
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        ProctorChatPanel,
        {
          client,
          sessionId,
          chatWs: chatRef.current,
          brandPrimary: primary,
          collapsed: chatCollapsed,
          onCollapseChange: setChatCollapsed
        }
      )
    ] }),
    step === "submitted" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { children: "Exam submitted" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { children: [
        "Session ended. Recording and AI evidence have been uploaded to ",
        branding.organization_name || "your organization",
        "."
      ] })
    ] })
  ] });
}

// src/exam-window/components/ProctoringTimer.tsx
var import_react7 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function ProctoringTimer(props) {
  const [elapsed, setElapsed] = (0, import_react7.useState)(0);
  (0, import_react7.useEffect)(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - props.startedAt) / 1e3)), 1e3);
    return () => clearInterval(t);
  }, [props.startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { children: [
    "Time: ",
    m,
    ":",
    String(s).padStart(2, "0")
  ] });
}

// src/exam-window/hooks/useProctoringSession.ts
var import_react8 = require("react");
function useProctoringSession(apiKey, baseUrl) {
  const [sessionId, setSessionId] = (0, import_react8.useState)(null);
  const [error, setError] = (0, import_react8.useState)(null);
  const client = new ProctorShieldClient({ baseUrl, apiKey });
  const init = (0, import_react8.useCallback)(
    async (body = {}) => {
      setError(null);
      try {
        const { data } = await client.initProctoringSession(body);
        setSessionId(data.session_id);
        return data;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    },
    [apiKey, baseUrl]
  );
  return { sessionId, error, client, init };
}

// src/exam-window/hooks/useSystemCheck.ts
var import_react9 = require("react");
function useSystemCheck(client, sessionId) {
  const [result, setResult] = (0, import_react9.useState)(null);
  const submit = async (checks) => {
    if (!sessionId) throw new Error("No session");
    const res = await client.submitSystemCheck(sessionId, { results: checks });
    setResult(res);
    return res;
  };
  return { result, submit };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ExamWindow,
  FloatingCameraWindow,
  IdentityVerification,
  PermissionGate,
  ProctorChatPanel,
  ProctoringIndicator,
  ProctoringTimer,
  SystemCheckRunner,
  ViolationAlert,
  useProctoringSession,
  useSystemCheck
});
//# sourceMappingURL=index.cjs.map