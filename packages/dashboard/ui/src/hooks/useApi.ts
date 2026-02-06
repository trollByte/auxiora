import { useState, useEffect, useCallback } from 'react';

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetcher()
      .then((result) => { setData(result); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
