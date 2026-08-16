type TenantStatus = 'active' | 'suspended';
interface TenantSummary {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    api_key_prefix: string;
    contact_email: string | null;
    usage: {
        total_sessions: number;
        active_sessions: number;
        storage_bytes_used: string;
        bytes_egress_total: string;
        session_success_rate: number | null;
    };
    created_at: string;
    updated_at: string;
}
interface SuperAdminLoginResponse {
    access_token: string;
    token_type: string;
    expires_in: string;
    user: {
        id: string;
        email: string;
        display_name: string | null;
    };
}
interface TenantAdminLoginResponse {
    access_token: string;
    token_type: string;
    expires_in: string;
    tenant: {
        id: string;
        slug: string;
    };
    user: {
        id: string;
        email: string;
        display_name: string | null;
        role: string;
    };
}
interface SdkSessionInitResponse {
    session_id: string;
    ws_url: string;
    ws_token: string;
    external_ref: string;
    created_at: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
interface ProctorShieldClientOptions {
    baseUrl: string;
    apiKey?: string;
    accessToken?: string;
}
declare class ProctorShieldClient {
    readonly options: ProctorShieldClientOptions;
    constructor(options: ProctorShieldClientOptions);
    private headers;
    request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
    private q;
    superadminLogin(email: string, password: string): Promise<SuperAdminLoginResponse>;
    listTenants(cursor?: string, limit?: string): Promise<{
        data: TenantSummary[];
        next_cursor: string | null;
    }>;
    getTenant(id: string): Promise<{
        data: TenantSummary;
    }>;
    createTenant(body: Record<string, unknown>): Promise<{
        data: TenantSummary;
        api_key: string;
    }>;
    updateTenant(id: string, body: Record<string, unknown>): Promise<{
        data: TenantSummary;
    }>;
    suspendTenant(id: string): Promise<{
        data: TenantSummary;
    }>;
    rotateTenantKey(id: string): Promise<{
        data: TenantSummary;
        api_key: string;
    }>;
    listActiveSessionsSa(cursor?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    getSessionSa(id: string): Promise<{
        data: unknown;
    }>;
    getPlatformAnalytics(): Promise<{
        data: unknown;
    }>;
    getTenantsCompare(): Promise<{
        data: unknown[];
    }>;
    listAuditLogs(params?: {
        cursor?: string;
        tenant_id?: string;
        action?: string;
    }): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    getInfrastructureHealth(): Promise<{
        data: unknown;
    }>;
    tenantLogin(tenant_slug: string, email: string, password: string): Promise<TenantAdminLoginResponse>;
    listExams(cursor?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    createExam(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    listExamSessions(examId: string, cursor?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    listSessions(cursor?: string, exam_id?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    listLiveSessions(cursor?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    getSessionDetail(id: string): Promise<{
        data: {
            session: unknown;
            events: unknown[];
        };
    }>;
    getSessionRecording(id: string): Promise<{
        data: {
            recording_url: string;
            expires_at: string;
        };
    }>;
    getSessionSnapshots(id: string): Promise<{
        data: unknown[];
    }>;
    getSessionReport(id: string): Promise<{
        data: {
            report_url: string;
            expires_at: string;
        };
    }>;
    terminateSession(id: string): Promise<{
        data: unknown;
    }>;
    listCandidates(cursor?: string): Promise<{
        data: unknown[];
        next_cursor: string | null;
    }>;
    bulkImportCandidates(body: {
        candidates?: unknown[];
        csv?: string;
    }): Promise<{
        data: unknown;
    }>;
    getUsageAnalytics(): Promise<{
        data: unknown;
    }>;
    getViolationsAnalytics(): Promise<{
        data: unknown;
    }>;
    getExamReport(examId: string): Promise<{
        data: unknown;
    }>;
    listWebhooks(): Promise<{
        data: unknown[];
    }>;
    createWebhook(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    getSdkCredentials(): Promise<{
        data: Record<string, unknown>;
    }>;
    getBranding(): Promise<{
        data: unknown;
    }>;
    updateBranding(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    putBranding(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    listTenantUsers(): Promise<{
        data: unknown[];
    }>;
    getTenantUserDefaults(): Promise<{
        data: {
            roles: string[];
            defaults: Record<string, unknown>;
        };
    }>;
    createTenantUser(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    updateTenantUser(id: string, body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    deleteTenantUser(id: string): Promise<void>;
    rotateSdkKey(): Promise<{
        data: {
            api_key: string;
            tenant: unknown;
        };
    }>;
    listPolicyTemplates(): Promise<{
        data: unknown[];
    }>;
    createPolicyTemplate(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    updatePolicyTemplate(id: string, body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    deletePolicyTemplate(id: string): Promise<void>;
    listSessionTemplates(): Promise<{
        data: unknown[];
    }>;
    createSessionTemplate(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    updateSessionTemplate(id: string, body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    deleteSessionTemplate(id: string): Promise<void>;
    listProctorAssignments(params?: {
        exam_id?: string;
        session_id?: string;
        proctor_user_id?: string;
    }): Promise<{
        data: unknown[];
    }>;
    assignProctor(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    removeProctorAssignment(id: string): Promise<void>;
    pauseSession(id: string, body?: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    resumeSession(id: string, body?: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    extendSession(id: string, extra_seconds: number, note?: string): Promise<{
        data: unknown;
    }>;
    annotateSession(id: string, note: string): Promise<{
        data: unknown;
    }>;
    listSessionExtensions(id: string): Promise<{
        data: unknown[];
    }>;
    listSessionChat(id: string, limit?: number): Promise<{
        data: unknown[];
    }>;
    postSessionChat(id: string, message: string): Promise<{
        data: unknown;
    }>;
    listSessionFaceChecks(id: string, limit?: number): Promise<{
        data: unknown[];
    }>;
    listSessionRecordings(id: string): Promise<{
        data: unknown[];
    }>;
    getCandidateReport(candidateId: string): Promise<{
        data: unknown;
    }>;
    getAttendanceReport(examId: string): Promise<{
        data: unknown;
    }>;
    getAttendanceReportCsv(examId: string): string;
    initProctoringSession(body?: Record<string, unknown>): Promise<{
        data: SdkSessionInitResponse;
    }>;
    getSessionConfig(sessionId: string): Promise<{
        data: unknown;
    }>;
    getSdkBranding(): Promise<{
        data: unknown;
    }>;
    submitSystemCheck(sessionId: string, body: Record<string, unknown>): Promise<unknown>;
    submitIdentity(sessionId: string, body: Record<string, unknown>): Promise<unknown>;
    startStream(sessionId: string, body?: Record<string, unknown>): Promise<unknown>;
    endSession(sessionId: string, body?: Record<string, unknown>): Promise<unknown>;
    postSdkEvents(body: Record<string, unknown>): Promise<unknown>;
    postRecordingChunk(sessionId: string, body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    postFaceChecks(sessionId: string, items: Array<Record<string, unknown>>): Promise<{
        data: {
            inserted_count: number;
        };
    }>;
    postSnapshot(sessionId: string, body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    getIdentityReference(sessionId: string): Promise<{
        data: {
            candidate: {
                id: string;
                email?: string;
                name?: string;
                external_ref?: string;
            } | null;
            enrolled: boolean;
            mime_type?: string;
            bytes?: number;
            data_url: string | null;
            reason?: string;
        };
    }>;
    postCandidateChat(sessionId: string, message: string): Promise<{
        data: unknown;
    }>;
    listCandidateChat(sessionId: string, limit?: number): Promise<{
        data: unknown[];
    }>;
    getTurnCredentials(): Promise<{
        data: unknown;
    }>;
    /** Unified ~1 Hz proctor tick: face, gaze, phone streak, identity (Python microservices). */
    monitorTickAi(sessionId: string, imageDataUrl: string, persist?: boolean, body?: {
        reference_image?: string;
        identity_threshold?: number;
        load_reference?: boolean;
    }): Promise<{
        data: {
            analysis: Record<string, unknown>;
            persistence?: unknown;
            state?: unknown;
        };
    }>;
    analyzeFrameAi(sessionId: string, imageDataUrl: string, persist?: boolean): Promise<unknown>;
    phoneCheckAi(sessionId: string, imageDataUrl: string, persist?: boolean): Promise<unknown>;
    faceCompareAi(sessionId: string, body: {
        reference_image?: string;
        live_image?: string;
        profile_url?: string;
        live_url?: string;
        /** Minimum ArcFace similarity 0–100; default 62 */
        identity_threshold?: number;
    }): Promise<unknown>;
}

export { ProctorShieldClient as P, type SdkSessionInitResponse as S };
