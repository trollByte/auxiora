import { useEffect } from 'react';

export function usePolling(callback: () => void, intervalMs = 10_000) {
  useEffect(() => {
    const id = setInterval(callback, intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs]);
}
