'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient } from '@/lib/api';

interface AllowedService {
  key: string;
  label: string;
  allowed: boolean;
}

export default function PoliciesPage() {
  const [services, setServices] = useState<AllowedService[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setBusy(true);
    try {
      const r = (await getClient().listPolicyTemplates()) as {
        allowed_services?: AllowedService[];
      };
      setServices(r.allowed_services || []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 20000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const allowedCount = services.filter((s) => s.allowed).length;

  return (
    <AuthGuard>
      <TenantAdminShell>
        <PageHeader
          title="Proctoring services"
          description="Assigned by Super Admin. Every exam runs these services — updates apply automatically."
          breadcrumbs={[{ label: 'Advanced' }, { label: 'Policies' }]}
          actions={
            <Button icon="refresh" loading={busy} onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
        {err && <Alert tone="danger">{err}</Alert>}

        <Card
          title="Assigned services"
          description={
            services.length
              ? `${allowedCount} of ${services.length} enabled for your organization.`
              : 'Loading allow-list from Super Admin…'
          }
        >
          {!services.length ? (
            <EmptyState
              icon="shield"
              title="No services assigned yet"
              description="Ask Super Admin to enable AI services for this organization."
            />
          ) : (
            <div className="ps-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {services.map((s) => (
                <Badge key={s.key} tone={s.allowed ? 'success' : 'neutral'}>
                  {s.label}: {s.allowed ? 'On' : 'Off'}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </TenantAdminShell>
    </AuthGuard>
  );
}
