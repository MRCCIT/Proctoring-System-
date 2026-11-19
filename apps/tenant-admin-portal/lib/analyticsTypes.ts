export interface UsageTotals {
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
}

export interface UsageAnalytics {
  totals: UsageTotals;
  sessions_per_day: Array<{ day: string; sessions: number }>;
}

export interface ViolationsAnalytics {
  events_per_day: Array<{ day: string; events: number; serious: number }>;
  top_event_types: Array<{
    event_type: string;
    code?: string;
    label?: string;
    category?: string;
    severity?: string;
    count: number;
  }>;
}
