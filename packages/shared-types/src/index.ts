export type TenantStatus = 'active' | 'suspended';

export interface TenantSummary {
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

export interface Paginated<T> {
  data: T[];
  next_cursor: string | null;
}

export interface SuperAdminLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
  user: { id: string; email: string; display_name: string | null };
}

export interface TenantAdminLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
  tenant: { id: string; slug: string };
  user: { id: string; email: string; display_name: string | null; role: string };
}

export interface SdkSessionInitResponse {
  session_id: string;
  ws_url: string;
  ws_token: string;
  external_ref: string;
  created_at: string;
}
