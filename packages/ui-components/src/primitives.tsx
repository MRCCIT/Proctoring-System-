'use client';

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  href,
  loading,
  children,
  className,
  ...rest
}: {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: string;
  href?: string;
  loading?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `ps-btn ps-btn-${variant} ps-btn-${size}${className ? ` ${className}` : ''}`;
  const inner = (
    <>
      {loading ? <span className="ps-spinner ps-spinner-sm" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children && <span>{children}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={rest.type ?? 'button'} className={cls} disabled={rest.disabled || loading} {...rest}>
      {inner}
    </button>
  );
}

export type Tone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`ps-badge ps-badge-${tone}`}>
      {dot && <span className="ps-badge-dot" />}
      {children}
    </span>
  );
}

/** Map session/event severity strings to distinct badge tones. */
export function severityTone(severity?: string | null): Tone {
  const s = String(severity || '')
    .trim()
    .toUpperCase();
  if (s === 'CRITICAL') return 'critical';
  if (s === 'HIGH' || s === 'FLAG') return 'high';
  if (s === 'MEDIUM' || s === 'WARN' || s === 'WARNING') return 'medium';
  if (s === 'LOW' || s === 'INFO') return 'low';
  if (s === 'CLEAN') return 'success';
  return 'neutral';
}

export function SeverityBadge({
  severity,
  label,
  children,
}: {
  severity?: string | null;
  label?: string;
  children?: ReactNode;
}) {
  const text = children ?? label ?? (severity ? String(severity).toUpperCase() : '—');
  return <Badge tone={severityTone(severity)}>{text}</Badge>;
}

const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  live: 'success',
  connected: 'success',
  delivered: 'success',
  cleared: 'success',
  reviewed: 'brand',
  paused: 'warning',
  scheduled: 'info',
  pending: 'neutral',
  in_review: 'info',
  inconclusive: 'warning',
  disconnected: 'warning',
  failed: 'danger',
  dead: 'danger',
  terminated: 'danger',
  flagged: 'danger',
  suspended: 'danger',
  completed: 'neutral',
  closed: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Not started',
  in_review: 'In review',
  pending: 'Pending',
};

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  const s = String(status || 'unknown').toLowerCase();
  const text = label || STATUS_LABELS[s] || s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Badge tone={STATUS_TONES[s] || 'neutral'} dot={s === 'active' || s === 'live'}>
      {text}
    </Badge>
  );
}

export function EmptyState({
  icon = 'list',
  title,
  description,
  action,
}: {
  icon?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ps-empty">
      <div className="ps-empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="ps-empty-action">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; count?: number | null }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ps-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={`ps-tab${t.id === value ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="ps-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`ps-field${error ? ' has-error' : ''}`}>
      <span className="ps-field-label">
        {label}
        {required && <span className="ps-req">*</span>}
      </span>
      {children}
      {error ? <span className="ps-field-error">{error}</span> : hint ? <span className="ps-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ps-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ps-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="ps-modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="ps-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="ps-modal-body">{children}</div>
        {footer && <div className="ps-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  onClose,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`ps-alert ps-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'eye' : 'alert'} size={16} />
      <div className="ps-alert-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="ps-icon-btn" onClick={onClose} aria-label="Dismiss">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="ps-loading">
      <span className="ps-spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <span className="ps-skeleton" style={{ height, width }} />;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={copied ? 'check' : 'copy'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ps-toolbar">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="ps-search">
      <Icon name="search" size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function KeyValue({
  items,
  rows,
}: {
  items?: { label: ReactNode; value: ReactNode }[];
  /** @deprecated use `items` */
  rows?: { label: ReactNode; value: ReactNode }[];
}) {
  const list = items ?? rows ?? [];
  return (
    <dl className="ps-kv">
      {list.map((it, i) => (
        <div key={i}>
          <dt>{it.label}</dt>
          <dd>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
