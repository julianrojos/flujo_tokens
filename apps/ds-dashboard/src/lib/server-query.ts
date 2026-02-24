import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type QueryKey = readonly unknown[];

type CacheEntry<T> = {
  key: QueryKey;
  data?: T;
  error?: unknown;
  updatedAt: number;
  promise?: Promise<T>;
  observers: number;
  gcTimer?: ReturnType<typeof setTimeout>;
};

const queryCache = new Map<string, CacheEntry<unknown>>();

function keyToString(key: QueryKey): string {
  return JSON.stringify(key);
}

function getEntryById<T>(id: string, key: QueryKey): CacheEntry<T> {
  const cached = queryCache.get(id) as CacheEntry<T> | undefined;
  if (cached) return cached;
  const created: CacheEntry<T> = {
    key,
    updatedAt: 0,
    observers: 0,
  };
  queryCache.set(id, created as CacheEntry<unknown>);
  return created;
}

function invalidateById(id: string): void {
  const entry = queryCache.get(id);
  if (entry?.gcTimer) {
    clearTimeout(entry.gcTimer);
  }
  queryCache.delete(id);
}

export function invalidateServerQuery(key: QueryKey): void {
  invalidateById(keyToString(key));
}

function executeWithRetry<T>(
  fn: () => Promise<T>,
  retry: number,
  retryDelayMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = (attempt: number) => {
      fn()
        .then(resolve)
        .catch((cause) => {
          if (attempt >= retry) {
            reject(cause);
            return;
          }
          const delay = Math.max(0, retryDelayMs);
          if (delay === 0) {
            run(attempt + 1);
            return;
          }
          setTimeout(() => run(attempt + 1), delay);
        });
    };
    run(0);
  });
}

export function useServerQuery<T>(args: {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTimeMs?: number;
  gcTimeMs?: number;
  refetchOnWindowFocus?: boolean;
  retry?: number;
  retryDelayMs?: number;
}) {
  const { queryKey, queryFn } = args;
  const enabled = args.enabled !== false;
  const staleTimeMs = Number.isFinite(args.staleTimeMs) ? Number(args.staleTimeMs) : 30_000;
  const gcTimeMs = Number.isFinite(args.gcTimeMs) ? Number(args.gcTimeMs) : 5 * 60_000;
  const refetchOnWindowFocus = args.refetchOnWindowFocus === true;
  const retry = Number.isFinite(args.retry) ? Math.max(0, Number(args.retry)) : 0;
  const retryDelayMs = Number.isFinite(args.retryDelayMs) ? Number(args.retryDelayMs) : 0;
  const keyId = useMemo(() => keyToString(queryKey), [queryKey]);
  const queryKeyRef = useRef(queryKey);
  const queryFnRef = useRef(queryFn);
  const mountedRef = useRef(true);
  const [data, setData] = useState<T | undefined>(() => getEntryById<T>(keyId, queryKey).data);
  const [error, setError] = useState<unknown>(() => getEntryById<T>(keyId, queryKey).error);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoading, setIsLoading] = useState(
    enabled && getEntryById<T>(keyId, queryKey).data === undefined,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    queryKeyRef.current = queryKey;
  }, [keyId, queryKey]);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  useEffect(() => {
    const entry = getEntryById<T>(keyId, queryKeyRef.current);
    entry.observers += 1;
    if (entry.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = undefined;
    }
    return () => {
      const current = queryCache.get(keyId) as CacheEntry<T> | undefined;
      if (!current) return;
      current.observers = Math.max(0, current.observers - 1);
      if (current.observers > 0) return;
      if (gcTimeMs <= 0) {
        invalidateById(keyId);
        return;
      }
      current.gcTimer = setTimeout(() => {
        const latest = queryCache.get(keyId);
        if (!latest || latest.observers > 0) return;
        invalidateById(keyId);
      }, gcTimeMs);
    };
  }, [gcTimeMs, keyId]);

  const run = useCallback(
    async (force = false) => {
      if (!enabled) return undefined;
      const entry = getEntryById<T>(keyId, queryKeyRef.current);
      const hasFreshData =
        !force &&
        entry.data !== undefined &&
        Date.now() - entry.updatedAt < staleTimeMs;
      if (hasFreshData) {
        if (mountedRef.current) {
          setData(entry.data);
          setError(undefined);
          setIsLoading(false);
          setIsFetching(false);
        }
        return entry.data;
      }

      if (!entry.promise || force) {
        entry.promise = executeWithRetry(
          () => queryFnRef.current(),
          retry,
          retryDelayMs,
        )
          .then((nextData) => {
            entry.data = nextData;
            entry.error = undefined;
            entry.updatedAt = Date.now();
            return nextData;
          })
          .catch((cause) => {
            entry.error = cause;
            entry.updatedAt = Date.now();
            throw cause;
          })
          .finally(() => {
            entry.promise = undefined;
          });
      }

      if (mountedRef.current) {
        setIsFetching(true);
      }

      try {
        const nextData = await entry.promise;
        if (mountedRef.current) {
          setData(nextData);
          setError(undefined);
          setIsLoading(false);
        }
        return nextData;
      } catch (cause) {
        if (mountedRef.current) {
          setError(cause);
          setIsLoading(false);
        }
        return undefined;
      } finally {
        if (mountedRef.current) {
          setIsFetching(false);
        }
      }
    },
    [enabled, keyId, retry, retryDelayMs, staleTimeMs],
  );

  useEffect(() => {
    const entry = getEntryById<T>(keyId, queryKeyRef.current);
    setData(entry.data);
    setError(entry.error);
    setIsLoading(enabled && entry.data === undefined);
    setIsFetching(false);
    if (!enabled) return;
    void run(false);
  }, [enabled, keyId, run]);

  useEffect(() => {
    if (!enabled || !refetchOnWindowFocus || typeof window === "undefined") return;
    const onFocus = () => {
      void run(false);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, refetchOnWindowFocus, run]);

  const refetch = useCallback(async () => {
    return await run(true);
  }, [run]);

  return {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  };
}
