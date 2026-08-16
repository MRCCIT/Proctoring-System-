// src/core/auth/ApiKeyValidator.ts
var ApiKeyValidator = class {
  static looksLikeKey(key) {
    return typeof key === "string" && key.startsWith("psk_") && key.length > 20;
  }
};

// src/core/auth/SessionTokenManager.ts
var SessionTokenManager = class {
  constructor(storageKey) {
    this.storageKey = storageKey;
  }
  get() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.storageKey);
  }
  set(token) {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.storageKey, token);
  }
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.storageKey);
  }
};

// src/core/config/TenantConfigLoader.ts
var TenantConfigLoader = class {
  constructor(fetchConfig) {
    this.fetchConfig = fetchConfig;
  }
  async load(sessionId) {
    return this.fetchConfig(sessionId);
  }
};
var FeatureFlagResolver = class {
  resolve(flags, key, defaultValue = false) {
    if (!flags) return defaultValue;
    const v = flags[key];
    return Boolean(v);
  }
};

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
  getIdentityReference(sessionId) {
    return this.request("GET", `/v1/sdk/sessions/${sessionId}/identity-reference`);
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
  /** Unified ~1 Hz proctor tick: face, gaze, phone streak, identity (Python microservices). */
  monitorTickAi(sessionId, imageDataUrl, persist = false, body = {}) {
    return this.request(
      "POST",
      `/v1/sdk/sessions/${sessionId}/ai/monitor-tick${persist ? "?persist=1" : ""}`,
      { image: imageDataUrl, ...body }
    );
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

// src/exam-window/components/ExamWindow.tsx
import { useCallback, useEffect as useEffect6, useMemo as useMemo2, useRef as useRef4, useState as useState6 } from "react";

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
var DEFAULT_MIMES = ["video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus", "video/mp4"];
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
    this.mimeType = "video/webm";
    this.stopResolve = null;
  }
  start(stream) {
    if (this.recorder) return;
    const chunkMs = this.opts.chunkMs ?? 1e4;
    const mime = pickMime(this.opts.mimeTypes ?? DEFAULT_MIMES);
    this.mimeType = mime || "video/webm";
    this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.currentChunkStart = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const endedAt = Date.now();
      const blob = new Blob([e.data], { type: e.data.type || this.mimeType });
      const sequence = this.sequence++;
      const startedAt = new Date(this.currentChunkStart).toISOString();
      this.currentChunkStart = endedAt;
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
    this.recorder.onstop = () => {
      this.recorder = null;
      const done = this.stopResolve;
      this.stopResolve = null;
      done?.();
    };
    this.recorder.start(chunkMs);
  }
  /** Flush the final timeslice and wait for upload before session teardown. */
  stop() {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") {
      this.recorder = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.stopResolve = null;
        resolve();
      }, 8e3);
      this.stopResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
      try {
        if (rec.state === "recording") rec.requestData();
        rec.stop();
      } catch {
        clearTimeout(timeout);
        this.recorder = null;
        this.stopResolve = null;
        resolve();
      }
    });
  }
};
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}
function buildChunkSignaler(client, sessionId, opts = {}) {
  const maxBytes = opts.maxBytes ?? 12 * 1024 * 1024;
  return async ({
    blob,
    sequence,
    track,
    startedAt,
    endedAt
  }) => {
    const sendBinary = !opts.metadataOnly && blob.size > 0 && blob.size <= maxBytes;
    const payload_base64 = sendBinary ? await blobToBase64(blob) : void 0;
    await client.postRecordingChunk(sessionId, {
      track,
      sequence,
      bytes: blob.size,
      duration_ms: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      started_at: startedAt,
      ended_at: endedAt,
      mime_type: blob.type || "video/webm",
      metadata: { mime: blob.type, persisted: sendBinary },
      payload_base64
    });
  };
}

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
async function bindStreamToVideo(stream, video) {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {
  });
  return waitForVideoReady(video);
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

// src/media/TURNResolver.ts
var TURNResolver = class {
  constructor(client) {
    this.client = client;
  }
  async resolve() {
    const res = await this.client.getTurnCredentials();
    return res.data;
  }
};

// src/media/LiveVideoSignaling.ts
var LiveVideoSignaling = class _LiveVideoSignaling {
  constructor(role, chat, getLocalStream, onRemoteStream, iceServers) {
    this.role = role;
    this.chat = chat;
    this.getLocalStream = getLocalStream;
    this.onRemoteStream = onRemoteStream;
    this.iceServers = iceServers;
    this.pc = null;
    this.polite = role === "proctor";
  }
  static async create(client, opts) {
    let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    try {
      const turn = await new TURNResolver(client).resolve();
      if (turn?.ice_servers?.length) iceServers = turn.ice_servers;
    } catch {
    }
    return new _LiveVideoSignaling(opts.role, opts.chat, opts.getLocalStream, opts.onRemoteStream, iceServers);
  }
  start() {
    this.offChat = this.chat.on((msg) => void this.onWsMessage(msg));
    if (this.role === "proctor") {
      this.chat.send({ op: "live_watch" });
    }
  }
  stop() {
    this.offChat?.();
    this.offChat = void 0;
    try {
      this.pc?.close();
    } catch {
    }
    this.pc = null;
  }
  sendSignal(signal) {
    this.chat.send({ op: "live_signal", signal });
  }
  async ensurePc() {
    if (this.pc) return this.pc;
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.sendSignal({ type: "ice", candidate: ev.candidate.toJSON() });
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.onRemoteStream?.(stream);
    };
    if (this.role === "candidate") {
      const stream = this.getLocalStream();
      stream?.getTracks().forEach((track) => {
        try {
          this.pc.addTrack(track, stream);
        } catch {
        }
      });
    }
    return this.pc;
  }
  async publishOffer() {
    const pc = await this.ensurePc();
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: offer.sdp });
  }
  async onWsMessage(msg) {
    const type = msg.type;
    if (type === "live_watch_request" && this.role === "candidate") {
      await this.publishOffer();
      return;
    }
    if (type !== "live_signal") return;
    const from = msg.from;
    if (from === this.role) return;
    const signal = msg.signal;
    if (!signal) return;
    const pc = await this.ensurePc();
    if (signal.type === "offer" && this.role === "proctor") {
      const offerCollision = pc.signalingState !== "stable";
      const ignore = !this.polite && offerCollision;
      if (ignore) return;
      if (offerCollision) {
        await pc.setLocalDescription({ type: "rollback" });
      }
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({ type: "answer", sdp: answer.sdp });
      return;
    }
    if (signal.type === "answer" && this.role === "candidate") {
      if (pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      }
      return;
    }
    if (signal.type === "ice" && signal.candidate) {
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch {
      }
    }
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

// src/lockdown/WindowFocusMonitor.ts
var WindowFocusMonitor = class {
  constructor() {
    this.blurHandler = null;
    this.focusHandler = null;
  }
  start(onChange) {
    this.blurHandler = () => onChange(false);
    this.focusHandler = () => onChange(true);
    window.addEventListener("blur", this.blurHandler);
    window.addEventListener("focus", this.focusHandler);
  }
  stop() {
    if (this.blurHandler) window.removeEventListener("blur", this.blurHandler);
    if (this.focusHandler) window.removeEventListener("focus", this.focusHandler);
    this.blurHandler = null;
    this.focusHandler = null;
  }
};

// src/lockdown/LockdownEnforcer.ts
var LockdownEnforcer = class {
  constructor() {
    this.keyboard = new KeyboardInterceptor();
    this.visibility = new VisibilityMonitor();
    this.windowFocus = new WindowFocusMonitor();
    this.capture = new ScreenCaptureBlocker();
    this.releaseCapture = null;
    this.displayCheckTimer = null;
    this.lastMultiDisplay = null;
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
    this.windowFocus.start((focused) => this.fire(focused ? "window_focus" : "window_blur"));
    const checkDisplays = () => {
      let multipleDisplays = false;
      try {
        multipleDisplays = Boolean(
          window.screen.isExtended
        );
      } catch {
      }
      if (multipleDisplays !== this.lastMultiDisplay) {
        this.lastMultiDisplay = multipleDisplays;
        this.fire(multipleDisplays ? "multiple_displays_detected" : "single_display_detected");
      }
    };
    checkDisplays();
    this.displayCheckTimer = setInterval(checkDisplays, 3e4);
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
    this.windowFocus.stop();
    this.releaseCapture?.();
    this.releaseCapture = null;
    if (this.displayCheckTimer) clearInterval(this.displayCheckTimer);
    this.displayCheckTimer = null;
    this.lastMultiDisplay = null;
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
import { useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsx("span", { style: { background: m.bg, color: m.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12 }, children: m.label });
}
function PermissionGate(props) {
  const { manager, requireScreen = true, brandPrimary = "#0f172a", onAllReady } = props;
  const [state, setState] = useState(manager.state);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const off = manager.onChange(setState);
    void manager.queryStored();
    return () => {
      off();
    };
  }, [manager]);
  useEffect(() => {
    if (state.camera !== "granted" || state.microphone !== "granted") return;
    if (manager.acquired.cameraAndMicStream?.getVideoTracks().some((t) => t.readyState === "live")) {
      return;
    }
    void manager.requestCameraAndMic().catch((e) => {
      setError(
        `Could not open camera/microphone: ${e.message}. Click "Allow camera & microphone" or check site permissions.`
      );
    });
  }, [state.camera, state.microphone, manager]);
  const camMicLive = Boolean(
    manager.acquired.cameraAndMicStream?.getVideoTracks().some((t) => t.readyState === "live")
  );
  const screenLive = !requireScreen || Boolean(manager.acquired.screenStream?.getVideoTracks().some((t) => t.readyState === "live"));
  const ready = state.camera === "granted" && state.microphone === "granted" && (!requireScreen || state.screen === "granted") && camMicLive && screenLive;
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
  const start = async () => {
    if (!ready) return;
    let stream = manager.acquired.cameraAndMicStream;
    if (!stream?.getVideoTracks().length) {
      try {
        stream = await manager.requestCameraAndMic();
      } catch (e) {
        setError(`Camera/microphone blocked: ${e.message}`);
        return;
      }
    }
    onAllReady({
      camMicStream: stream,
      screenStream: manager.acquired.screenStream
    });
  };
  const items = useMemo(
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
  return /* @__PURE__ */ jsxs("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ jsx("h2", { style: { marginBottom: 4 }, children: "Allow proctoring access" }),
    /* @__PURE__ */ jsx("p", { style: { color: "#475569", marginBottom: 16, fontSize: 14 }, children: "Before the exam can start we need permission to use your camera, microphone, and screen." }),
    items.filter(Boolean).map((it) => /* @__PURE__ */ jsxs("div", { style: ITEM, children: [
      /* @__PURE__ */ jsxs("div", { style: { paddingRight: 16 }, children: [
        /* @__PURE__ */ jsx("strong", { style: { display: "block" }, children: it.label }),
        /* @__PURE__ */ jsx("span", { style: { color: "#64748b", fontSize: 12 }, children: it.desc })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
        badge(it.state),
        it.state !== "granted" && /* @__PURE__ */ jsx(
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
    error && /* @__PURE__ */ jsx("p", { style: { color: "#b91c1c", fontSize: 13, marginTop: 12 }, children: error }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        disabled: !ready,
        onClick: () => void start(),
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
        children: ready ? "Continue to system check" : state.camera === "granted" && state.microphone === "granted" && !camMicLive ? "Starting camera\u2026" : "Awaiting permissions\u2026"
      }
    )
  ] });
}

// src/exam-window/components/SystemCheckRunner.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function SystemCheckRunner(props) {
  const { camMicStream, probeUrl, brandPrimary = "#0f172a", onStreamAcquired, onComplete } = props;
  const [steps, setSteps] = useState2([]);
  const [result, setResult] = useState2(null);
  useEffect2(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
    async function run(s) {
      let stream = camMicStream;
      if (!stream?.getVideoTracks().some((t) => t.readyState === "live")) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: { echoCancellation: true, noiseSuppression: true }
          });
        } catch {
          stream = camMicStream;
        }
      }
      if (cancelled) return;
      const hasVideo = (stream?.getVideoTracks().length ?? 0) > 0;
      const hasAudio = (stream?.getAudioTracks().length ?? 0) > 0;
      if (stream && hasVideo && stream !== camMicStream) {
        onStreamAcquired?.(stream);
      }
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
  }, [camMicStream, probeUrl, onStreamAcquired]);
  const ready = result && result.webcam && result.microphone && result.browser_compatible;
  const COLOR = { ok: "#16a34a", warn: "#d97706", fail: "#b91c1c", pending: "#64748b" };
  return /* @__PURE__ */ jsxs2("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ jsx2("h2", { style: { marginBottom: 4 }, children: "Pre-exam system check" }),
    /* @__PURE__ */ jsx2("p", { style: { color: "#475569", fontSize: 14, marginBottom: 12 }, children: "Verifying hardware, network, and environment readiness." }),
    /* @__PURE__ */ jsx2("ul", { style: { listStyle: "none", padding: 0, margin: 0 }, children: steps.map((s) => /* @__PURE__ */ jsxs2(
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
          /* @__PURE__ */ jsx2("span", { children: s.label }),
          /* @__PURE__ */ jsxs2("span", { style: { color: COLOR[s.status], fontWeight: 600 }, children: [
            s.status.toUpperCase(),
            s.note ? /* @__PURE__ */ jsx2("span", { style: { color: "#64748b", fontWeight: 400, marginLeft: 8 }, children: s.note }) : null
          ] })
        ]
      },
      s.key
    )) }),
    /* @__PURE__ */ jsx2(
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
import { useEffect as useEffect3, useRef, useState as useState3 } from "react";
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function IdentityVerification(props) {
  const {
    client,
    sessionId,
    cameraStream,
    brandPrimary = "#0f172a",
    referenceImage,
    referenceUrl,
    minSimilarity = DEFAULT_IDENTITY_MIN_SIMILARITY,
    onDone
  } = props;
  const videoRef = useRef(null);
  const [captured, setCaptured] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [match, setMatch] = useState3(null);
  const [err, setErr] = useState3(null);
  useEffect3(() => {
    if (videoRef.current && cameraStream) {
      void bindStreamToVideo(cameraStream, videoRef.current);
    }
  }, [cameraStream]);
  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;
    const frame = await captureFrameFromStream(cameraStream, v);
    if (!frame) {
      setErr("Could not capture from camera. Allow camera access and try again.");
      return;
    }
    setCaptured(frame);
    setMatch(null);
    setErr(null);
  };
  const hasReference = Boolean(referenceImage || referenceUrl);
  const minPct = normalizeMinSimilarity(minSimilarity);
  const submit = async () => {
    if (!captured) return;
    if (!hasReference) {
      setErr(
        'No enrolled reference photo found for this candidate (e.g. savej). Run db:seed with assets/savej-reference.png and use external ref "savej", or enroll a photo in tenant admin.'
      );
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await client.submitIdentity(sessionId, { image_base64: captured });
      let result;
      try {
        const body = referenceUrl ? { profile_url: referenceUrl, live_url: captured, identity_threshold: minPct } : { reference_image: referenceImage, live_image: captured, identity_threshold: minPct };
        const resp = await client.faceCompareAi(sessionId, body);
        const sim = Number(resp?.data?.similarity ?? 0);
        const verified = isIdentityVerified(resp?.data, minPct);
        result = {
          similarity: sim,
          verified,
          detector: String(resp?.data?.detector || "arcface")
        };
        setMatch(result);
        if (!verified) {
          setErr(
            `Identity check failed \u2014 similarity ${sim.toFixed(1)}% is below required ${minPct.toFixed(0)}%. Only the enrolled candidate may proceed. Retake with your face centered and well lit.`
          );
          return;
        }
      } catch (e) {
        setErr(
          `Identity verification could not run (${e.message}). Start the AI server: npm run dev:ai (port 5055), then retake your photo.`
        );
        return;
      }
      onDone({ image_base64: captured, match: result });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs3("section", { style: { maxWidth: 640 }, children: [
    /* @__PURE__ */ jsx3("h2", { style: { marginBottom: 4 }, children: "Identity verification" }),
    /* @__PURE__ */ jsxs3("p", { style: { color: "#475569", fontSize: 14, marginBottom: 12 }, children: [
      "Center your face inside the frame, look straight at the camera, then click Capture.",
      hasReference && " Your photo will be matched against your registered ID using ArcFace."
    ] }),
    /* @__PURE__ */ jsxs3("div", { style: { position: "relative", maxWidth: 480, marginBottom: 12 }, children: [
      /* @__PURE__ */ jsx3(
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
      captured && /* @__PURE__ */ jsx3(
        "img",
        {
          src: captured,
          alt: "Captured",
          style: { width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 12 }
        }
      )
    ] }),
    /* @__PURE__ */ jsx3("div", { style: { display: "flex", gap: 8 }, children: !captured ? /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        onClick: () => void capture(),
        style: {
          background: brandPrimary,
          color: "#fff",
          border: "none",
          padding: "8px 14px",
          borderRadius: 8,
          cursor: "pointer"
        },
        children: "Capture photo"
      }
    ) : /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          onClick: () => {
            setCaptured(null);
            setMatch(null);
          },
          style: {
            background: "#64748b",
            color: "#fff",
            border: "none",
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer"
          },
          children: "Retake"
        }
      ),
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          disabled: busy,
          onClick: () => void submit(),
          style: {
            background: brandPrimary,
            color: "#fff",
            border: "none",
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer"
          },
          children: busy ? "Verifying\u2026" : hasReference ? "Match & start exam" : "Verify & start exam"
        }
      )
    ] }) }),
    match && /* @__PURE__ */ jsxs3(
      "p",
      {
        style: {
          color: match.verified ? "#15803d" : "#b45309",
          fontSize: 13,
          marginTop: 12
        },
        children: [
          match.verified ? "Identity match" : "Identity weak match",
          " \u2014",
          " ",
          "similarity ",
          match.similarity.toFixed(2),
          " via ",
          match.detector,
          "."
        ]
      }
    ),
    err && /* @__PURE__ */ jsx3("p", { style: { color: "#b91c1c", fontSize: 13, marginTop: 12 }, children: err })
  ] });
}

// src/exam-window/components/FloatingCameraWindow.tsx
import { useEffect as useEffect4, useRef as useRef2, useState as useState4 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
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
  const videoRef = useRef2(null);
  const containerRef = useRef2(null);
  const [pos, setPos] = useState4(initial);
  const dragging = useRef2(null);
  useEffect4(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  useEffect4(() => {
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
    return /* @__PURE__ */ jsxs4(
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
          recording ? /* @__PURE__ */ jsx4("span", { style: { color: accentColor }, children: "\u25CF REC" }) : "\u25EF",
          " Proctor"
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs4(
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
        /* @__PURE__ */ jsxs4(
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
              /* @__PURE__ */ jsxs4("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                recording ? /* @__PURE__ */ jsx4("span", { style: { width: 8, height: 8, borderRadius: 4, background: accentColor, display: "inline-block" } }) : /* @__PURE__ */ jsx4("span", { style: { width: 8, height: 8, borderRadius: 4, background: "#475569", display: "inline-block" } }),
                statusLabel || "Proctoring"
              ] }),
              /* @__PURE__ */ jsx4(
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
        /* @__PURE__ */ jsx4(
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
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function ProctoringIndicator(props) {
  const { recording, sessionId, violations, online, brandPrimary = "#0f172a", paused, aiStatus } = props;
  return /* @__PURE__ */ jsxs5(
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
        /* @__PURE__ */ jsx5(
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
        /* @__PURE__ */ jsx5("strong", { style: { color: brandPrimary }, children: paused ? "PAUSED" : recording ? "RECORDING" : "IDLE" }),
        /* @__PURE__ */ jsx5("span", { style: { color: "#64748b" }, children: online ? "Online" : "Offline" }),
        /* @__PURE__ */ jsxs5("span", { style: { color: violations > 0 ? "#b91c1c" : "#16a34a" }, children: [
          violations,
          " violation",
          violations === 1 ? "" : "s"
        ] }),
        aiStatus && /* @__PURE__ */ jsxs5(
          "span",
          {
            style: {
              color: aiStatus.ok ? "#15803d" : "#b45309",
              fontWeight: 600,
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            },
            title: aiStatus.label,
            children: [
              "AI: ",
              aiStatus.label
            ]
          }
        ),
        sessionId && /* @__PURE__ */ jsxs5("span", { style: { color: "#94a3b8" }, children: [
          "#",
          sessionId.slice(0, 8)
        ] })
      ]
    }
  );
}

// src/exam-window/components/ProctorChatPanel.tsx
import { useEffect as useEffect5, useRef as useRef3, useState as useState5 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function ProctorChatPanel(props) {
  const { client, sessionId, chatWs, brandPrimary = "#0f172a", collapsed = false, onCollapseChange, role = "candidate" } = props;
  const [messages, setMessages] = useState5([]);
  const [draft, setDraft] = useState5("");
  const [unread, setUnread] = useState5(0);
  const scrollerRef = useRef3(null);
  useEffect5(() => {
    (async () => {
      try {
        const r = role === "candidate" ? await client.listCandidateChat(sessionId, 100) : await client.listSessionChat(sessionId, 100);
        setMessages(r.data || []);
      } catch {
      }
    })();
  }, [client, sessionId, role]);
  useEffect5(() => {
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
  useEffect5(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);
  useEffect5(() => {
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
    return /* @__PURE__ */ jsxs6(
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
  return /* @__PURE__ */ jsxs6(
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
        /* @__PURE__ */ jsxs6(
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
              /* @__PURE__ */ jsx6("strong", { children: "Proctor chat" }),
              /* @__PURE__ */ jsx6(
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
        /* @__PURE__ */ jsx6("div", { ref: scrollerRef, style: { flex: 1, overflowY: "auto", padding: 12, fontSize: 13 }, children: messages.length === 0 ? /* @__PURE__ */ jsx6("p", { style: { color: "#64748b" }, children: "No messages yet. Your proctor can message you here." }) : messages.map((m, i) => /* @__PURE__ */ jsxs6("div", { style: { marginBottom: 8 }, children: [
          /* @__PURE__ */ jsx6("div", { style: { color: "#64748b", fontSize: 11 }, children: m.sender_type === "system" ? "System" : m.sender_type === "proctor" ? "Proctor" : "You" }),
          /* @__PURE__ */ jsx6(
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
        /* @__PURE__ */ jsxs6(
          "form",
          {
            onSubmit: (e) => {
              e.preventDefault();
              void send();
            },
            style: { display: "flex", padding: 8, borderTop: "1px solid #e2e8f0" },
            children: [
              /* @__PURE__ */ jsx6(
                "input",
                {
                  value: draft,
                  onChange: (e) => setDraft(e.target.value),
                  placeholder: "Type a message\u2026",
                  style: { flex: 1, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 13 }
                }
              ),
              /* @__PURE__ */ jsx6(
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
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
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
  multiple_displays_detected: "Multiple displays detected",
  single_display_detected: "External display disconnected",
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
  return /* @__PURE__ */ jsxs7(
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
        /* @__PURE__ */ jsx7("strong", { style: { color: "#9a3412" }, children: "Policy alerts" }),
        /* @__PURE__ */ jsx7("ul", { style: { marginTop: 6, marginBottom: 0, paddingLeft: 18 }, children: props.violations.map((v) => /* @__PURE__ */ jsx7("li", { style: { color: "#7c2d12" }, children: LABELS[v] || v }, v)) })
      ]
    }
  );
}

// src/exam-window/components/ExamWindow.tsx
import { Fragment as Fragment2, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
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
    serverAi = true,
    analyzeMinIntervalMs = 500,
    phoneCheckMinIntervalMs = 6e4,
    identityReferenceImage,
    identityReferenceUrl,
    continuousIdentityCheck = true,
    identityCheckIntervalMs = 1e4,
    identityThreshold = 62,
    onSessionEnd,
    children
  } = props;
  const client = useMemo2(() => new ProctorShieldClient({ baseUrl, apiKey }), [baseUrl, apiKey]);
  const permsRef = useRef4(null);
  if (!permsRef.current) permsRef.current = new PermissionManager();
  const [step, setStep] = useState6("permissions");
  const [branding, setBranding] = useState6(brandingProp ?? {});
  const [sessionId, setSessionId] = useState6(null);
  const [wsToken, setWsToken] = useState6(null);
  const [error, setError] = useState6(null);
  const [violations, setViolations] = useState6([]);
  const [recording, setRecording] = useState6(false);
  const [paused, setPaused] = useState6(false);
  const [online, setOnline] = useState6(true);
  const [chatCollapsed, setChatCollapsed] = useState6(true);
  const [camCollapsed, setCamCollapsed] = useState6(false);
  const [seconds, setSeconds] = useState6(0);
  const [camMicStream, setCamMicStream] = useState6(null);
  const [screenStream, setScreenStream] = useState6(null);
  const [enrolledReference, setEnrolledReference] = useState6(null);
  const [enrolledCandidate, setEnrolledCandidate] = useState6(null);
  const [identitySimilarity, setIdentitySimilarity] = useState6(null);
  const [aiStatus, setAiStatus] = useState6(null);
  const hiddenVideoRef = useRef4(null);
  const camMicStreamRef = useRef4(null);
  const camRecorderRef = useRef4(null);
  const screenRecorderRef = useRef4(null);
  const faceServiceRef = useRef4(null);
  const identityServiceRef = useRef4(null);
  const audioRef = useRef4(null);
  const lockRef = useRef4(null);
  const netRef = useRef4(null);
  const ksRef = useRef4(null);
  const chatRef = useRef4(null);
  const liveVideoRef = useRef4(null);
  const lastViolationEmitRef = useRef4(/* @__PURE__ */ new Map());
  const accent = branding.accent_color || "#dc2626";
  const primary = branding.primary_color || "#0f172a";
  useEffect6(() => {
    camMicStreamRef.current = camMicStream;
    const v = hiddenVideoRef.current;
    if (camMicStream && v) void bindStreamToVideo(camMicStream, v);
  }, [camMicStream, step]);
  const captureSnapshotDataUrl = useCallback(async () => {
    return captureFrameFromStream(camMicStreamRef.current, hiddenVideoRef.current);
  }, []);
  const pushViolationUi = useCallback((reason) => {
    setViolations((prev) => prev.includes(reason) ? prev : [...prev, reason]);
  }, []);
  const addViolation = useCallback(
    (reason, opts) => {
      setViolations((prev) => prev.includes(reason) ? prev : [...prev, reason]);
      if (!sessionId) return;
      const now = Date.now();
      const cooldownMs = reason === "audio_voice_detected" ? 25e3 : reason.startsWith("keystroke_") ? 14e3 : reason.startsWith("network_") ? 35e3 : reason.startsWith("ai_") || reason.startsWith("gaze_") || reason === "phone_detected" || reason === "identity_mismatch" ? 4e3 : 12e3;
      const last = lastViolationEmitRef.current.get(reason) ?? 0;
      if (now - last < cooldownMs) return;
      lastViolationEmitRef.current.set(reason, now);
      void client.postSdkEvents({
        session_id: sessionId,
        events: [
          {
            type: `violation.${reason}`,
            severity: opts?.severity ?? "warn",
            occurred_at: (/* @__PURE__ */ new Date()).toISOString()
          }
        ]
      }).catch(() => {
      });
      void captureSnapshotDataUrl().then((img) => {
        if (!img) return;
        void client.postSnapshot(sessionId, {
          image_base64: img,
          caption: `Violation: ${reason}`,
          label: reason,
          source: "violation",
          mime_type: "image/jpeg",
          violation_context: { violation: reason, occurred_at: (/* @__PURE__ */ new Date()).toISOString() }
        }).catch(() => {
        });
      });
    },
    [client, sessionId, captureSnapshotDataUrl]
  );
  useEffect6(() => {
    if (brandingProp) return;
    void client.getSdkBranding().then((r) => setBranding((b) => ({ ...b, ...r.data }))).catch(() => {
    });
  }, [client, brandingProp]);
  const initSession = useCallback(async () => {
    const { data } = await client.initProctoringSession({
      exam_id: examId,
      candidate_id: candidateId,
      external_candidate_ref: externalRef,
      sdk_version: "0.1.0",
      client_platform: navigator.userAgent
    });
    setSessionId(data.session_id);
    setWsToken(data.ws_token);
    if (!identityReferenceImage && !identityReferenceUrl) {
      try {
        const ref = await client.getIdentityReference(data.session_id);
        if (ref.data?.enrolled && ref.data?.data_url) {
          setEnrolledReference(ref.data.data_url);
          setEnrolledCandidate(ref.data.candidate || null);
        }
      } catch {
      }
    }
    return data;
  }, [client, examId, candidateId, externalRef, identityReferenceImage, identityReferenceUrl]);
  const startExam = useCallback(
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
      liveVideoRef.current?.stop();
      void LiveVideoSignaling.create(client, {
        role: "candidate",
        chat: chatRef.current,
        getLocalStream: () => camMicStreamRef.current
      }).then((sig) => {
        liveVideoRef.current = sig;
        sig.start();
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
        camMicStreamRef.current = camMicStream;
        if (hiddenVideoRef.current) {
          await bindStreamToVideo(camMicStream, hiddenVideoRef.current);
        }
        camRecorderRef.current = new ChunkedRecorder({
          track: "camera",
          chunkMs: 1e4,
          onChunk: buildChunkSignaler(client, sid)
        });
        camRecorderRef.current.start(camMicStream);
        audioRef.current = new AudioAnalyzer();
        audioRef.current.on((r) => {
          if (r.voice_detected && r.level > 0.32) addViolation("audio_voice_detected");
        });
        audioRef.current.start(camMicStream, 4e3);
        const reference = identityReferenceImage || enrolledReference;
        faceServiceRef.current = new FaceCheckService(client, sid, {
          intervalMs: faceCheckIntervalMs,
          getStream: () => camMicStreamRef.current,
          serverAi,
          persistServerAi: true,
          analyzeMinIntervalMs,
          phoneCheckMinIntervalMs,
          referenceImage: reference || null,
          identityThreshold,
          onResult: (r) => {
            if (r.violations.includes("no_face_detected")) addViolation("no_face_detected");
            if (r.violations.includes("multiple_faces_detected")) addViolation("multiple_faces_detected");
          },
          onServerAnalysis: (r) => {
            (r.violations || []).forEach((v) => addViolation(`ai_${v}`));
            if (r.gaze_direction && r.gaze_direction !== "center" && (r.gaze_score ?? 0) > 0.6) {
              addViolation(`gaze_${r.gaze_direction}`);
            }
            if (r.identity_match === false) addViolation("identity_mismatch");
            if (r.identity_score != null) setIdentitySimilarity(r.identity_score);
          },
          onServerPhoneCheck: () => {
          },
          onServerTick: (r) => {
            const gaze = r.gaze_direction && r.gaze_direction !== "center" ? ` gaze:${r.gaze_direction}` : "";
            const viols = (r.violations || []).length ? ` \xB7 ${(r.violations || []).join(",")}` : "";
            const ms = r.processing_time_ms != null ? ` \xB7 ${Math.round(r.processing_time_ms)}ms` : "";
            setAiStatus({
              ok: true,
              label: `faces=${r.face_count ?? "?"}${gaze}${viols}${ms}`.slice(0, 96)
            });
          },
          onServerError: (msg) => {
            setAiStatus({ ok: false, label: msg.slice(0, 80) });
          }
        });
        if (hiddenVideoRef.current) faceServiceRef.current.start(hiddenVideoRef.current);
        if (continuousIdentityCheck && !serverAi && reference && hiddenVideoRef.current) {
          identityServiceRef.current = new IdentityCheckService(client, sid, reference, {
            intervalMs: identityCheckIntervalMs,
            getStream: () => camMicStreamRef.current,
            threshold: identityThreshold,
            onResult: (r) => setIdentitySimilarity(r.similarity),
            onMismatch: () => addViolation("identity_mismatch"),
            onRestored: () => {
            }
          });
          identityServiceRef.current.start(hiddenVideoRef.current);
        }
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
      if (serverAi) {
        void fetch(`${baseUrl.replace(/\/$/, "")}/health`).then((r) => r.json()).then((h) => {
          if (h.ai !== "up") {
            setError(
              "Python AI sidecar is not reachable. Run `npm run dev:ai` in the repo root (port 5055), then refresh."
            );
          }
        }).catch(() => {
          setError("Cannot reach the API for AI health check. Confirm `npm run dev:api` is running.");
        });
      }
      setRecording(true);
    },
    [
      baseUrl,
      camMicStream,
      client,
      screenStream,
      addViolation,
      pushViolationUi,
      faceCheckIntervalMs,
      onSessionEnd,
      serverAi,
      analyzeMinIntervalMs,
      phoneCheckMinIntervalMs,
      identityReferenceImage,
      enrolledReference,
      continuousIdentityCheck,
      identityCheckIntervalMs,
      identityThreshold
    ]
  );
  useEffect6(() => {
    const ref = identityReferenceImage || enrolledReference;
    faceServiceRef.current?.setReferenceImage(ref || null);
  }, [identityReferenceImage, enrolledReference]);
  useEffect6(() => {
    if (step !== "exam") return;
    const t = setInterval(() => setSeconds((s) => paused ? s : s + 1), 1e3);
    return () => clearInterval(t);
  }, [step, paused]);
  useEffect6(() => {
    if (step !== "exam" || !sessionId || paused) return;
    const tick = () => {
      void captureSnapshotDataUrl().then((img) => {
        if (!img) return;
        void client.postSnapshot(sessionId, {
          image_base64: img,
          caption: "Live monitor frame",
          source: "live_preview",
          label: "live",
          mime_type: "image/jpeg",
          violation_context: { live_preview: true, ts: (/* @__PURE__ */ new Date()).toISOString() }
        });
      });
    };
    const id = window.setInterval(tick, 2e3);
    tick();
    return () => clearInterval(id);
  }, [step, sessionId, paused, client, captureSnapshotDataUrl]);
  const tearDown = useCallback(async () => {
    await Promise.all([
      camRecorderRef.current?.stop() ?? Promise.resolve(),
      screenRecorderRef.current?.stop() ?? Promise.resolve()
    ]);
    faceServiceRef.current?.stop();
    identityServiceRef.current?.stop();
    audioRef.current?.stop();
    lockRef.current?.stop();
    netRef.current?.stop();
    ksRef.current?.stop();
    liveVideoRef.current?.stop();
    liveVideoRef.current = null;
    chatRef.current?.close();
    permsRef.current?.release();
    camRecorderRef.current = null;
    screenRecorderRef.current = null;
    faceServiceRef.current = null;
    identityServiceRef.current = null;
    audioRef.current = null;
    lockRef.current = null;
    netRef.current = null;
    ksRef.current = null;
    chatRef.current = null;
  }, []);
  useEffect6(
    () => () => {
      void tearDown();
    },
    [tearDown]
  );
  const endExam = async () => {
    if (!sessionId) return;
    try {
      await tearDown();
      await new Promise((r) => setTimeout(r, 400));
      await client.endSession(sessionId, { status: "completed", success: true });
    } catch (e) {
      setError(e.message);
    }
    setRecording(false);
    setStep("submitted");
    onSessionEnd?.(sessionId);
  };
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return /* @__PURE__ */ jsxs8("div", { style: { fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto", padding: 24, color: "#0f172a" }, children: [
    /* @__PURE__ */ jsxs8("header", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }, children: [
      branding.logo_url && /* @__PURE__ */ jsx8("img", { src: branding.logo_url, alt: branding.organization_name || "logo", style: { height: 36 } }),
      /* @__PURE__ */ jsx8("h1", { style: { margin: 0, fontSize: 22, color: primary }, children: branding.organization_name || "ProctorShield Exam" })
    ] }),
    error && /* @__PURE__ */ jsx8("p", { style: { color: "#b91c1c" }, children: error }),
    camMicStream && /* @__PURE__ */ jsx8("video", { ref: hiddenVideoRef, autoPlay: true, muted: true, playsInline: true, style: { display: "none" }, "aria-hidden": true }),
    step === "permissions" && /* @__PURE__ */ jsxs8(Fragment2, { children: [
      branding.candidate_welcome_message && /* @__PURE__ */ jsx8("p", { style: { color: "#475569", marginBottom: 12 }, children: branding.candidate_welcome_message }),
      /* @__PURE__ */ jsx8(
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
    step === "system-check" && /* @__PURE__ */ jsx8(
      SystemCheckRunner,
      {
        camMicStream,
        probeUrl: `${baseUrl}/health`,
        brandPrimary: primary,
        onStreamAcquired: setCamMicStream,
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
    step === "identity" && sessionId && /* @__PURE__ */ jsx8(
      IdentityVerification,
      {
        client,
        sessionId,
        cameraStream: camMicStream,
        brandPrimary: primary,
        referenceImage: identityReferenceImage || enrolledReference || void 0,
        referenceUrl: identityReferenceUrl,
        minSimilarity: identityThreshold,
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
    step === "exam" && sessionId && /* @__PURE__ */ jsxs8("section", { children: [
      /* @__PURE__ */ jsxs8("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [
        /* @__PURE__ */ jsx8(
          ProctoringIndicator,
          {
            recording,
            sessionId,
            violations: violations.length,
            online,
            brandPrimary: primary,
            paused,
            aiStatus: serverAi ? aiStatus : null
          }
        ),
        /* @__PURE__ */ jsxs8("span", { style: { fontSize: 14, color: "#475569" }, children: [
          "Elapsed\xA0",
          mins,
          ":",
          String(secs).padStart(2, "0")
        ] })
      ] }),
      violations.length > 0 && /* @__PURE__ */ jsx8(ViolationAlert, { violations }),
      /* @__PURE__ */ jsx8("div", { style: { minHeight: 460, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", overflow: "hidden" }, children: examUrl ? /* @__PURE__ */ jsx8(
        "iframe",
        {
          title: "Exam",
          src: examUrl,
          style: { width: "100%", height: "70vh", border: "none" }
        }
      ) : /* @__PURE__ */ jsx8("div", { style: { padding: 24 }, children: children ?? /* @__PURE__ */ jsxs8("p", { style: { color: "#475569" }, children: [
        "Pass ",
        /* @__PURE__ */ jsx8("code", { children: "examUrl" }),
        " to embed your LMS, or use the SDK as a wrapper around your own exam UI by providing ",
        /* @__PURE__ */ jsx8("code", { children: "children" }),
        "."
      ] }) }) }),
      /* @__PURE__ */ jsxs8("div", { style: { marginTop: 16, display: "flex", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsxs8("small", { style: { color: "#64748b" }, children: [
          "Face checks every ",
          Math.round(faceCheckIntervalMs / 1e3),
          "s \xB7 Camera + screen recording chunked every 10\u201315s",
          serverAi && /* @__PURE__ */ jsxs8(Fragment2, { children: [
            " ",
            "\xB7 Unified AI every ",
            analyzeMinIntervalMs < 1e3 ? `${analyzeMinIntervalMs}ms` : `${Math.round(analyzeMinIntervalMs / 1e3)}s`
          ] }),
          continuousIdentityCheck && !serverAi && (identityReferenceImage || enrolledReference) && /* @__PURE__ */ jsxs8(Fragment2, { children: [
            " ",
            "\xB7 Identity match every ",
            Math.round(identityCheckIntervalMs / 1e3),
            "s",
            enrolledCandidate?.name ? ` vs. ${enrolledCandidate.name}` : "",
            identitySimilarity != null && ` \xB7 similarity ${identitySimilarity.toFixed(2)}`
          ] })
        ] }),
        /* @__PURE__ */ jsx8(
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
      /* @__PURE__ */ jsx8(
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
      /* @__PURE__ */ jsx8(
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
    step === "submitted" && /* @__PURE__ */ jsxs8("section", { children: [
      /* @__PURE__ */ jsx8("h2", { children: "Exam submitted" }),
      /* @__PURE__ */ jsxs8("p", { children: [
        "Session ended. Recording and AI evidence have been uploaded to ",
        branding.organization_name || "your organization",
        "."
      ] })
    ] })
  ] });
}

// src/exam-window/components/ProctoringTimer.tsx
import { useEffect as useEffect7, useState as useState7 } from "react";
import { jsxs as jsxs9 } from "react/jsx-runtime";
function ProctoringTimer(props) {
  const [elapsed, setElapsed] = useState7(0);
  useEffect7(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - props.startedAt) / 1e3)), 1e3);
    return () => clearInterval(t);
  }, [props.startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return /* @__PURE__ */ jsxs9("p", { children: [
    "Time: ",
    m,
    ":",
    String(s).padStart(2, "0")
  ] });
}

// src/exam-window/hooks/useProctoringSession.ts
import { useCallback as useCallback2, useState as useState8 } from "react";
function useProctoringSession(apiKey, baseUrl) {
  const [sessionId, setSessionId] = useState8(null);
  const [error, setError] = useState8(null);
  const client = new ProctorShieldClient({ baseUrl, apiKey });
  const init = useCallback2(
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
import { useState as useState9 } from "react";
function useSystemCheck(client, sessionId) {
  const [result, setResult] = useState9(null);
  const submit = async (checks) => {
    if (!sessionId) throw new Error("No session");
    const res = await client.submitSystemCheck(sessionId, { results: checks });
    setResult(res);
    return res;
  };
  return { result, submit };
}

// src/admin-panel/components/AdminDashboard.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
var LINKS = [
  { href: "/sessions", label: "Sessions" },
  { href: "/exams", label: "Exams" },
  { href: "/candidates", label: "Candidates" },
  { href: "/live", label: "Live monitoring" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" }
];
function AdminDashboard() {
  return /* @__PURE__ */ jsx9("nav", { style: { display: "flex", gap: 16, flexWrap: "wrap" }, children: LINKS.map((l) => /* @__PURE__ */ jsx9("a", { href: l.href, style: { color: "#0f172a" }, children: l.label }, l.href)) });
}

// src/admin-panel/components/LiveMonitoring.tsx
import { useEffect as useEffect8, useState as useState10 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function LiveMonitoring(props) {
  const [items, setItems] = useState10([]);
  useEffect8(() => {
    void props.client.request("GET", "/v1/sessions/live").then((r) => setItems(r.data || []));
  }, [props.client]);
  return /* @__PURE__ */ jsxs10("div", { children: [
    /* @__PURE__ */ jsx10("h2", { children: "Live sessions" }),
    /* @__PURE__ */ jsx10("pre", { style: { fontSize: 12, overflow: "auto" }, children: JSON.stringify(items, null, 2) })
  ] });
}

// src/admin-panel/components/ProctorLiveView.tsx
import { useCallback as useCallback3, useEffect as useEffect9, useMemo as useMemo3, useRef as useRef5, useState as useState11 } from "react";

// src/admin-panel/components/proctorLiveHelpers.ts
function candidateInitials(name, email) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email || "").trim();
  return e ? e.slice(0, 2).toUpperCase() : "?";
}
function parseViolationCaption(caption) {
  const raw = caption.replace(/^Violation:\s*/i, "").trim();
  const code = raw.split(/\s*[-–·]\s*/)[0]?.trim() || raw;
  const label = code.replace(/^ai_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const lower = code.toLowerCase();
  let severity = "warning";
  if (/tab|window|focus|phone|identity|multiple|absent/.test(lower)) severity = "critical";
  else if (/gaze|looking|sideways|head/.test(lower)) severity = "warning";
  else severity = "info";
  return { label, code, severity };
}
function sessionStatusTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "in_progress") return "active";
  if (s === "paused") return "paused";
  if (s === "completed" || s === "terminated" || s === "ended") return "ended";
  return "unknown";
}
function formatMatchScore(score) {
  if (score == null || Number.isNaN(score)) return null;
  const n = Number(score);
  if (n <= 1) return `${Math.round(n * 100)}%`;
  if (n <= 100) return `${Math.round(n)}%`;
  return `${n.toFixed(1)}`;
}

// src/admin-panel/components/ProctorLiveView.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function IconLive() {
  return /* @__PURE__ */ jsx11("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: /* @__PURE__ */ jsx11("circle", { cx: "12", cy: "12", r: "4" }) });
}
function IconVideo() {
  return /* @__PURE__ */ jsxs11("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx11("rect", { x: "2", y: "5", width: "15", height: "14", rx: "2" }),
    /* @__PURE__ */ jsx11("path", { d: "M17 9l5-3v12l-5-3V9z" })
  ] });
}
function ProctorLiveView(props) {
  const { client, bearerToken, sessionId, brandPrimary = "#0f172a" } = props;
  const baseUrl = props.baseUrl || client.options.baseUrl;
  const apiRoot = baseUrl.replace(/\/$/, "");
  const [messages, setMessages] = useState11([]);
  const [draft, setDraft] = useState11("");
  const [face, setFace] = useState11([]);
  const [status, setStatus] = useState11({});
  const [extraSeconds, setExtraSeconds] = useState11(300);
  const [annot, setAnnot] = useState11("");
  const [busy, setBusy] = useState11(false);
  const [err, setErr] = useState11(null);
  const chatRef = useRef5(null);
  const liveVideoRef = useRef5(null);
  const liveWatchTimerRef = useRef5(null);
  const liveConnectedRef = useRef5(false);
  const remoteVideoRef = useRef5(null);
  const previewRevokeRef = useRef5([]);
  const violationRevokeRef = useRef5([]);
  const [hdr, setHdr] = useState11({});
  const [previewUrl, setPreviewUrl] = useState11(null);
  const [previewErr, setPreviewErr] = useState11(null);
  const [liveConnected, setLiveConnected] = useState11(false);
  const [violationThumbs, setViolationThumbs] = useState11([]);
  const [lightbox, setLightbox] = useState11(null);
  const [violationFilter, setViolationFilter] = useState11("all");
  const statusTone = sessionStatusTone(status.status);
  const candidateLine = [hdr.candidateName, hdr.candidateEmail].filter(Boolean).join(" \xB7 ");
  const initials = candidateInitials(hdr.candidateName, hdr.candidateEmail);
  const filteredViolations = useMemo3(() => {
    if (violationFilter === "all") return violationThumbs;
    return violationThumbs.filter((v) => {
      const { code } = parseViolationCaption(v.caption);
      return code.toLowerCase().includes(violationFilter);
    });
  }, [violationThumbs, violationFilter]);
  const violationCategories = useMemo3(() => {
    const cats = /* @__PURE__ */ new Set();
    for (const v of violationThumbs) {
      const { code } = parseViolationCaption(v.caption);
      if (/tab|window|focus/.test(code)) cats.add("focus");
      else if (/gaze|looking|head|sideways/.test(code)) cats.add("gaze");
      else if (/phone|object/.test(code)) cats.add("object");
      else cats.add("other");
    }
    return Array.from(cats);
  }, [violationThumbs]);
  const faceRows = useMemo3(() => [...face].reverse().slice(0, 25), [face]);
  const fetchPanelData = useCallback3(async () => {
    try {
      const [chat, faces, snaps] = await Promise.all([
        client.listSessionChat(sessionId, 100),
        client.listSessionFaceChecks(sessionId, 40),
        client.getSessionSnapshots(sessionId)
      ]);
      setMessages(chat.data || []);
      setFace(faces.data || []);
      const snapRows = snaps.data || [];
      const loadSnapBlob = async (id) => {
        const res = await fetch(`${apiRoot}/v1/media/snapshots/${id}?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${bearerToken}` }
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return blob.size > 0 ? URL.createObjectURL(blob) : null;
      };
      const latestLive = snapRows.find((s) => s.source === "live_preview" && (s.file_path || s.bytes)) || snapRows.find((s) => s.file_path || s.bytes != null && s.bytes > 0);
      if (latestLive?.id && bearerToken) {
        try {
          const objUrl = await loadSnapBlob(latestLive.id);
          if (objUrl) {
            previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
            previewRevokeRef.current = [objUrl];
            setPreviewUrl(objUrl);
            setPreviewErr(null);
          }
        } catch (e) {
          setPreviewErr(e.message);
        }
      }
      const violationRows = snapRows.filter((s) => s.source === "violation" || s.source && s.source !== "live_preview").slice(0, 24);
      if (bearerToken && violationRows.length) {
        const loaded = await Promise.all(
          violationRows.map(async (s) => {
            const url = await loadSnapBlob(s.id);
            if (!url) return null;
            return {
              id: s.id,
              url,
              caption: s.caption || "Violation",
              captured_at: s.captured_at
            };
          })
        );
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        const valid = loaded.filter(Boolean);
        violationRevokeRef.current = valid.map((v) => v.url);
        setViolationThumbs(valid);
      } else {
        violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
        violationRevokeRef.current = [];
        setViolationThumbs([]);
      }
    } catch (e) {
      setErr(e.message);
    }
  }, [client, sessionId, bearerToken, apiRoot]);
  useEffect9(() => {
    void client.getSessionDetail(sessionId).then((r) => {
      const d = r.data;
      const s = d.session || {};
      setHdr({
        exam: s.exam_title || void 0,
        candidateEmail: s.candidate_email || s.external_ref || void 0,
        candidateName: s.candidate_name || void 0
      });
    }).catch(() => {
    });
  }, [client, sessionId]);
  useEffect9(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchPanelData();
    };
    void tick();
    const pol = setInterval(() => void tick(), 5e3);
    return () => {
      cancelled = true;
      clearInterval(pol);
      previewRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewRevokeRef.current = [];
      violationRevokeRef.current.forEach((u) => URL.revokeObjectURL(u));
      violationRevokeRef.current = [];
    };
  }, [fetchPanelData]);
  useEffect9(() => {
    const wsUrl = `${baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/v1/sdk/ws/sessions/${sessionId}`;
    chatRef.current = new ProctorChatClient({ wsUrl, token: bearerToken, asProctor: true });
    chatRef.current.connect();
    chatRef.current.on((msg) => {
      const t = msg.type;
      if (t === "chat_message") {
        setMessages((prev) => [
          ...prev,
          msg
        ]);
      }
      if (t === "status") setStatus(msg);
      if (t === "ws_open") {
        liveVideoRef.current?.stop();
        void LiveVideoSignaling.create(client, {
          role: "proctor",
          chat: chatRef.current,
          getLocalStream: () => null,
          onRemoteStream: (stream) => {
            liveConnectedRef.current = true;
            setLiveConnected(true);
            if (liveWatchTimerRef.current) {
              clearInterval(liveWatchTimerRef.current);
              liveWatchTimerRef.current = null;
            }
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              void remoteVideoRef.current.play().catch(() => {
              });
            }
          }
        }).then((sig) => {
          liveVideoRef.current = sig;
          sig.start();
          if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
          liveWatchTimerRef.current = setInterval(() => {
            if (!liveConnectedRef.current) chatRef.current?.send({ op: "live_watch" });
          }, 12e3);
        });
      }
    });
    chatRef.current.pollStatus();
    const poll = setInterval(() => chatRef.current?.pollStatus(), 1e4);
    return () => {
      clearInterval(poll);
      if (liveWatchTimerRef.current) clearInterval(liveWatchTimerRef.current);
      liveWatchTimerRef.current = null;
      liveVideoRef.current?.stop();
      liveVideoRef.current = null;
      liveConnectedRef.current = false;
      setLiveConnected(false);
      chatRef.current?.close();
    };
  }, [sessionId, bearerToken, baseUrl, client]);
  const send = async () => {
    const m = draft.trim();
    if (!m) return;
    setDraft("");
    const sent = chatRef.current?.sendChat(m);
    if (!sent) {
      try {
        await client.postSessionChat(sessionId, m);
      } catch (e) {
        setErr(e.message);
      }
    }
  };
  const wrap = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await fetchPanelData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs11("div", { className: "proctor-root", style: { ["--proctor-brand"]: brandPrimary }, children: [
    lightbox && /* @__PURE__ */ jsx11(
      "div",
      {
        className: "evidence-lightbox",
        role: "dialog",
        "aria-modal": true,
        onClick: () => setLightbox(null),
        onKeyDown: (e) => e.key === "Escape" && setLightbox(null),
        children: /* @__PURE__ */ jsxs11("div", { className: "evidence-lightbox-inner", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsx11("button", { type: "button", className: "evidence-lightbox-close", onClick: () => setLightbox(null), "aria-label": "Close", children: "\xD7" }),
          /* @__PURE__ */ jsx11("img", { src: lightbox.url, alt: "", className: "evidence-lightbox-img" }),
          /* @__PURE__ */ jsxs11("div", { className: "evidence-lightbox-footer", children: [
            lightbox.title,
            lightbox.subtitle ? ` \xB7 ${lightbox.subtitle}` : ""
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsxs11("header", { className: "proctor-header", children: [
      /* @__PURE__ */ jsxs11("div", { className: "proctor-header-main", children: [
        /* @__PURE__ */ jsxs11("nav", { className: "proctor-breadcrumb", "aria-label": "Breadcrumb", children: [
          /* @__PURE__ */ jsx11("span", { className: "proctor-breadcrumb-muted", children: "Live" }),
          /* @__PURE__ */ jsx11("span", { className: "proctor-breadcrumb-sep", children: "/" }),
          /* @__PURE__ */ jsx11("span", { children: hdr.exam || "Exam session" })
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "proctor-candidate-row", children: [
          /* @__PURE__ */ jsx11("div", { className: "proctor-avatar", "aria-hidden": true, children: initials }),
          /* @__PURE__ */ jsxs11("div", { children: [
            /* @__PURE__ */ jsx11("h2", { className: "proctor-candidate-name", children: hdr.candidateName || "Candidate" }),
            candidateLine && /* @__PURE__ */ jsx11("p", { className: "proctor-candidate-meta", children: candidateLine })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "proctor-header-badges", children: [
        /* @__PURE__ */ jsx11("span", { className: `proctor-pill proctor-pill-status proctor-pill-${statusTone}`, children: status.status || "Unknown" }),
        /* @__PURE__ */ jsxs11("span", { className: `proctor-pill proctor-pill-stream ${liveConnected ? "proctor-pill-live" : ""}`, children: [
          /* @__PURE__ */ jsx11(IconLive, {}),
          liveConnected ? "Stream live" : "Connecting stream"
        ] }),
        /* @__PURE__ */ jsxs11("span", { className: "proctor-pill proctor-pill-muted", title: "Session id", children: [
          sessionId.slice(0, 8),
          "\u2026"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "proctor-stats", children: [
      /* @__PURE__ */ jsxs11("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-value", children: violationThumbs.length }),
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-label", children: "Violation captures" })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-value", children: face.length }),
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-label", children: "Face checks" })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-value", children: messages.length }),
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-label", children: "Chat messages" })
      ] }),
      /* @__PURE__ */ jsxs11("div", { className: "proctor-stat", children: [
        /* @__PURE__ */ jsx11("span", { className: `proctor-stat-value ${liveConnected ? "proctor-stat-ok" : "proctor-stat-warn"}`, children: liveConnected ? "On" : "\u2026" }),
        /* @__PURE__ */ jsx11("span", { className: "proctor-stat-label", children: "WebRTC" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "proctor-layout", children: [
      /* @__PURE__ */ jsxs11("main", { className: "proctor-main", children: [
        /* @__PURE__ */ jsxs11("section", { className: "proctor-card proctor-video-card", children: [
          /* @__PURE__ */ jsxs11("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsxs11("h3", { className: "proctor-card-title", children: [
              /* @__PURE__ */ jsx11(IconVideo, {}),
              "Live feed"
            ] }),
            liveConnected && /* @__PURE__ */ jsxs11("span", { className: "proctor-live-badge", children: [
              /* @__PURE__ */ jsx11("span", { className: "proctor-live-dot" }),
              "LIVE"
            ] })
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "proctor-video-stage", children: [
            /* @__PURE__ */ jsx11(
              "video",
              {
                ref: remoteVideoRef,
                autoPlay: true,
                playsInline: true,
                muted: true,
                className: "proctor-video-el"
              }
            ),
            !liveConnected && /* @__PURE__ */ jsxs11("div", { className: "proctor-video-overlay", children: [
              /* @__PURE__ */ jsx11("div", { className: "proctor-video-spinner" }),
              /* @__PURE__ */ jsx11("p", { className: "proctor-video-overlay-title", children: "Connecting to candidate camera" }),
              /* @__PURE__ */ jsx11("p", { className: "proctor-video-overlay-hint", children: "Keep this panel open while the candidate exam is running. WebRTC connects automatically." })
            ] }),
            previewUrl && /* @__PURE__ */ jsxs11(
              "button",
              {
                type: "button",
                className: "proctor-pip",
                title: "Latest backup frame (~10s)",
                onClick: () => setLightbox({
                  url: previewUrl,
                  title: "Backup frame",
                  subtitle: "Polled snapshot"
                }),
                children: [
                  /* @__PURE__ */ jsx11("img", { src: previewUrl, alt: "" }),
                  /* @__PURE__ */ jsx11("span", { children: "Backup" })
                ]
              }
            )
          ] }),
          !previewUrl && previewErr && /* @__PURE__ */ jsx11("p", { className: "proctor-inline-muted", children: previewErr })
        ] }),
        /* @__PURE__ */ jsxs11("section", { className: "proctor-card", children: [
          /* @__PURE__ */ jsxs11("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsx11("h3", { className: "proctor-card-title", children: "Violation timeline" }),
            /* @__PURE__ */ jsxs11("span", { className: "proctor-card-meta", children: [
              violationThumbs.length,
              " captures"
            ] })
          ] }),
          violationCategories.length > 1 && /* @__PURE__ */ jsxs11("div", { className: "proctor-filters", children: [
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "all" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("all"),
                children: "All"
              }
            ),
            violationCategories.includes("focus") && /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "focus" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("focus"),
                children: "Tab / focus"
              }
            ),
            violationCategories.includes("gaze") && /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "gaze" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("gaze"),
                children: "Gaze"
              }
            ),
            violationCategories.includes("object") && /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: `evidence-chip ${violationFilter === "object" ? "evidence-chip-active" : ""}`,
                onClick: () => setViolationFilter("object"),
                children: "Objects"
              }
            )
          ] }),
          filteredViolations.length === 0 ? /* @__PURE__ */ jsxs11("div", { className: "proctor-empty", children: [
            /* @__PURE__ */ jsx11("p", { children: "No violation snapshots yet." }),
            /* @__PURE__ */ jsx11("p", { className: "proctor-inline-muted", children: "AI and lockdown events (tab switch, gaze, phone, identity) appear here automatically." })
          ] }) : /* @__PURE__ */ jsx11("div", { className: "proctor-violation-grid", children: filteredViolations.map((v) => {
            const parsed = parseViolationCaption(v.caption);
            const time = v.captured_at ? new Date(v.captured_at).toLocaleTimeString() : "";
            return /* @__PURE__ */ jsxs11(
              "button",
              {
                type: "button",
                className: `proctor-violation-card proctor-violation-${parsed.severity}`,
                onClick: () => setLightbox({
                  url: v.url,
                  title: parsed.label,
                  subtitle: time
                }),
                children: [
                  /* @__PURE__ */ jsx11("img", { src: v.url, alt: "", className: "proctor-violation-img" }),
                  /* @__PURE__ */ jsxs11("div", { className: "proctor-violation-body", children: [
                    /* @__PURE__ */ jsx11("span", { className: `proctor-violation-tag proctor-tag-${parsed.severity}`, children: parsed.label }),
                    time && /* @__PURE__ */ jsx11("span", { className: "proctor-violation-time", children: time })
                  ] })
                ]
              },
              v.id
            );
          }) })
        ] }),
        /* @__PURE__ */ jsxs11("section", { className: "proctor-card", children: [
          /* @__PURE__ */ jsxs11("div", { className: "proctor-card-head", children: [
            /* @__PURE__ */ jsx11("h3", { className: "proctor-card-title", children: "Face & identity checks" }),
            /* @__PURE__ */ jsx11("span", { className: "proctor-card-meta", children: "Server AI \xB7 refreshed every 5s" })
          ] }),
          faceRows.length === 0 ? /* @__PURE__ */ jsxs11("div", { className: "proctor-empty", children: [
            /* @__PURE__ */ jsx11("p", { children: "No face checks recorded yet." }),
            /* @__PURE__ */ jsx11("p", { className: "proctor-inline-muted", children: "Start the candidate exam with API and AI sidecar running." })
          ] }) : /* @__PURE__ */ jsx11("div", { className: "proctor-table-wrap", children: /* @__PURE__ */ jsxs11("table", { className: "proctor-table", children: [
            /* @__PURE__ */ jsx11("thead", { children: /* @__PURE__ */ jsxs11("tr", { children: [
              /* @__PURE__ */ jsx11("th", { children: "Time" }),
              /* @__PURE__ */ jsx11("th", { children: "Source" }),
              /* @__PURE__ */ jsx11("th", { children: "Faces" }),
              /* @__PURE__ */ jsx11("th", { children: "Match" }),
              /* @__PURE__ */ jsx11("th", { children: "Flags" })
            ] }) }),
            /* @__PURE__ */ jsx11("tbody", { children: faceRows.map((f, i) => {
              const match = formatMatchScore(f.match_score);
              const faceOk = f.face_count === 1;
              return /* @__PURE__ */ jsxs11("tr", { children: [
                /* @__PURE__ */ jsx11("td", { className: "proctor-td-time", children: new Date(f.occurred_at).toLocaleTimeString() }),
                /* @__PURE__ */ jsx11("td", { children: /* @__PURE__ */ jsx11("span", { className: "proctor-src-badge", children: f.source || f.detector || "\u2014" }) }),
                /* @__PURE__ */ jsx11("td", { children: /* @__PURE__ */ jsx11("span", { className: `proctor-face-count ${faceOk ? "ok" : "bad"}`, children: f.face_count }) }),
                /* @__PURE__ */ jsx11("td", { children: match ? /* @__PURE__ */ jsx11(
                  "span",
                  {
                    className: `proctor-match-pill ${parseFloat(match) >= 62 ? "ok" : "warn"}`,
                    children: match
                  }
                ) : /* @__PURE__ */ jsx11("span", { className: "proctor-inline-muted", children: "\u2014" }) }),
                /* @__PURE__ */ jsx11("td", { className: "proctor-td-flags", children: f.violations?.length ? f.violations.map((x) => /* @__PURE__ */ jsx11("span", { className: "proctor-flag-chip", children: x.replace(/_/g, " ") }, x)) : "\u2014" })
              ] }, i);
            }) })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs11("aside", { className: "proctor-sidebar", children: [
        /* @__PURE__ */ jsxs11("section", { className: "proctor-card proctor-controls-card", children: [
          /* @__PURE__ */ jsx11("h3", { className: "proctor-card-title", children: "Session controls" }),
          err && /* @__PURE__ */ jsx11("p", { className: "proctor-error", children: err }),
          /* @__PURE__ */ jsxs11("div", { className: "proctor-control-actions", children: [
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-warn",
                disabled: busy,
                onClick: () => void wrap(() => client.pauseSession(sessionId)),
                children: "Pause exam"
              }
            ),
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-success",
                disabled: busy,
                onClick: () => void wrap(() => client.resumeSession(sessionId)),
                children: "Resume"
              }
            ),
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-danger",
                disabled: busy,
                onClick: () => void wrap(() => client.terminateSession(sessionId)),
                children: "Terminate"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "proctor-field", children: [
            /* @__PURE__ */ jsx11("label", { htmlFor: "proctor-extend", children: "Extend time" }),
            /* @__PURE__ */ jsxs11("div", { className: "proctor-field-row", children: [
              /* @__PURE__ */ jsx11(
                "input",
                {
                  id: "proctor-extend",
                  type: "number",
                  min: 30,
                  value: extraSeconds,
                  onChange: (e) => setExtraSeconds(parseInt(e.target.value, 10) || 0)
                }
              ),
              /* @__PURE__ */ jsx11(
                "button",
                {
                  type: "button",
                  className: "proctor-btn proctor-btn-primary",
                  disabled: busy || !extraSeconds,
                  onClick: () => void wrap(() => client.extendSession(sessionId, extraSeconds)),
                  children: "Apply"
                }
              )
            ] }),
            /* @__PURE__ */ jsx11("span", { className: "proctor-field-hint", children: "Seconds added to scheduled end" })
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "proctor-field", children: [
            /* @__PURE__ */ jsx11("label", { htmlFor: "proctor-note", children: "Proctor note" }),
            /* @__PURE__ */ jsx11(
              "textarea",
              {
                id: "proctor-note",
                value: annot,
                onChange: (e) => setAnnot(e.target.value),
                rows: 3,
                placeholder: "Document an observation for the audit trail\u2026"
              }
            ),
            /* @__PURE__ */ jsx11(
              "button",
              {
                type: "button",
                className: "proctor-btn proctor-btn-primary proctor-btn-block",
                disabled: busy || !annot.trim(),
                onClick: () => void wrap(async () => {
                  await client.annotateSession(sessionId, annot.trim());
                  setAnnot("");
                }),
                children: "Save note"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs11("section", { className: "proctor-card proctor-chat-card", children: [
          /* @__PURE__ */ jsx11("h3", { className: "proctor-card-title", children: "Candidate chat" }),
          /* @__PURE__ */ jsx11("div", { className: "proctor-chat-log", children: messages.length === 0 ? /* @__PURE__ */ jsx11("p", { className: "proctor-inline-muted", children: "No messages yet. Send a warning or instruction below." }) : messages.map((m, i) => /* @__PURE__ */ jsxs11(
            "div",
            {
              className: `proctor-chat-bubble ${m.sender_type === "proctor" ? "proctor-chat-out" : "proctor-chat-in"}`,
              children: [
                /* @__PURE__ */ jsxs11("div", { className: "proctor-chat-meta", children: [
                  m.sender_type,
                  " \xB7 ",
                  new Date(m.created_at).toLocaleTimeString()
                ] }),
                /* @__PURE__ */ jsx11("div", { children: m.message })
              ]
            },
            i
          )) }),
          /* @__PURE__ */ jsxs11(
            "form",
            {
              className: "proctor-chat-form",
              onSubmit: (e) => {
                e.preventDefault();
                void send();
              },
              children: [
                /* @__PURE__ */ jsx11(
                  "input",
                  {
                    value: draft,
                    onChange: (e) => setDraft(e.target.value),
                    placeholder: "Message candidate\u2026",
                    "aria-label": "Chat message"
                  }
                ),
                /* @__PURE__ */ jsx11("button", { type: "submit", className: "proctor-btn proctor-btn-primary", children: "Send" })
              ]
            }
          )
        ] })
      ] })
    ] })
  ] });
}

// src/lockdown/ExternalAppDetector.ts
var ExternalAppDetector = class {
  async scan() {
    return { suspicious: false, details: [] };
  }
};

// src/media/WebRTCManager.ts
var WebRTCManager = class {
  constructor(client) {
    this.client = client;
    this.turn = new TURNResolver(this.client);
  }
  async createPeerConnection() {
    const turn = await this.turn.resolve();
    const iceServers = turn?.ice_servers ?? [{ urls: "stun:stun.l.google.com:19302" }];
    return new RTCPeerConnection({ iceServers });
  }
};

// src/media/MediaRecorder.ts
var MediaRecorderWrapper = class {
  constructor() {
    this.recorder = null;
  }
  start(stream, onChunk) {
    this.recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) onChunk(e.data);
    };
    this.recorder.start(5e3);
  }
  stop() {
    this.recorder?.stop();
    this.recorder = null;
  }
};

// src/media/SnapshotCapture.ts
async function captureVideoFrame(video) {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  const frame = await captureFrameFromStream(stream, video);
  if (frame) return frame;
  throw new Error("Could not capture a frame from the camera");
}

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

// src/events/EventEmitter.ts
var EventEmitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
};

// src/events/WebhookDispatcher.ts
var WebhookDispatcher = class {
  constructor(client) {
    this.client = client;
  }
  async dispatchEvents(sessionId, events) {
    return this.client.postSdkEvents({ session_id: sessionId, events });
  }
};
export {
  AdminDashboard,
  AiSidecarThrottle,
  ApiKeyValidator,
  AudioAnalyzer,
  ChunkedRecorder,
  CloudInference,
  EventEmitter,
  ExamWindow,
  ExternalAppDetector,
  FACE_CHECK_WORKER_SOURCE,
  FaceCheckService,
  FaceDetector,
  FeatureFlagResolver,
  FloatingCameraWindow,
  GazeEstimator,
  IdentityCheckService,
  IdentityVerification,
  KeyboardInterceptor,
  KeystrokeAnalyzer,
  LiveMonitoring,
  LocalInference,
  LockdownEnforcer,
  MediaRecorderWrapper,
  NetworkMonitor,
  ObjectDetector,
  PermissionGate,
  PermissionManager,
  ProctorChatClient,
  ProctorChatPanel,
  ProctorLiveView,
  ProctorShieldClient,
  ProctoringIndicator,
  ProctoringTimer,
  ScreenCaptureBlocker,
  SessionTokenManager,
  SystemCheckRunner,
  TURNResolver,
  TenantConfigLoader,
  ViolationAlert,
  VisibilityMonitor,
  WebRTCManager,
  WebhookDispatcher,
  WindowFocusMonitor,
  buildChunkSignaler,
  captureVideoFrame,
  createFaceCheckWorker,
  useProctoringSession,
  useSystemCheck
};
//# sourceMappingURL=index.js.map