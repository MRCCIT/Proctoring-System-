'use client';

import Link from 'next/link';
import { Card } from '@proctorshield/ui-components';
import type { UsageAnalytics } from '@/lib/analyticsTypes';
import { formatBytes, formatCount } from '@/lib/format';
import { StatCard } from './StatCard';
import { SessionsBarChart } from './SessionsBarChart';
import { MeterBar } from './MeterBar';

const QUICK_LINKS = [
  { href: '/live', label: 'Live proctoring', desc: 'Watch active exams', icon: '▶' },
  { href: '/sessions', label: 'All sessions', desc: 'Review recordings & timeline', icon: '📋' },
  { href: '/candidates', label: 'Candidates', desc: 'Enrolled reference photos', icon: '👤' },
  { href: '/analytics', label: 'Deep analytics', desc: 'Violation trends & events', icon: '📊' },
];

export function UsageDashboard({ data }: { data: UsageAnalytics }) {
  const t = data.totals;
  const storage = parseInt(t.storage_bytes, 10) || 0;
  const egress = parseInt(t.bytes_egress, 10) || 0;
  const violations = parseInt(t.violation_flags, 10) || 0;
  const storageCap = 2 * 1024 ** 3;
  const egressCap = 5 * 1024 ** 3;

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">Organization dashboard</h1>
          <p className="dash-subtitle">Proctoring overview · last 30 days</p>
        </div>
        <div className="dash-header-actions">
          <Link href="/live" className="dash-btn dash-btn-primary">
            Open live view
          </Link>
          <Link href="/reports" className="dash-btn">
            Reports
          </Link>
        </div>
      </header>

      <div className="dash-stats">
        <StatCard label="Exams" value={formatCount(t.exams)} icon="📝" hint="Configured assessments" />
        <StatCard label="Candidates" value={formatCount(t.candidates)} icon="👥" hint="Enrolled test-takers" />
        <StatCard
          label="Total sessions"
          value={formatCount(t.total_sessions)}
          icon="🎓"
          accent="info"
          hint="All time for this tenant"
        />
        <StatCard
          label="Active now"
          value={formatCount(t.active_sessions)}
          icon="●"
          accent={t.active_sessions > 0 ? 'success' : 'default'}
          hint={t.active_sessions > 0 ? 'Exams in progress' : 'No live exams'}
        />
        <StatCard
          label="Violations"
          value={formatCount(violations)}
          icon="⚠"
          accent={violations > 10 ? 'danger' : violations > 0 ? 'warning' : 'default'}
          hint="AI + proctoring flags"
        />
        <StatCard label="Storage" value={formatBytes(storage)} icon="💾" hint="Recordings & snapshots" />
      </div>

      <div className="dash-grid-2">
        <Card title="Sessions over time">
          <SessionsBarChart data={data.sessions_per_day} />
        </Card>
        <Card title="Infrastructure">
          <MeterBar
            label="Storage used"
            value={formatBytes(storage)}
            percent={(storage / storageCap) * 100}
            color="#6366f1"
          />
          <MeterBar
            label="Bandwidth egress"
            value={formatBytes(egress)}
            percent={(egress / egressCap) * 100}
            color="#0ea5e9"
          />
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
            Meters are illustrative against a 2&nbsp;GB storage / 5&nbsp;GB egress demo cap.
          </p>
        </Card>
      </div>

      <Card title="Quick actions">
        <div className="dash-quick">
          {QUICK_LINKS.map((q) => (
            <Link key={q.href} href={q.href} className="dash-quick-card">
              <span className="dash-quick-icon" aria-hidden>
                {q.icon}
              </span>
              <span className="dash-quick-label">{q.label}</span>
              <span className="dash-quick-desc">{q.desc}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dash">
      <div className="dash-skel-title" />
      <div className="dash-stats">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="dash-skel-card" />
        ))}
      </div>
    </div>
  );
}
