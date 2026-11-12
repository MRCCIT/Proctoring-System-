'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { SuperAdminShell } from '@/components/SuperAdminShell';
import { InfraNav } from '@/components/infra/InfraNav';

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SuperAdminShell>
        <div className="ps-infra-shell">
          <aside className="ps-infra-side">
            <div className="ps-infra-side-head">
              <h2>Command Center</h2>
              <p className="ps-muted">Multi-tenant infrastructure monitoring & control</p>
            </div>
            <InfraNav />
          </aside>
          <div className="ps-infra-main">{children}</div>
        </div>
      </SuperAdminShell>
    </AuthGuard>
  );
}
