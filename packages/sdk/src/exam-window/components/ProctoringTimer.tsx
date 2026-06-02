'use client';

import { useEffect, useState } from 'react';

export function ProctoringTimer(props: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - props.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [props.startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <p>Time: {m}:{String(s).padStart(2, '0')}</p>;
}
