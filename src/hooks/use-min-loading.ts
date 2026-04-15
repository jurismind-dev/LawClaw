import { useEffect, useRef, useState } from 'react';

export function useMinLoading(isLoading: boolean, minDurationMs: number = 500) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const startTime = useRef<number>(0);

  if (isLoading && !showLoading) {
    setShowLoading(true);
  }

  useEffect(() => {
    if (isLoading && startTime.current === 0) {
      startTime.current = Date.now();
    }
  }, [isLoading]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!isLoading && showLoading) {
      const elapsed = startTime.current > 0 ? Date.now() - startTime.current : 0;
      const remaining = Math.max(0, minDurationMs - elapsed);

      timeout = setTimeout(() => {
        setShowLoading(false);
        startTime.current = 0;
      }, remaining);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isLoading, showLoading, minDurationMs]);

  return isLoading || showLoading;
}
