'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Icon, Spinner } from '@proctorshield/ui-components';
import { saveProfile, tenantTokens } from '@/lib/api';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function AuthHandoffPage() {
  const router = useRouter();
  const [err, setErr] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    if (!token) {
      setErr('Missing handoff token. Open the tenant portal from Super Admin again.');
      return;
    }

    const payload = decodeJwtPayload(token);
    if (!payload?.tenant_id) {
      setErr('Invalid handoff token.');
      return;
    }

    tenantTokens.set(token);
    const email = typeof payload.email === 'string' ? payload.email : null;
    const role = typeof payload.role === 'string' ? payload.role : 'admin';
    const name =
      (typeof payload.display_name === 'string' && payload.display_name) ||
      email ||
      'Super Admin';
    const impersonator =
      (typeof payload.impersonator_email === 'string' && payload.impersonator_email) ||
      email ||
      'super admin';

    const slug = typeof payload.tenant_slug === 'string' ? payload.tenant_slug : null;
    const tenantName = typeof payload.tenant_name === 'string' ? payload.tenant_name : slug;

    saveProfile({
      name,
      email,
      role,
      tenant_slug: slug,
      tenant_name: tenantName,
      org: tenantName,
      impersonation: true,
      impersonator_email: impersonator,
    });

    // Clean token from URL history, then enter the console.
    window.history.replaceState({}, '', '/auth/handoff');
    router.replace(role === 'proctor' || role === 'viewer' ? '/proctor' : '/dashboard');
  }, [router]);

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="ps-brand-mark">
            <Icon name="shield" size={18} />
          </span>
          <strong>ProctorShield</strong>
        </div>
        <h1>Opening organization console</h1>
        {err ? (
          <Alert tone="danger">{err}</Alert>
        ) : (
          <>
            <p className="ps-muted">Completing super-admin handoff…</p>
            <Spinner label="Signing you in" />
          </>
        )}
      </div>
    </div>
  );
}
