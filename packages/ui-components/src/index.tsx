export { AppShell } from './layout';
export { DataTable, Td } from './table';
export { Card } from './card';

import type { ReactNode } from 'react';

export function Button(props: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid #cbd5e1',
        background: '#0f172a',
        color: '#f8fafc',
        cursor: 'pointer',
      }}
    >
      {props.children}
    </button>
  );
}
