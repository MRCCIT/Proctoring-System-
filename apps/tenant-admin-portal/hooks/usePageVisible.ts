'use client';

import { useEffect, useState } from 'react';

/** True when the browser tab is visible — pause background polls when hidden. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, []);

  return visible;
}
