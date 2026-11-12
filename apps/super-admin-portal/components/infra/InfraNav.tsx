'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@proctorshield/ui-components';

const ITEMS = [
  { href: '/infrastructure', label: 'Overview', desc: 'Entire infrastructure health', icon: 'activity', exact: true },
  { href: '/infrastructure/services', label: 'Service Monitoring', desc: 'API, WS, DB, Redis, Media, AI', icon: 'server' },
  { href: '/infrastructure/tenants', label: 'Tenant Analytics', desc: 'Tenant-wise resource consumption', icon: 'chart' },
  { href: '/infrastructure/queues', label: 'Queue & Workers', desc: 'P0–P4 lanes and worker health', icon: 'list' },
  { href: '/infrastructure/hardware', label: 'Hardware Monitoring', desc: 'CPU, RAM, GPU, disk and network', icon: 'server' },
  { href: '/infrastructure/system-controls', label: 'System Controls', desc: 'Global capacity and load policies', icon: 'settings' },
  { href: '/infrastructure/tenant-controls', label: 'Tenant Controls', desc: 'Per-tenant limits and features', icon: 'users' },
  { href: '/infrastructure/alerts', label: 'Alerts & Incidents', desc: 'Thresholds and incident history', icon: 'alert' },
  { href: '/infrastructure/optimization', label: 'Optimization Center', desc: 'Recommendations and capacity planning', icon: 'flag' },
  { href: '/infrastructure/audit', label: 'Audit Logs', desc: 'Every control and policy change', icon: 'clock' },
];

export function InfraNav() {
  const pathname = usePathname() || '';
  return (
    <nav className="ps-infra-nav" aria-label="Infrastructure command center">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={`ps-infra-nav-item${active ? ' active' : ''}`}>
            <span className="ps-infra-nav-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="ps-infra-nav-text">
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </span>
            <Icon name="chevronRight" size={14} />
          </Link>
        );
      })}
    </nav>
  );
}
