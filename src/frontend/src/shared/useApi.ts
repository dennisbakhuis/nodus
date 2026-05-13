import { useState, useEffect, useCallback, useRef } from "react";

export type UseApiResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const run = useCallback(() => {
    const id = ++counter.current;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (id === counter.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (id === counter.current) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, refetch: run };
}
