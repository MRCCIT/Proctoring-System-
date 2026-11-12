export type TenantCompareRow = {
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
};
