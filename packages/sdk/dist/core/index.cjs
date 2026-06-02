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

// src/core/index.ts
var core_exports = {};
__export(core_exports, {
  ApiKeyValidator: () => ApiKeyValidator,
  FeatureFlagResolver: () => FeatureFlagResolver,
  ProctorShieldClient: () => ProctorShieldClient,
  SessionTokenManager: () => SessionTokenManager,
  TenantConfigLoader: () => TenantConfigLoader
});
module.exports = __toCommonJS(core_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ApiKeyValidator,
  FeatureFlagResolver,
  ProctorShieldClient,
  SessionTokenManager,
  TenantConfigLoader
});
//# sourceMappingURL=index.cjs.map