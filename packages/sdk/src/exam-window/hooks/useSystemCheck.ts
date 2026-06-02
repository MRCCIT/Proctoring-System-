'use client';

import { useState } from 'react';
import type { ProctorShieldClient } from '../../core/ProctorShieldClient';

export function useSystemCheck(client: ProctorShieldClient, sessionId: string | null) {
  const [result, setResult] = useState<unknown>(null);
  const submit = async (checks: Record<string, unknown>) => {
    if (!sessionId) throw new Error('No session');
    const res = await client.submitSystemCheck(sessionId, { results: checks });
    setResult(res);
    return res;
  };
  return { result, submit };
}
