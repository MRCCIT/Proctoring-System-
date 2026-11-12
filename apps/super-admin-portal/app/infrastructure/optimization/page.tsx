'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, PageHeader } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';

export default function OptimizationPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  const load = () => {
    getClient()
      .getInfrastructureRecommendations({ status: 'open', limit: '50' })
      .then((r) => setRows((r.data as any[]) || []))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title="Optimization Center"
        description="OBSERVE-mode recommendations from measured metrics. Nothing destructive is auto-applied."
        actions={
          <Button icon="refresh" onClick={load}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="ps-grid-2">
        {(rows || []).map((r) => (
          <Card
            key={r.id}
            title={r.title}
            description={`${r.category} · ${r.affected_service || 'platform'}${r.tenant_name ? ` · ${r.tenant_name}` : ''}`}
            actions={<Badge tone={r.severity === 'high' || r.severity === 'critical' ? 'danger' : 'warning'}>{r.severity}</Badge>}
          >
            <p style={{ marginTop: 0 }}>{r.problem}</p>
            <p className="ps-muted">{r.recommended_action}</p>
            <p className="ps-muted">Benefit: {r.expected_benefit} · Risk: {r.risk_level}</p>
            <pre className="ps-code" style={{ maxHeight: 120 }}>
              {JSON.stringify(r.evidence || {}, null, 2)}
            </pre>
            <div className="ps-inline" style={{ marginTop: 12 }}>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await getClient().approveInfrastructureRecommendation(r.id);
                  load();
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await getClient().rejectInfrastructureRecommendation(r.id);
                  load();
                }}
              >
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {rows && !rows.length && <Alert tone="info">No open recommendations right now.</Alert>}
    </>
  );
}
