'use client';

const LINKS = [
  { href: '/sessions', label: 'Sessions' },
  { href: '/exams', label: 'Exams' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/live', label: 'Live monitoring' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

export function AdminDashboard() {
  return (
    <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} style={{ color: '#0f172a' }}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
