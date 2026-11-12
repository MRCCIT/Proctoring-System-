'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, PageHeader, Skeleton, StatCard } from '@proctorshield/ui-components';
import { getClient } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { DynamicBarChart } from '@/components/infra/charts';

const LANES = ['P0', 'P1', 'P2', 'P3', 'P4'];

export default function QueuesPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = () => {
    getClient()
      .getInfrastructureQueues()
      .then((r) => setData(r.data))
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, []);

  const lanes = data?.lanes || {};

  return (
    <>
      <PageHeader
        title="Queue & Workers"
        description="P0–P4 lane decisions. P0/P1 are protected — deferrals here are critical."
        actions={
          <Button icon="refresh" onClick={load}>
            Refresh
          </Button>
        }
      />
      {err && <Alert tone="danger">{err}</Alert>}
      {!data ? (
        <Skeleton height={200} />
      ) : (
        <>
          <div className="ps-stats">
            {LANES.map((lane) => {
              const L = lanes[lane] || {};
              return (
                <StatCard
                  key={lane}
                  label={lane}
                  value={formatCount((L.allowed || 0) + (L.deferred || 0))}
                  hint={`allowed ${L.allowed || 0} · deferred ${L.deferred || 0}`}
                  tone={lane === 'P0' && L.deferred ? 'danger' : L.deferred ? 'warning' : 'default'}
                />
              );
            })}
          </div>
          <div className="ps-grid-2">
            {LANES.map((lane) => {
              const L = lanes[lane] || {};
              return (
                <Card key={lane} title={`${lane} mix`} description="Allowed vs deferred (cumulative process counters).">
                  <DynamicBarChart
                    points={[
                      { label: 'ok', v: L.allowed || 0 },
                      { label: 'defer', v: L.deferred || 0 },
                    ]}
                    colorClass={lane === 'P0' || lane === 'P1' ? 'ps-bar-b' : 'ps-bar-a'}
                  />
                </Card>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <Card title="Tenant sample">
              <pre className="ps-code">{JSON.stringify(data.by_tenant_sample || {}, null, 2)}</pre>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
