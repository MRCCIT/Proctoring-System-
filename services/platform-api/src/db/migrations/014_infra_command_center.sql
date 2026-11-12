-- Infrastructure Command Center: policies, rollups, nodes, alerts, recommendations, control audit

CREATE TABLE IF NOT EXISTS global_resource_policies (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version INT NOT NULL DEFAULT 1,
  policies JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_policies JSONB
);

INSERT INTO global_resource_policies (id, policies)
VALUES (
  1,
  '{
    "max_global_concurrent_sessions": 5000,
    "max_api_rps": 2000,
    "max_websocket_connections": 10000,
    "max_ai_concurrency": 64,
    "max_queue_capacity": 50000,
    "lane_workers": {"P0": 8, "P1": 6, "P2": 4, "P3": 4, "P4": 2},
    "db_pool_max": 50,
    "redis_memory_alert_pct": 85,
    "upload_throughput_mbps": 500,
    "load_level": "L0",
    "load_level_manual": false,
    "ai_degradation_level": 0,
    "ai_degradation_manual": false,
    "optimization_mode": "OBSERVE"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_resource_policies (
  tenant_id UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  policies JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_policies JSONB
);

CREATE TABLE IF NOT EXISTS service_metric_rollups (
  id BIGSERIAL PRIMARY KEY,
  bucket_start TIMESTAMPTZ NOT NULL,
  bucket_seconds INT NOT NULL DEFAULT 60,
  tenant_id UUID REFERENCES tenants (id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  workload_type TEXT,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  metric_unit TEXT,
  sample_count INT NOT NULL DEFAULT 1,
  attribution TEXT NOT NULL DEFAULT 'measured',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_metric_rollups_bucket
  ON service_metric_rollups (bucket_start DESC, service_name);
CREATE INDEX IF NOT EXISTS idx_service_metric_rollups_tenant
  ON service_metric_rollups (tenant_id, bucket_start DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_metric_rollups_metric
  ON service_metric_rollups (service_name, metric_name, bucket_start DESC);

CREATE TABLE IF NOT EXISTS infra_nodes (
  id TEXT PRIMARY KEY,
  hostname TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  cpu_pct DOUBLE PRECISION,
  ram_pct DOUBLE PRECISION,
  ram_used_bytes BIGINT,
  ram_total_bytes BIGINT,
  disk_pct DOUBLE PRECISION,
  disk_used_bytes BIGINT,
  disk_total_bytes BIGINT,
  network_rx_bps DOUBLE PRECISION,
  network_tx_bps DOUBLE PRECISION,
  gpu JSONB,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  service_name TEXT,
  tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT,
  trigger_metric TEXT,
  trigger_value DOUBLE PRECISION,
  threshold_value DOUBLE PRECISION,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_status ON monitoring_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_service ON monitoring_alerts (service_name, created_at DESC);

CREATE TABLE IF NOT EXISTS optimization_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'capacity',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  problem TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_service TEXT,
  affected_tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  recommended_action TEXT,
  expected_benefit TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opt_recs_status ON optimization_recommendations (status, created_at DESC);

CREATE TABLE IF NOT EXISTS control_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  tenant_id UUID REFERENCES tenants (id) ON DELETE SET NULL,
  resource TEXT,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  success BOOLEAN NOT NULL DEFAULT true,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_audit_created ON control_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_control_audit_tenant ON control_audit_logs (tenant_id, created_at DESC);
