'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge, EmptyState, StatusBadge } from '@proctorshield/ui-components';
import type { SessionRow } from '@/lib/tenantApi';
import { fetchSnapshotBlobUrl } from '@/lib/sessionMedia';
import { formatDateTime, relativeTime } from '@/lib/format';

type SeverityBucket = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';

function bucketFor(row: SessionRow): SeverityBucket {
  const hs = String(row.highest_severity || '').toUpperCase();
  if (hs === 'CRITICAL' || row.high_severity_count >= 3) return 'CRITICAL';
  if (hs === 'HIGH' || hs === 'FLAG' || row.high_severity_count > 0) return 'HIGH';
  if (hs === 'MEDIUM' || hs === 'WARN' || (row.violation_count || 0) > 0) return 'MEDIUM';
  if (hs === 'LOW') return 'LOW';
  if ((row.violation_count || 0) > 0) return 'LOW';
  return 'CLEAN';
}

function statusDot(row: SessionRow) {
  if (['active', 'paused'].includes(row.status) && row.connection_state !== 'disconnected') return '#16a34a';
  if (['active', 'paused'].includes(row.status)) return '#d97706';
  if (row.status === 'terminated' || row.status === 'failed') return '#dc2626';
  return '#94a3b8';
}

function Thumbnail({
  snapshotId,
  compact,
  active,
}: {
  snapshotId?: string | null;
  compact?: boolean;
  active: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !snapshotId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchSnapshotBlobUrl(snapshotId).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshotId, active]);

  const h = compact ? 48 : 96;
  if (!snapshotId) {
    return (
      <div
        aria-hidden
        style={{
          height: h,
          borderRadius: 6,
          background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
        }}
      />
    );
  }
  if (!url) {
    return (
      <div
        aria-hidden
        style={{
          height: h,
          borderRadius: 6,
          background: 'var(--ps-surface-2, #f1f5f9)',
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ width: '100%', height: h, objectFit: 'cover', borderRadius: 6, background: '#0f172a' }}
    />
  );
}

function CandidateCard({
  row,
  href,
  compact,
  fetchThumb,
}: {
  row: SessionRow;
  href: string;
  compact?: boolean;
  fetchThumb: boolean;
}) {
  const router = useRouter();
  const bucket = bucketFor(row);
  return (
    <button
      type="button"
      className={compact ? 'ps-wall-tile' : 'ps-candidate-card'}
      onClick={() => router.push(href)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 8,
        textAlign: 'left',
        border: '1px solid var(--ps-border, #e2e8f0)',
        borderRadius: compact ? 6 : 10,
        padding: compact ? 8 : 12,
        background: '#fff',
        cursor: 'pointer',
        minHeight: compact ? 72 : 120,
        width: '100%',
      }}
    >
      <Thumbnail snapshotId={row.latest_snapshot_id} compact={compact} active={fetchThumb} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          title={row.connection_state || row.status}
          style={{ width: 8, height: 8, borderRadius: 999, background: statusDot(row), flexShrink: 0 }}
        />
        <strong style={{ fontSize: compact ? 12 : 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.candidate_name}
        </strong>
      </div>
      {!compact && (
        <div className="ps-muted" style={{ fontSize: 12 }}>
          {row.candidate_email || row.external_ref || row.id.slice(0, 8)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        {!compact && <StatusBadge status={row.status} />}
        {bucket !== 'CLEAN' ? (
          <Badge tone={bucket === 'CRITICAL' || bucket === 'HIGH' ? 'danger' : 'warning'}>{bucket}</Badge>
        ) : (
          <Badge tone="success">Clean</Badge>
        )}
        {(row.violation_count || 0) > 0 && <Badge>{row.violation_count} viol.</Badge>}
        {row.risk_score != null && Number(row.risk_score) > 0 && (
          <Badge tone="brand">Risk {Math.round(Number(row.risk_score))}</Badge>
        )}
      </div>
    </button>
  );
}

function useColumnCount(minWidth: number, gap: number) {
  const [cols, setCols] = useState(1);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 1;
      setCols(Math.max(1, Math.floor((w + gap) / (minWidth + gap))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minWidth, gap]);
  return { ref, cols };
}

function VirtualGrid({
  rows,
  hrefFor,
  compact,
  minWidth,
  estimateSize,
  emptyTitle,
  emptyDescription,
  emptyIcon,
}: {
  rows: SessionRow[];
  hrefFor: (id: string) => string;
  compact?: boolean;
  minWidth: number;
  estimateSize: number;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: 'sessions' | 'live' | 'flag';
}) {
  const { ref, cols } = useColumnCount(minWidth, compact ? 8 : 12);
  const rowCount = Math.ceil(rows.length / cols) || 0;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 4,
  });

  if (!rows.length) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;

  return (
    <div ref={ref}>
      <div
        ref={parentRef}
        style={{ height: Math.min(720, Math.max(280, estimateSize * Math.min(rowCount, 6))), overflow: 'auto' }}
        role="list"
      >
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const start = vRow.index * cols;
            const slice = rows.slice(start, start + cols);
            return (
              <div
                key={vRow.key}
                role="presentation"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: compact ? 8 : 12,
                  paddingBottom: compact ? 8 : 12,
                }}
              >
                {slice.map((r) => (
                  <div key={r.id} role="listitem">
                    <CandidateCard row={r} href={hrefFor(r.id)} compact={compact} fetchThumb />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CandidateGridView({
  rows,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: {
  rows: SessionRow[];
  hrefFor: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <VirtualGrid
      rows={rows}
      hrefFor={hrefFor}
      minWidth={220}
      estimateSize={210}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyIcon="sessions"
    />
  );
}

export function CandidateWallView({
  rows,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: {
  rows: SessionRow[];
  hrefFor: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <VirtualGrid
      rows={rows}
      hrefFor={hrefFor}
      compact
      minWidth={140}
      estimateSize={130}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyIcon="live"
    />
  );
}

export function CandidateBoardView({
  rows,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: {
  rows: SessionRow[];
  hrefFor: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!rows.length) return <EmptyState icon="flag" title={emptyTitle} description={emptyDescription} />;
  const columns: SeverityBucket[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'CLEAN'];
  const grouped = Object.fromEntries(columns.map((c) => [c, [] as SessionRow[]])) as Record<
    SeverityBucket,
    SessionRow[]
  >;
  for (const r of rows) grouped[bucketFor(r)].push(r);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(160px, 1fr))', gap: 10, overflowX: 'auto' }}>
      {columns.map((col) => (
        <BoardColumn key={col} label={col} rows={grouped[col]} hrefFor={hrefFor} />
      ))}
    </div>
  );
}

function BoardColumn({
  label,
  rows,
  hrefFor,
}: {
  label: string;
  rows: SessionRow[];
  hrefFor: (id: string) => string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 6,
  });
  return (
    <div style={{ background: 'var(--ps-surface-2, #f8fafc)', borderRadius: 10, padding: 10, minHeight: 200 }}>
      <div className="ps-between" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <Badge>{rows.length}</Badge>
      </div>
      <div ref={parentRef} style={{ height: 420, overflow: 'auto', position: 'relative' }}>
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const r = rows[item.index];
            return (
              <div
                key={item.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                  paddingBottom: 8,
                }}
              >
                <CandidateCard row={r} href={hrefFor(r.id)} compact fetchThumb />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Review-mode timeline: candidates ordered by last activity / started_at with violation density. */
export function CandidateTimelineView({
  rows,
  hrefFor,
  emptyTitle,
  emptyDescription,
}: {
  rows: SessionRow[];
  hrefFor: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = a.last_heartbeat_at || a.ended_at || a.started_at || a.created_at;
        const tb = b.last_heartbeat_at || b.ended_at || b.started_at || b.created_at;
        return String(tb).localeCompare(String(ta));
      }),
    [rows]
  );
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  if (!sorted.length) return <EmptyState icon="sessions" title={emptyTitle} description={emptyDescription} />;

  return (
    <div ref={parentRef} style={{ height: Math.min(640, 72 * Math.min(sorted.length, 8)), overflow: 'auto' }} role="list">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const r = sorted[item.index];
          const bucket = bucketFor(r);
          const when = r.last_heartbeat_at || r.ended_at || r.started_at || r.created_at;
          return (
            <button
              key={item.key}
              type="button"
              role="listitem"
              onClick={() => router.push(hrefFor(r.id))}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
                display: 'grid',
                gridTemplateColumns: '140px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 12px',
                border: 'none',
                borderBottom: '1px solid var(--ps-border, #e2e8f0)',
                background: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDateTime(when)}</div>
                <div className="ps-muted" style={{ fontSize: 11 }}>
                  {relativeTime(when)}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{r.candidate_name}</div>
                <div className="ps-muted" style={{ fontSize: 12 }}>
                  {r.violation_count || 0} violations · risk {Math.round(Number(r.risk_score || 0))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <StatusBadge status={r.status} />
                {bucket !== 'CLEAN' && (
                  <Badge tone={bucket === 'CRITICAL' || bucket === 'HIGH' ? 'danger' : 'warning'}>{bucket}</Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
