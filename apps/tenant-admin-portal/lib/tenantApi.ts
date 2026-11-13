import { getClient, signOut } from './api';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ApiAuthMode = 'hard' | 'soft';

export type ApiOptions = {
  /**
   * hard (default): 401 clears the session and sends the user to login.
   * soft: 401 is surfaced to the caller only — used for background polls so a flaky
   * or briefly-restarting API does not kick the admin off the page.
   */
  auth?: ApiAuthMode;
};

export const AUTH_SOFT_FAIL_EVENT = 'ps:auth-soft-fail';

function emitAuthSoftFail() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SOFT_FAIL_EVENT));
}

function redirectExpiredLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  signOut();
  window.location.href = '/login?expired=1';
}

/**
 * Tenant API call.
 * User actions should keep default hard auth; background polls should pass `{ auth: 'soft' }`.
 */
export async function api<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  options?: ApiOptions
): Promise<T> {
  const mode: ApiAuthMode = options?.auth ?? 'hard';
  try {
    return await getClient().request<T>(method, path, body);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) {
      if (mode === 'soft') {
        emitAuthSoftFail();
      } else {
        redirectExpiredLogin();
      }
    }
    throw e;
  }
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface SessionRow {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  exam_id: string | null;
  exam_title: string;
  external_exam_id: string | null;
  candidate_id: string | null;
  candidate_name: string;
  candidate_email: string | null;
  external_candidate_id: string | null;
  external_ref: string | null;
  external_attempt_id: string | null;
  duration_seconds: number | null;
  violation_count: number;
  high_severity_count: number;
  open_violation_count: number;
  has_recording: boolean;
  snapshot_count: number;
  latest_snapshot_id?: string | null;
  review_status: 'pending' | 'in_review' | 'reviewed';
  review_decision: 'cleared' | 'flagged' | 'inconclusive' | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_summary: string | null;
  connection_state: string;
  last_heartbeat_at: string | null;
  last_violation_at?: string | null;
  last_identity_score?: number | null;
  stream_started_at?: string | null;
  risk_score?: number | null;
  highest_severity?: string | null;
  integration_metadata?: Record<string, unknown>;
  sdk_init_meta?: Record<string, unknown>;
  proctor_notes_json?: Array<{ note?: string; created_at?: string; actor?: unknown }>;
}

export interface SessionEvent {
  id: string;
  event_type: string;
  code: string;
  label: string;
  category: string;
  severity: 'info' | 'warn' | 'flag' | 'critical';
  source: string;
  is_violation: boolean;
  occurred_at: string;
  offset_seconds: number | null;
  review_status: 'open' | 'confirmed' | 'dismissed';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  payload: Record<string, unknown>;
}

export interface EvidenceRecording {
  id: string;
  track: string;
  merged: boolean;
  display_name: string;
  mime_type: string | null;
  bytes: number | null;
  duration_ms: number | null;
  started_at: string | null;
  ended_at: string | null;
  url: string | null;
}

export interface EvidenceSnapshot {
  id: string;
  caption: string | null;
  captured_at: string;
  source: string | null;
  offset_seconds: number | null;
  url: string | null;
  violation_context: Record<string, unknown> | null;
}

export interface Evidence {
  recording_origin: string | null;
  expires_in_seconds: number;
  recordings: EvidenceRecording[];
  snapshots: EvidenceSnapshot[];
}

export interface ReviewHistoryRow {
  id: string;
  event_id: string | null;
  event_type: string | null;
  action: string;
  note: string | null;
  actor_type: string;
  actor_id: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface ExamRow {
  id: string;
  title: string;
  description: string | null;
  external_exam_id: string | null;
  source: string;
  created_at: string;
  policy_template_id?: string | null;
  session_template_id?: string | null;
  ai_sensitivity?: string;
  session_count: number;
  candidate_count: number;
  live_count: number;
  completed_count: number;
  awaiting_review_count: number;
  flagged_count: number;
  critical_violation_count?: number;
  review_pending?: number;
  review_done?: number;
  review_progress_pct?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  last_session_at: string | null;
  violation_count?: number;
  avg_risk_score?: number | null;
  avg_duration_seconds?: number | null;
}

export interface AccessLink {
  id: string;
  label: string | null;
  exam_id: string | null;
  exam_title: string | null;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
  url: string;
}

export interface Overview {
  totals: {
    total_sessions: number;
    live_sessions: number;
    pending_sessions: number;
    completed_sessions: number;
    ended_abnormally: number;
    awaiting_review: number;
    flagged_sessions: number;
    sessions_last_7d: number;
    exam_contexts: number;
    candidates: number;
  };
  daily: { day: string; sessions: number; violations: number }[];
  top_violations: { code: string; count: number }[];
  recent_exams: {
    id: string;
    title: string;
    external_exam_id: string | null;
    sessions: number;
    live: number;
    last_session_at: string | null;
  }[];
}

export interface Paged<T> {
  data: T[];
  next_cursor: string | null;
  total?: number;
}
