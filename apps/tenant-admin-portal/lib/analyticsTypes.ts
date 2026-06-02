export interface UsageTotals {
  exams: number;
  candidates: number;
  total_sessions: number;
  active_sessions: number;
  storage_bytes: string;
  bytes_egress: string;
  violation_flags: string;
}

export interface UsageAnalytics {
  totals: UsageTotals;
  sessions_per_day: Array<{ day: string; sessions: number }>;
}

export interface ViolationsAnalytics {
  events_per_day: Array<{ day: string; events: number; serious: number }>;
  top_event_types: Array<{ event_type: string; count: number }>;
}
