import type { ReactNode } from 'react';

export function DataTable(props: {
  headers: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
  align?: Array<'left' | 'right' | 'center' | undefined>;
}) {
  return (
    <div className="ps-table-wrap">
      <table className="ps-table">
        <thead>
          <tr>
            {props.headers.map((h, i) => (
              <th key={i} style={props.align?.[i] ? { textAlign: props.align[i] } : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.isEmpty ? (
            <tr>
              <td colSpan={props.headers.length} className="ps-table-empty">
                {props.empty ?? 'Nothing to show yet.'}
              </td>
            </tr>
          ) : (
            props.children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td(props: {
  children?: ReactNode;
  colSpan?: number;
  align?: 'left' | 'right' | 'center';
  muted?: boolean;
  mono?: boolean;
  nowrap?: boolean;
}) {
  const cls = [props.muted && 'ps-muted', props.mono && 'ps-mono', props.nowrap && 'ps-nowrap'].filter(Boolean).join(' ');
  return (
    <td colSpan={props.colSpan} className={cls || undefined} style={props.align ? { textAlign: props.align } : undefined}>
      {props.children}
    </td>
  );
}
