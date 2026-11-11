'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Run an async loader with loading/error state and stale-response protection. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loaderRef.current().then(
      (d) => {
        if (!alive) return;
        setData(d);
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export interface PagedState<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/** Offset pagination with a "Load more" button. `keyOf` de-duplicates across pages. */
export function usePaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  keyOf: (item: T) => string,
  deps: unknown[],
  pageSize = 20,
): PagedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const offsetRef = useRef(0);
  const runRef = useRef(0);

  useEffect(() => {
    const run = ++runRef.current;
    offsetRef.current = 0;
    setLoading(true);
    setError(null);
    setItems([]);
    fetchRef.current(0, pageSize).then(
      (page) => {
        if (run !== runRef.current) return;
        offsetRef.current = pageSize;
        setItems(page);
        setHasMore(page.length >= Math.ceil(pageSize / 2));
        setLoading(false);
      },
      (e) => {
        if (run !== runRef.current) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, pageSize]);

  const loadMore = useCallback(() => {
    const run = runRef.current;
    setLoadingMore(true);
    fetchRef.current(offsetRef.current, pageSize).then(
      (page) => {
        if (run !== runRef.current) return;
        offsetRef.current += pageSize;
        setItems((prev) => {
          const seen = new Set(prev.map(keyRef.current));
          const fresh = page.filter((x) => !seen.has(keyRef.current(x)));
          if (fresh.length === 0) setHasMore(false);
          return [...prev, ...fresh];
        });
        if (page.length === 0) setHasMore(false);
        setLoadingMore(false);
      },
      () => {
        if (run !== runRef.current) return;
        setLoadingMore(false);
        setHasMore(false);
      },
    );
  }, [pageSize]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, loadingMore, error, hasMore, loadMore, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked – the app keeps working in memory */
  }
}
