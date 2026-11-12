'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  badge?: number | string | null;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function isActive(pathname: string | undefined, href: string) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar application shell. `links` (flat list) is still accepted for older callers.
 */
export function AppShell(props: {
  title: string;
  subtitle?: string;
  links?: { href: string; label: string }[];
  sections?: NavSection[];
  pathname?: string;
  user?: { name?: string | null; email?: string | null; org?: string | null } | null;
  children: ReactNode;
  onLogout?: () => void;
  onLinkClick?: (href: string) => void;
  topbarRight?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sections: NavSection[] = props.sections ?? [{ items: (props.links ?? []).map((l) => ({ ...l })) }];
  const initials = (props.user?.name || props.user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div className={`ps-app${open ? ' ps-nav-open' : ''}`}>
      <aside className="ps-sidebar">
        <div className="ps-brand">
          <span className="ps-brand-mark">
            <Icon name="shield" size={16} />
          </span>
          <span className="ps-brand-text">
            <strong>{props.title}</strong>
            {props.subtitle && <small>{props.subtitle}</small>}
          </span>
        </div>
        <nav className="ps-nav">
          {sections.map((sec, i) => (
            <div className="ps-nav-section" key={sec.title || i}>
              {sec.title && <div className="ps-nav-title">{sec.title}</div>}
              {sec.items.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`ps-nav-link${isActive(props.pathname, l.href) ? ' active' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    props.onLinkClick?.(l.href);
                  }}
                >
                  {l.icon && <Icon name={l.icon} size={16} />}
                  <span>{l.label}</span>
                  {l.badge ? <span className="ps-nav-badge">{l.badge}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {(props.user || props.onLogout) && (
          <div className="ps-sidebar-foot">
            {props.user && (
              <div className="ps-user">
                <span className="ps-avatar">{initials}</span>
                <span className="ps-user-text">
                  <strong>{props.user.name || props.user.email}</strong>
                  <small>{props.user.org || props.user.email}</small>
                </span>
              </div>
            )}
            {props.onLogout && (
              <button type="button" className="ps-icon-btn" onClick={props.onLogout} title="Sign out" aria-label="Sign out">
                <Icon name="logout" size={16} />
              </button>
            )}
          </div>
        )}
      </aside>
      <div className="ps-scrim" onClick={() => setOpen(false)} aria-hidden />
      <div className="ps-main">
        <header className="ps-topbar">
          <button type="button" className="ps-icon-btn ps-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={18} />
          </button>
          <div className="ps-topbar-spacer" />
          {props.topbarRight}
        </header>
        <main className="ps-content">{props.children}</main>
      </div>
    </div>
  );
}

export function PageHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { href?: string; label: string }[];
  meta?: ReactNode;
}) {
  return (
    <div className="ps-page-header">
      <div className="ps-page-header-main">
        {props.breadcrumbs && props.breadcrumbs.length > 0 && (
          <div className="ps-breadcrumbs">
            {props.breadcrumbs.map((b, i) => (
              <span key={i}>
                {b.href ? <Link href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
                {i < props.breadcrumbs!.length - 1 && <Icon name="chevronRight" size={12} />}
              </span>
            ))}
          </div>
        )}
        <h1 className="ps-page-title">{props.title}</h1>
        {props.description && <p className="ps-page-desc">{props.description}</p>}
        {props.meta && <div className="ps-page-meta">{props.meta}</div>}
      </div>
      {props.actions && <div className="ps-page-actions">{props.actions}</div>}
    </div>
  );
}
