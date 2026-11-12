import type {
  Paginated,
  SdkSessionInitResponse,
  SuperAdminLoginResponse,
  TenantAdminLoginResponse,
  TenantSummary,
} from '@proctorshield/shared-types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Session-scoped credentials returned to the candidate browser after a launch/link exchange. */
export interface CandidateBootstrap {
  session_id: string;
  status: string;
  candidate_name: string | null;
  exam: { id: string | null; title: string | null };
  session_token: string;
  ws_token: string;
  ws_url: string;
}

export interface ProctorShieldClientOptions {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  /** Session-scoped candidate credential from a launch/access-link exchange (preferred in browsers). */
  sessionToken?: string;
}

export class ProctorShieldClient {
  constructor(public readonly options: ProctorShieldClientOptions) {}

  private headers(init?: HeadersInit): Headers {
    const h = new Headers(init);
    h.set('Content-Type', 'application/json');
    if (this.options.accessToken) h.set('Authorization', `Bearer ${this.options.accessToken}`);
    if (this.options.sessionToken) h.set('X-Session-Token', this.options.sessionToken);
    else if (this.options.apiKey) h.set('X-API-Key', this.options.apiKey);
    return h;
  }

  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const url = `${this.options.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const detail = (json as { detail?: string })?.detail;
      const err = new Error(typeof detail === 'string' ? detail : res.statusText || 'Request failed');
      (err as Error & { status?: number; body?: unknown }).status = res.status;
      (err as Error & { body?: unknown }).body = json;
      throw err;
    }
    return json as T;
  }

  private q(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
  }

  /* Super Admin */
  superadminLogin(email: string, password: string) {
    return this.request<SuperAdminLoginResponse>('POST', '/v1/superadmin/auth/login', { email, password });
  }
  superadminMe() {
    return this.request<{ data: { id: string; email: string; display_name: string | null } }>(
      'GET',
      '/v1/superadmin/auth/me'
    );
  }
  listTenants(cursor?: string, limit?: string) {
    return this.request<{ data: TenantSummary[]; next_cursor: string | null }>(
      'GET',
      `/v1/superadmin/tenants${this.q({ next_cursor: cursor, limit })}`
    );
  }
  getTenant(id: string) {
    return this.request<{ data: TenantSummary }>('GET', `/v1/superadmin/tenants/${id}`);
  }
  getTenantAnalyticsSa(id: string) {
    return this.request<{
      data: {
        tenant_id: string;
        usage: {
          totals: {
            exams: number;
            candidates: number;
            total_sessions: number;
            active_sessions: number;
            sessions_last_7d: number;
            sessions_last_30d: number;
            storage_bytes: string;
            bytes_egress: string;
            violation_flags: string;
            flagged_sessions: number;
            cleared_sessions: number;
            awaiting_review: number;
          };
          sessions_per_day: { day: string; sessions: number }[];
        };
        violations: {
          events_per_day: { day: string; events: number; serious: number }[];
          top_event_types: Array<{
            event_type: string;
            code: string;
            label: string;
            category: string;
            severity: string;
            count: number;
          }>;
        };
      };
    }>('GET', `/v1/superadmin/tenants/${id}/analytics`);
  }
  createTenant(body: Record<string, unknown>) {
    return this.request<{
      data: TenantSummary;
      api_key: string;
      invite_url?: string | null;
      invite_expires_at?: string | null;
      admin?: { id: string; email: string; role: string; status?: string } | null;
    }>('POST', '/v1/superadmin/tenants', body);
  }
  issueTenantUserInviteLink(tenantId: string, userId: string) {
    return this.request<{ data: { invite_url: string; expires_at: string; email: string } }>(
      'POST',
      `/v1/superadmin/tenants/${tenantId}/users/${userId}/invite-link`
    );
  }
  issueTenantUserResetLink(tenantId: string, userId: string) {
    return this.request<{
      data: {
        reset_url?: string;
        invite_url?: string;
        expires_at: string;
        email: string;
        kind?: string;
      };
    }>('POST', `/v1/superadmin/tenants/${tenantId}/users/${userId}/reset-link`);
  }
  updateTenant(id: string, body: Record<string, unknown>) {
    return this.request<{ data: TenantSummary }>('PATCH', `/v1/superadmin/tenants/${id}`, body);
  }
  suspendTenant(id: string) {
    return this.request<{ data: TenantSummary }>('POST', `/v1/superadmin/tenants/${id}/suspend`);
  }
  activateTenant(id: string) {
    return this.request<{ data: TenantSummary }>('POST', `/v1/superadmin/tenants/${id}/activate`);
  }
  rotateTenantKey(id: string) {
    return this.request<{ data: TenantSummary; api_key: string }>('POST', `/v1/superadmin/tenants/${id}/rotate-key`);
  }
  listTenantUsersSa(id: string) {
    return this.request<{ data: unknown[] }>('GET', `/v1/superadmin/tenants/${id}/users`);
  }
  listActiveSessionsSa(cursor?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/superadmin/sessions/active${this.q({ next_cursor: cursor })}`
    );
  }
  getSessionSa(id: string) {
    return this.request<{ data: unknown }>('GET', `/v1/superadmin/sessions/${id}`);
  }
  getPlatformAnalytics() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/analytics/platform');
  }
  getTenantsCompare() {
    return this.request<{
      data: Array<{
        tenant_id: string;
        name: string;
        slug: string;
        status: string;
        total_sessions: number;
        active_sessions: number;
        violation_flags_sum: string | number;
        flagged_sessions: number;
        awaiting_review: number;
        success_rate: number | null;
        storage_bytes: string | number;
      }>;
    }>('GET', '/v1/superadmin/analytics/tenants/compare');
  }
  listAuditLogs(params?: { cursor?: string; tenant_id?: string; action?: string }) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/superadmin/audit-logs${this.q({
        next_cursor: params?.cursor,
        tenant_id: params?.tenant_id,
        action: params?.action,
      })}`
    );
  }
  getInfrastructureHealth() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/infrastructure/health');
  }
  getInfrastructureOverview() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/infrastructure/overview');
  }
  getInfrastructureServices() {
    return this.request<{ data: unknown[]; controls?: unknown; checked_at?: string }>(
      'GET',
      '/v1/superadmin/infrastructure/services'
    );
  }
  getInfrastructureService(service: string) {
    return this.request<{ data: unknown }>(
      'GET',
      `/v1/superadmin/infrastructure/services/${encodeURIComponent(service)}`
    );
  }
  getInfrastructureHardware() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/infrastructure/hardware');
  }
  getInfrastructureQueues() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/infrastructure/queues');
  }
  getInfrastructureTenants() {
    return this.request<{ data: unknown[] }>('GET', '/v1/superadmin/infrastructure/tenants');
  }
  getInfrastructureTenant(tenantId: string) {
    return this.request<{ data: unknown }>(
      'GET',
      `/v1/superadmin/infrastructure/tenants/${encodeURIComponent(tenantId)}`
    );
  }
  getInfrastructureTenantPolicies(tenantId: string) {
    return this.request<{ data: unknown }>(
      'GET',
      `/v1/superadmin/infrastructure/tenants/${encodeURIComponent(tenantId)}/policies`
    );
  }
  updateInfrastructureTenantPolicies(tenantId: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>(
      'PUT',
      `/v1/superadmin/infrastructure/tenants/${encodeURIComponent(tenantId)}/policies`,
      body
    );
  }
  getInfrastructureGlobalPolicies() {
    return this.request<{ data: unknown }>('GET', '/v1/superadmin/infrastructure/global-policies');
  }
  updateInfrastructureGlobalPolicies(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PUT', '/v1/superadmin/infrastructure/global-policies', body);
  }
  rollbackInfrastructureControls(body?: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/superadmin/infrastructure/controls/rollback', body || {});
  }
  getInfrastructureAlerts(params?: { status?: string; severity?: string; limit?: string }) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/superadmin/infrastructure/alerts${this.q({
        status: params?.status,
        severity: params?.severity,
        limit: params?.limit,
      })}`
    );
  }
  acknowledgeInfrastructureAlert(id: string) {
    return this.request<{ data: unknown }>(
      'POST',
      `/v1/superadmin/infrastructure/alerts/${encodeURIComponent(id)}/acknowledge`,
      {}
    );
  }
  resolveInfrastructureAlert(id: string) {
    return this.request<{ data: unknown }>(
      'POST',
      `/v1/superadmin/infrastructure/alerts/${encodeURIComponent(id)}/resolve`,
      {}
    );
  }
  getInfrastructureRecommendations(params?: { status?: string; limit?: string }) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/superadmin/infrastructure/recommendations${this.q({
        status: params?.status,
        limit: params?.limit,
      })}`
    );
  }
  approveInfrastructureRecommendation(id: string) {
    return this.request<{ data: unknown }>(
      'POST',
      `/v1/superadmin/infrastructure/recommendations/${encodeURIComponent(id)}/approve`,
      {}
    );
  }
  rejectInfrastructureRecommendation(id: string) {
    return this.request<{ data: unknown }>(
      'POST',
      `/v1/superadmin/infrastructure/recommendations/${encodeURIComponent(id)}/reject`,
      {}
    );
  }
  getInfrastructureControlAudit(params?: { cursor?: string; limit?: string; tenant_id?: string }) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/superadmin/infrastructure/audit-logs${this.q({
        next_cursor: params?.cursor,
        limit: params?.limit,
        tenant_id: params?.tenant_id,
      })}`
    );
  }

  /* Tenant Admin */
  tenantLogin(tenant_slug: string, email: string, password: string) {
    return this.request<TenantAdminLoginResponse>('POST', '/v1/tenant/auth/login', { tenant_slug, email, password });
  }
  peekTenantInvite(token: string) {
    return this.request<{
      data: {
        email: string;
        display_name?: string | null;
        tenant_slug: string;
        tenant_name?: string;
        expires_at: string;
        status: string;
      };
    }>('GET', `/v1/tenant/auth/invite/${encodeURIComponent(token)}`);
  }
  peekTenantReset(token: string) {
    return this.request<{
      data: {
        email: string;
        display_name?: string | null;
        tenant_slug: string;
        tenant_name?: string;
        expires_at: string;
        status: string;
      };
    }>('GET', `/v1/tenant/auth/reset/${encodeURIComponent(token)}`);
  }
  acceptTenantInvite(body: { token: string; password: string; display_name?: string }) {
    return this.request<TenantAdminLoginResponse>('POST', '/v1/tenant/auth/accept-invite', body);
  }
  forgotTenantPassword(body: { tenant_slug: string; email: string }) {
    return this.request<{ ok: boolean; message: string; reset_url?: string; invite_url?: string }>(
      'POST',
      '/v1/tenant/auth/forgot-password',
      body
    );
  }
  resetTenantPassword(body: { token: string; password: string }) {
    return this.request<TenantAdminLoginResponse>('POST', '/v1/tenant/auth/reset-password', body);
  }
  listExams(cursor?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/exams${this.q({ next_cursor: cursor })}`
    );
  }
  createExam(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/exams', body);
  }
  listExamSessions(examId: string, cursor?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/exams/${examId}/sessions${this.q({ next_cursor: cursor })}`
    );
  }
  listSessions(cursor?: string, exam_id?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/sessions${this.q({ next_cursor: cursor, exam_id })}`
    );
  }
  listLiveSessions(cursor?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/sessions/live${this.q({ next_cursor: cursor })}`
    );
  }
  getSessionDetail(id: string) {
    return this.request<{ data: { session: unknown; events: unknown[] } }>('GET', `/v1/sessions/${id}`);
  }
  getSessionRecording(id: string) {
    return this.request<{ data: { recording_url: string; expires_at: string } }>('GET', `/v1/sessions/${id}/recording`);
  }
  getSessionSnapshots(id: string) {
    return this.request<{ data: unknown[] }>('GET', `/v1/sessions/${id}/snapshots`);
  }
  getSessionReport(id: string) {
    return this.request<{ data: { report_url: string; expires_at: string } }>('GET', `/v1/sessions/${id}/report`);
  }
  terminateSession(id: string) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/terminate`);
  }
  listCandidates(cursor?: string) {
    return this.request<{ data: unknown[]; next_cursor: string | null }>(
      'GET',
      `/v1/candidates${this.q({ next_cursor: cursor })}`
    );
  }
  bulkImportCandidates(body: { candidates?: unknown[]; csv?: string }) {
    return this.request<{ data: unknown }>('POST', '/v1/candidates/bulk-import', body);
  }
  getUsageAnalytics() {
    return this.request<{ data: unknown }>('GET', '/v1/analytics/usage');
  }
  getViolationsAnalytics() {
    return this.request<{ data: unknown }>('GET', '/v1/analytics/violations');
  }
  getExamReport(examId: string) {
    return this.request<{ data: unknown }>('GET', `/v1/reports/exam/${examId}`);
  }
  listWebhooks() {
    return this.request<{ data: unknown[] }>('GET', '/v1/webhooks');
  }
  createWebhook(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/webhooks', body);
  }
  getSdkCredentials() {
    return this.request<{ data: Record<string, unknown> }>('GET', '/v1/tenant/sdk/credentials');
  }

  /* Tenant: branding, sub-admins, policy/session templates, assignments */
  getBranding() {
    return this.request<{ data: unknown }>('GET', '/v1/tenant/branding');
  }
  updateBranding(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PATCH', '/v1/tenant/branding', body);
  }
  putBranding(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PUT', '/v1/tenant/branding', body);
  }
  listTenantUsers() {
    return this.request<{ data: unknown[] }>('GET', '/v1/tenant/users');
  }
  getTenantUserDefaults() {
    return this.request<{ data: { roles: string[]; defaults: Record<string, unknown> } }>(
      'GET',
      '/v1/tenant/users/_defaults'
    );
  }
  createTenantUser(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/tenant/users', body);
  }
  updateTenantUser(id: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PATCH', `/v1/tenant/users/${id}`, body);
  }
  deleteTenantUser(id: string) {
    return this.request<void>('DELETE', `/v1/tenant/users/${id}`);
  }
  rotateSdkKey() {
    return this.request<{ data: { api_key: string; tenant: unknown } }>('POST', '/v1/tenant/sdk/rotate-key');
  }
  listPolicyTemplates() {
    return this.request<{ data: unknown[] }>('GET', '/v1/policy-templates');
  }
  createPolicyTemplate(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/policy-templates', body);
  }
  updatePolicyTemplate(id: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PATCH', `/v1/policy-templates/${id}`, body);
  }
  deletePolicyTemplate(id: string) {
    return this.request<void>('DELETE', `/v1/policy-templates/${id}`);
  }
  listSessionTemplates() {
    return this.request<{ data: unknown[] }>('GET', '/v1/session-templates');
  }
  createSessionTemplate(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/session-templates', body);
  }
  updateSessionTemplate(id: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('PATCH', `/v1/session-templates/${id}`, body);
  }
  deleteSessionTemplate(id: string) {
    return this.request<void>('DELETE', `/v1/session-templates/${id}`);
  }
  listProctorAssignments(params?: { exam_id?: string; session_id?: string; proctor_user_id?: string }) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/proctor-assignments${this.q({
        exam_id: params?.exam_id,
        session_id: params?.session_id,
        proctor_user_id: params?.proctor_user_id,
      })}`
    );
  }
  assignProctor(body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', '/v1/proctor-assignments', body);
  }
  removeProctorAssignment(id: string) {
    return this.request<void>('DELETE', `/v1/proctor-assignments/${id}`);
  }

  /* Session control */
  pauseSession(id: string, body: Record<string, unknown> = {}) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/pause`, body);
  }
  resumeSession(id: string, body: Record<string, unknown> = {}) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/resume`, body);
  }
  extendSession(id: string, extra_seconds: number, note?: string) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/extend`, { extra_seconds, note });
  }
  annotateSession(id: string, note: string) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/annotations`, { note });
  }
  listSessionExtensions(id: string) {
    return this.request<{ data: unknown[] }>('GET', `/v1/sessions/${id}/extensions`);
  }
  listSessionChat(id: string, limit?: number) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/sessions/${id}/chat${this.q({ limit: limit ? String(limit) : undefined })}`
    );
  }
  postSessionChat(id: string, message: string) {
    return this.request<{ data: unknown }>('POST', `/v1/sessions/${id}/chat`, { message });
  }
  listSessionFaceChecks(id: string, limit?: number) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/sessions/${id}/face-checks${this.q({ limit: limit ? String(limit) : undefined })}`
    );
  }
  listSessionRecordings(id: string) {
    return this.request<{ data: unknown[] }>('GET', `/v1/sessions/${id}/recordings`);
  }
  getCandidateReport(candidateId: string) {
    return this.request<{ data: unknown }>('GET', `/v1/reports/candidate/${candidateId}`);
  }
  getAttendanceReport(examId: string) {
    return this.request<{ data: unknown }>('GET', `/v1/reports/exam/${examId}/attendance`);
  }
  getAttendanceReportCsv(examId: string) {
    return `${this.options.baseUrl.replace(/\/$/, '')}/v1/reports/exam/${examId}/attendance?format=csv`;
  }

  /* Candidate entry (no API key): launch token from the integration API or a tenant access link */
  exchangeLaunchToken(launch_token: string) {
    return this.request<{ data: CandidateBootstrap }>('POST', '/v1/sdk/public/launch/exchange', { launch_token });
  }
  describeAccessLink(token: string) {
    return this.request<{
      data: {
        organization: string | null;
        branding: Record<string, unknown> | null;
        exam: { id: string; title: string } | null;
        requires_exam_title: boolean;
      };
    }>('GET', `/v1/sdk/public/links/describe${this.q({ token })}`);
  }
  startFromAccessLink(body: { link_token: string; candidate_name: string; exam_title?: string; candidate_email?: string }) {
    return this.request<{ data: CandidateBootstrap }>('POST', '/v1/sdk/public/links/start', {
      ...body,
      client_platform: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  }

  /* Candidate SDK */
  initProctoringSession(body: Record<string, unknown> = {}) {
    return this.request<{ data: SdkSessionInitResponse }>('POST', '/v1/sdk/sessions/init', body);
  }
  getSessionConfig(sessionId: string) {
    return this.request<{ data: unknown }>('GET', `/v1/sdk/sessions/${sessionId}/config`);
  }
  getSdkBranding() {
    return this.request<{ data: unknown }>('GET', '/v1/sdk/branding');
  }
  submitSystemCheck(sessionId: string, body: Record<string, unknown>) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/system-check`, body);
  }
  submitIdentity(sessionId: string, body: Record<string, unknown>) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/identity`, body);
  }
  startStream(sessionId: string, body: Record<string, unknown> = {}) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/stream/start`, body);
  }
  endSession(sessionId: string, body: Record<string, unknown> = {}) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/end`, body);
  }
  postSdkEvents(body: Record<string, unknown>) {
    return this.request('POST', '/v1/sdk/events', body);
  }
  postRecordingChunk(sessionId: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', `/v1/sdk/sessions/${sessionId}/recording-chunk`, body);
  }
  postFaceChecks(sessionId: string, items: Array<Record<string, unknown>>) {
    return this.request<{ data: { inserted_count: number } }>(
      'POST',
      `/v1/sdk/sessions/${sessionId}/face-checks`,
      { items }
    );
  }
  postSnapshot(sessionId: string, body: Record<string, unknown>) {
    return this.request<{ data: unknown }>('POST', `/v1/sdk/sessions/${sessionId}/snapshots`, body);
  }
  getIdentityReference(sessionId: string) {
    return this.request<{
      data: {
        candidate: { id: string; email?: string; name?: string; external_ref?: string } | null;
        enrolled: boolean;
        mime_type?: string;
        bytes?: number;
        data_url: string | null;
        reason?: string;
      };
    }>('GET', `/v1/sdk/sessions/${sessionId}/identity-reference`);
  }
  postCandidateChat(sessionId: string, message: string) {
    return this.request<{ data: unknown }>('POST', `/v1/sdk/sessions/${sessionId}/chat`, { message });
  }
  listCandidateChat(sessionId: string, limit?: number) {
    return this.request<{ data: unknown[] }>(
      'GET',
      `/v1/sdk/sessions/${sessionId}/chat${this.q({ limit: limit ? String(limit) : undefined })}`
    );
  }
  getTurnCredentials() {
    return this.request<{ data: unknown }>('GET', '/v1/sdk/turn-credentials');
  }
  /** Unified ~1 Hz proctor tick: face, gaze, phone streak, identity (Python microservices). */
  monitorTickAi(
    sessionId: string,
    imageDataUrl: string,
    persist = false,
    body: { reference_image?: string; identity_threshold?: number; load_reference?: boolean } = {}
  ) {
    return this.request<{ data: { analysis: Record<string, unknown>; persistence?: unknown; state?: unknown } }>(
      'POST',
      `/v1/sdk/sessions/${sessionId}/ai/monitor-tick${persist ? '?persist=1' : ''}`,
      { image: imageDataUrl, ...body }
    );
  }
  analyzeFrameAi(sessionId: string, imageDataUrl: string, persist = false) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/ai/analyze-frame${persist ? '?persist=1' : ''}`, {
      image: imageDataUrl,
    });
  }
  phoneCheckAi(sessionId: string, imageDataUrl: string, persist = false) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/ai/phone-check${persist ? '?persist=1' : ''}`, {
      image: imageDataUrl,
    });
  }
  faceCompareAi(
    sessionId: string,
    body: {
      reference_image?: string;
      live_image?: string;
      profile_url?: string;
      live_url?: string;
      /** Minimum ArcFace similarity 0–100; default 62 */
      identity_threshold?: number;
    }
  ) {
    return this.request('POST', `/v1/sdk/sessions/${sessionId}/ai/face-compare`, body);
  }
}
