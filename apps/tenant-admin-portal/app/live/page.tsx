'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProctorLiveView } from '@proctorshield/sdk/admin-panel';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { getClient, tenantTokens, API_BASE } from '@/lib/api';

interface LiveSession {
  id: string;
  exam_title?: string;
  candidate_email?: string;
  candidate_name?: string;
  violation_flags?: number;
  status?: string;
}

export default function LivePage() {
  const [items, setItems] = useState<LiveSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    getClient()
      .listLiveSessions()
      .then((r) => {
        const data = (r.data as LiveSession[]) || [];
        setItems(data);
        if (selected && !data.some((s) => s.id === selected)) {
          setSelected(data[0]?.id ?? null);
        } else if (!selected && data.length === 1) {
          setSelected(data[0].id);
        }
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthGuard>
      <TenantAdminShell>
        <div className="live-page">
          <header className="live-page-header">
            <div>
              <h1 className="live-page-title">Live proctoring</h1>
              <p className="live-page-sub">
                Monitor active exams in real time — WebRTC video, AI violations, and session controls.
              </p>
            </div>
            <div className="live-page-actions">
              <button
                type="button"
                className="dash-btn"
                onClick={refresh}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link href="/sessions" className="dash-btn">
                All sessions
              </Link>
            </div>
          </header>

          {err && <p className="error">{err}</p>}

          <div className="live-page-shell">
            <aside className="live-sessions-panel">
              <div className="live-sessions-head">
                <h2>Active sessions</h2>
                <span className="live-sessions-count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="proctor-empty" style={{ margin: 12 }}>
                  <p>No live sessions right now.</p>
                  <p className="proctor-inline-muted">
                    Start a candidate exam to see it here. List refreshes every 10 seconds.
                  </p>
                </div>
              ) : (
                <ul className="live-session-list">
                  {items.map((s) => {
                    const violations = s.violation_flags ?? 0;
                    const isActive = s.id === selected;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`live-session-item ${isActive ? 'live-session-item-active' : ''}`}
                          onClick={() => setSelected(s.id)}
                        >
                          <div className="live-session-exam">{s.exam_title || 'Untitled exam'}</div>
                          <div className="live-session-candidate">
                            {s.candidate_name || 'Candidate'}
                            {s.candidate_email ? ` · ${s.candidate_email}` : ''}
                          </div>
                          <div className="live-session-foot">
                            <span
                              className={`live-session-violations ${
                                violations === 0 ? 'live-session-violations-none' : ''
                              }`}
                            >
                              {violations === 0 ? 'No flags' : `${violations} flag${violations === 1 ? '' : 's'}`}
                            </span>
                            <span className="live-session-watch">{isActive ? 'Watching' : 'Watch →'}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            <div className="live-proctor-panel">
              {selected && bearerReady() ? (
                <ProctorLiveView
                  client={getClient()}
                  bearerToken={tenantTokens.get() || ''}
                  sessionId={selected}
                  baseUrl={API_BASE}
                />
              ) : selected && !tenantTokens.get() ? (
                <div className="live-empty-proctor">
                  <p className="error">Session expired — sign in again.</p>
                </div>
              ) : (
                <div className="live-empty-proctor">
                  <div className="live-empty-icon" aria-hidden>
                    ▶
                  </div>
                  <h3>Select a session to proctor</h3>
                  <p>
                    {items.length > 0
                      ? 'Choose an active exam on the left to open the live feed, violation gallery, and controls.'
                      : 'When a candidate starts an exam, it will appear in the list on the left.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </TenantAdminShell>
    </AuthGuard>
  );
}

function bearerReady() {
  return Boolean(tenantTokens.get());
}
