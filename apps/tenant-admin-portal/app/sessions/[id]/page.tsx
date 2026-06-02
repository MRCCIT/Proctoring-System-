'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@proctorshield/ui-components';
import { AuthGuard } from '@/components/AuthGuard';
import { TenantAdminShell } from '@/components/TenantAdminShell';
import { SessionEvidencePanel } from '@/components/session/SessionEvidencePanel';
import type { RecordingRow, SnapshotRow } from '@/components/session/SessionEvidencePanel';
import { getClient } from '@/lib/api';

interface SessionDetail {
  session: Record<string, unknown> & { id: string; status: string; proctor_notes_json?: Array<Record<string, unknown>> };
  events: Array<{ id: number; event_type: string; severity: string; payload: Record<string, unknown>; occurred_at: string }>;
}

interface FaceCheck {
  occurred_at: string;
  face_count: number;
  violations: string[];
  detector: string;
  source?: string;
  gaze_direction?: string | null;
  match_score?: number | null;
}

interface ChatMsg {
  sender_type: string;
  message: string;
  created_at: string;
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === 'active') return 'session-status session-status-active';
  if (s === 'paused') return 'session-status session-status-paused';
  if (s === 'terminated' || s === 'failed') return 'session-status session-status-terminated';
  return 'session-status session-status-completed';
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [face, setFace] = useState<FaceCheck[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [annot, setAnnot] = useState('');
  const [err, setErr] = useState('');
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  const load = async () => {
    try {
      const c = getClient();
      const [d, f, ch, sn, rec] = await Promise.all([
        c.getSessionDetail(id),
        c.listSessionFaceChecks(id, 300),
        c.listSessionChat(id, 200),
        c.getSessionSnapshots(id),
        c.listSessionRecordings(id),
      ]);
      setDetail(d.data as SessionDetail);
      setFace(f.data as FaceCheck[]);
      setChat(ch.data as ChatMsg[]);
      setSnapshots(sn.data as SnapshotRow[]);
      setRecordings(rec.data as RecordingRow[]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!detail?.session) return;
    const status = String(detail.session.status || '');
    if (status !== 'active' && status !== 'paused') return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [id, detail?.session?.status]);

  const getReportUrl = async () => {
    try {
      const r = await getClient().getSessionReport(id);
      setReportUrl((r.data as { report_url: string }).report_url);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const submitAnnot = async () => {
    if (!annot.trim()) return;
    try {
      await getClient().annotateSession(id, annot.trim());
      setAnnot('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const timeline = [
    ...(detail?.events || []).map((e) => ({
      ts: e.occurred_at,
      kind: 'event',
      label: e.event_type,
      severity: e.severity,
      payload: e.payload,
    })),
    ...face.map((f) => {
      const parts = [`face_count=${f.face_count}`];
      if (f.source === 'server_ai') parts.push('[server AI]');
      if (f.gaze_direction) parts.push(`gaze=${f.gaze_direction}`);
      if (f.match_score != null) parts.push(`match=${f.match_score.toFixed(1)}%`);
      if (f.violations?.length) parts.push(f.violations.join(', '));
      return {
        ts: f.occurred_at,
        kind: 'face',
        label: parts.join(' · '),
        severity: f.face_count === 1 && !(f.violations?.length) ? 'info' : 'warn',
        payload: f as unknown as Record<string, unknown>,
      };
    }),
    ...chat.map((c) => ({
      ts: c.created_at,
      kind: 'chat',
      label: `${c.sender_type}: ${c.message}`,
      severity: 'info',
      payload: c as unknown as Record<string, unknown>,
    })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <AuthGuard>
      <TenantAdminShell>
        {err && <p className="error">{err}</p>}
        {!detail ? (
          <p className="muted">Loading session…</p>
        ) : (
          <>
            <div className="session-detail-header">
              <div>
                <p className="muted" style={{ margin: '0 0 4px' }}>
                  <Link href="/sessions" style={{ color: '#3b82f6' }}>
                    ← Sessions
                  </Link>
                </p>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Session review</h1>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  <code style={{ fontSize: 12 }}>{detail.session.id}</code>
                  {(detail.session.status === 'active' || detail.session.status === 'paused') && (
                    <> · refreshing every 4s</>
                  )}
                </p>
              </div>
              <span className={statusClass(String(detail.session.status))}>{detail.session.status}</span>
              <Link href={`/live?session=${id}`} className="dash-btn dash-btn-primary" style={{ textDecoration: 'none' }}>
                Watch live
              </Link>
            </div>

            <SessionEvidencePanel
              sessionId={id}
              candidateName={
                String(
                  (detail.session as { candidate_name?: string }).candidate_name ||
                    (detail.session as { external_ref?: string }).external_ref ||
                    ''
                ) || undefined
              }
              snapshots={snapshots}
              recordings={recordings}
              onExportReport={() => void getReportUrl()}
              reportUrl={reportUrl}
            />

            <div className="session-grid">
              <Card>
                <h2 style={{ marginTop: 0 }}>Timeline ({timeline.length})</h2>
                <div style={{ maxHeight: 520, overflowY: 'auto', fontSize: 13 }}>
                  {timeline.length === 0 ? (
                    <p className="muted">No events yet.</p>
                  ) : (
                    timeline.map((row, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 180px) 72px 1fr',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <span style={{ color: '#64748b' }}>{new Date(row.ts).toLocaleString()}</span>
                        <span
                          style={{
                            color:
                              row.severity === 'flag'
                                ? '#b91c1c'
                                : row.severity === 'warn'
                                  ? '#d97706'
                                  : '#16a34a',
                            textTransform: 'uppercase',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {row.kind}
                        </span>
                        <span>{row.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <div>
                <Card>
                  <h3 style={{ marginTop: 0 }}>Proctor notes</h3>
                  {(detail.session.proctor_notes_json || []).length === 0 && (
                    <p className="muted" style={{ fontSize: 13 }}>
                      No notes yet.
                    </p>
                  )}
                  {(detail.session.proctor_notes_json || []).map((n, i) => (
                    <div key={i} style={{ fontSize: 13, borderBottom: '1px solid #f1f5f9', padding: '8px 0' }}>
                      <span style={{ color: '#64748b', fontSize: 11 }}>
                        {n.created_at ? new Date(n.created_at as string).toLocaleString() : ''}
                      </span>
                      <div>{n.note as string}</div>
                    </div>
                  ))}
                  <textarea
                    value={annot}
                    onChange={(e) => setAnnot(e.target.value)}
                    rows={3}
                    placeholder="Add a proctor note…"
                    style={{ width: '100%', marginTop: 8, borderRadius: 8, border: '1px solid #e2e8f0', padding: 8 }}
                  />
                  <button type="button" className="primary" onClick={() => void submitAnnot()} style={{ marginTop: 8 }}>
                    Save note
                  </button>
                </Card>
              </div>
            </div>
          </>
        )}
      </TenantAdminShell>
    </AuthGuard>
  );
}
