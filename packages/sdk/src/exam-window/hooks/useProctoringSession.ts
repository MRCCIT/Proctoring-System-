'use client';

import { useCallback, useState } from 'react';
import { ProctorShieldClient } from '../../core/ProctorShieldClient';

export function useProctoringSession(apiKey: string, baseUrl: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = new ProctorShieldClient({ baseUrl, apiKey });

  const init = useCallback(
    async (body: Record<string, unknown> = {}) => {
      setError(null);
      try {
        const { data } = await client.initProctoringSession(body);
        setSessionId(data.session_id);
        return data;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [apiKey, baseUrl]
  );

  return { sessionId, error, client, init };
}
