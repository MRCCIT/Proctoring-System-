'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  padding: '12px 24px',
  background: '#0f172a',
  color: '#f8fafc',
};
const linkStyle: React.CSSProperties = { color: '#93c5fd', textDecoration: 'none' };

export function AppShell(props: {
  title: string;
  links: { href: string; label: string }[];
  children: ReactNode;
  onLogout?: () => void;
  onLinkClick?: (href: string) => void;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={navStyle}>
        <strong style={{ marginRight: 'auto' }}>{props.title}</strong>
        {props.links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={linkStyle}
            onClick={() => props.onLinkClick?.(l.href)}
          >
            {l.label}
          </Link>
        ))}
        {props.onLogout && (
          <button type="button" onClick={props.onLogout} style={{ marginLeft: 8 }}>
            Logout
          </button>
        )}
      </header>
      <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>{props.children}</main>
    </div>
  );
}
