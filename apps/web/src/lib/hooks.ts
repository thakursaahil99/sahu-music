'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILT_FRESH_MS } from './home-rows';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export interface AsyncCache<T> {
  /** Keeps the last answer in this browser: a repeat visit shows it at once and refreshes it behind. */
  key: string;
  /** Answers that must not be kept (e.g. empty lists or demo-mode fallbacks). Default: keep everything. */
  keep?: (data: T) => boolean;
  /**
   * An answer written into the page when the site was built. It is on screen from the very first
   * paint (also in the server HTML); it is refreshed in the background only once it is older
   * than BUILT_FRESH_MS.
   */
  initial?: { at: number; data: T } | null;
  /**
   * Wait this long before refreshing an answer that is already on screen, so the rows of a page
   * refresh one after another instead of all asking the music servers at the same moment.
   */
  refreshDelayMs?: number;
}

const CACHE_PREFIX = 'sahu:rows:v1:';
/** A kept answer newer than this is shown as is, with no request. */
const CACHE_FRESH_MS = 30 * 60_000;
/** A kept answer older than this is not shown at all. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

/** Run an async loader with loading/error state and stale-response protection. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], cache?: AsyncCache<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(() => cache?.initial?.data ?? null);
  const [loading, setLoading] = useState(() => !cache?.initial);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  useEffect(() => {
    let alive = true;
    const store = cacheRef.current;
    const storeKey = store ? CACHE_PREFIX + store.key : '';
    const kept = store ? readLocal<{ at: number; data: T } | null>(storeKey, null) : null;
    const keptOk = !!kept && typeof kept.at === 'number' && kept.data != null && Date.now() - kept.at < CACHE_MAX_AGE_MS;
    const built = store?.initial ?? null;
    // the newer of: this browser's last answer, the answer built into the page
    const seed = keptOk && (!built || kept!.at >= built.at) ? kept! : built;
    const age = seed ? Date.now() - seed.at : Number.POSITIVE_INFINITY;
    const shown = seed ? JSON.stringify(seed.data) : null;
    setError(null);
    if (seed) {
      setData(seed.data);
      setLoading(false);
      if (age < (seed === built ? BUILT_FRESH_MS : CACHE_FRESH_MS) && tick === 0) return;
    } else {
      setLoading(true);
    }
    const run = () =>
      loaderRef.current().then(
        (d) => {
          if (!alive) return;
          // an unchanged answer is not set again, so a row already on screen does not re-render
          if (shown === null || JSON.stringify(d) !== shown) setData(d);
          setLoading(false);
          if (store && (store.keep?.(d) ?? true)) writeLocal(storeKey, { at: Date.now(), data: d });
        },
        (e) => {
          if (!alive) return;
          // with a kept answer on screen, a failed refresh is not worth an error message
          if (shown === null) setError(e instanceof Error ? e.message : 'Something went wrong.');
          setLoading(false);
        },
      );
    const wait = seed && tick === 0 ? (store?.refreshDelayMs ?? 0) : 0;
    const timer = wait > 0 ? setTimeout(run, wait) : (run(), undefined);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/** Given to the first-page fetch so it can show early results and stop work nobody is waiting for. */
export interface LiveFetch<T> {
  /** Aborted when the inputs change or the page is left. */
  signal: AbortSignal;
  /** Show these items now; the fetch's final answer replaces them. */
  onPartial: (items: T[]) => void;
}

export interface PagedState<T> {
  items: T[];
  loading: boolean;
  /** Early results are on screen and the complete answer is still on its way. */
  refining: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/** Offset pagination with a "Load more" button. `keyOf` de-duplicates across pages. */
export function usePaged<T>(
  fetchPage: (offset: number, limit: number, live?: LiveFetch<T>) => Promise<T[]>,
  keyOf: (item: T) => string,
  deps: unknown[],
  pageSize = 20,
  /**
   * The first page written into the page when the site was built (for the first `deps` only).
   * Shown from the first paint; refreshed in the background once older than BUILT_FRESH_MS.
   */
  initial?: { at: number; items: T[] } | null,
): PagedState<T> {
  const built = initial?.items.length ? initial : null;
  const [items, setItems] = useState<T[]>(() => built?.items ?? []);
  const [loading, setLoading] = useState(!built);
  const [refining, setRefining] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(() => !!built && built.items.length >= Math.ceil(pageSize / 2));
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const offsetRef = useRef(built?.items.length ?? 0);
  const runRef = useRef(0);
  const builtRef = useRef(built);
  const builtDeps = useRef(JSON.stringify(deps));

  useEffect(() => {
    const run = ++runRef.current;
    const seed = builtRef.current;
    if (seed && tick === 0 && JSON.stringify(deps) === builtDeps.current) {
      // the built page is on screen already
      offsetRef.current = seed.items.length;
      setItems(seed.items);
      setLoading(false);
      setHasMore(seed.items.length >= Math.ceil(pageSize / 2));
      if (Date.now() - seed.at < BUILT_FRESH_MS) return;
      // old: refresh the first page quietly, keeping the built one on screen meanwhile
      fetchRef.current(0, pageSize).then(
        (page) => {
          if (run !== runRef.current || page.length === 0) return;
          offsetRef.current = pageSize;
          setItems(page);
          setHasMore(page.length >= Math.ceil(pageSize / 2));
        },
        () => undefined,
      );
      return;
    }
    offsetRef.current = 0;
    setLoading(true);
    setError(null);
    setItems([]);
    setRefining(false);
    setHasMore(false);
    const ctrl = new AbortController();
    const live: LiveFetch<T> = {
      signal: ctrl.signal,
      onPartial: (partial) => {
        if (run !== runRef.current || partial.length === 0) return;
        setItems(partial);
        setLoading(false);
        setRefining(true);
      },
    };
    fetchRef.current(0, pageSize, live).then(
      (page) => {
        if (run !== runRef.current) return;
        offsetRef.current = pageSize;
        setItems(page);
        setHasMore(page.length >= Math.ceil(pageSize / 2));
        setLoading(false);
        setRefining(false);
      },
      (e) => {
        if (run !== runRef.current) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setLoading(false);
        setRefining(false);
      },
    );
    return () => ctrl.abort();
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
  return { items, loading, refining, loadingMore, error, hasMore, loadMore, reload };
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
