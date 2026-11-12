import type { ReactNode } from 'react';

export function Card(props: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`ps-card${props.flush ? ' ps-card-flush' : ''}${props.className ? ` ${props.className}` : ''}`}>
      {(props.title || props.actions) && (
        <div className="ps-card-head">
          <div>
            {props.title && <h2 className="ps-card-title">{props.title}</h2>}
            {props.description && <p className="ps-card-desc">{props.description}</p>}
          </div>
          {props.actions && <div className="ps-card-actions">{props.actions}</div>}
        </div>
      )}
      <div className="ps-card-body">{props.children}</div>
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: ReactNode;
}) {
  return (
    <div className={`ps-stat ps-tone-${props.tone || 'default'}`}>
      <div className="ps-stat-top">
        <span className="ps-stat-label">{props.label}</span>
        {props.icon && <span className="ps-stat-icon">{props.icon}</span>}
      </div>
      <div className="ps-stat-value">{props.value}</div>
      {props.hint && <div className="ps-stat-hint">{props.hint}</div>}
    </div>
  );
}
