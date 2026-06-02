import type { ReactNode } from 'react';

export function DataTable(props: { headers: string[]; children: ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
      <thead>
        <tr>
          {props.headers.map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '2px solid #e2e8f0' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{props.children}</tbody>
    </table>
  );
}

export function Td(props: { children: ReactNode; colSpan?: number }) {
  return (
    <td colSpan={props.colSpan} style={{ padding: 10, borderBottom: '1px solid #e2e8f0' }}>
      {props.children}
    </td>
  );
}
