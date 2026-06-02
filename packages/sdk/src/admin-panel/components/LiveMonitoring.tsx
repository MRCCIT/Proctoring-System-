'use client';

import { useEffect, useState } from 'react';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';

export function LiveMonitoring(props: { client: ProctorShieldClient }) {
  const [items, setItems] = useState<unknown[]>([]);
  useEffect(() => {
    void props.client.request<{ data: unknown[] }>('GET', '/v1/sessions/live').then((r) => setItems(r.data || []));
  }, [props.client]);
  return (
    <div>
      <h2>Live sessions</h2>
      <pre style={{ fontSize: 12, overflow: 'auto' }}>{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}
