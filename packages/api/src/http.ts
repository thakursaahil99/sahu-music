/** Tiny HTTP layer: timeout, retry with backoff, response cache, client-side rate limiting, error reporting. */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly endpoint: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiErrorReport {
  provider: string;
  endpoint: string;
  status: number;
  message: string;
}

let reporter: ((e: ApiErrorReport) => void) | null = null;
/** Apps register a reporter (e.g. POST to the backend error log) for admin monitoring. */
export function setErrorReporter(fn: ((e: ApiErrorReport) => void) | null): void {
  reporter = fn;
}

/**
 * Sliding-window limiter. It exists to respect the *provider's* limits
 * (be a polite API client) – it is not an artificial limit on listeners.
 */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Wait for a slot. Resolves `false` (without taking a slot) when the wait would
   * exceed `maxWaitMs`, so a slow provider cannot stall the whole page.
   */
  async acquire(maxWaitMs = Number.POSITIVE_INFINITY): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
      if (this.stamps.length < this.maxRequests) {
        this.stamps.push(now);
        return true;
      }
      const wait = this.windowMs - (now - this.stamps[0]) + 5;
      if (now + wait > deadline) return false;
      await sleep(wait);
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CacheEntry {
  at: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_CACHE = 250;

export function clearApiCache(): void {
  cache.clear();
}

export interface FetchOpts {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
  limiter?: RateLimiter;
  /** Give up (instead of queueing) when the limiter has no slot within this time. */
  limiterMaxWaitMs?: number;
}

export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const { provider, timeoutMs = 12_000, retries = 2, cacheTtlMs = 120_000, limiter, limiterMaxWaitMs } = opts;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < cacheTtlMs) return hit.data as T;

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const endpoint = safeEndpoint(url);

  const run = (async (): Promise<T> => {
    let lastErr: ApiError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (limiter && !(await limiter.acquire(limiterMaxWaitMs))) {
        // Our own politeness limit, not a provider failure → not reported to monitoring.
        throw new ApiError(`${provider} is busy right now. Please try again in a moment.`, provider, endpoint, 429);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = (await res.json()) as T;
          if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
          cache.set(url, { at: Date.now(), data });
          return data;
        }
        lastErr = new ApiError(`${provider} responded ${res.status}`, provider, endpoint, res.status);
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable) break;
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 400 * 2 ** attempt);
      } catch (e) {
        const aborted = (e as Error)?.name === 'AbortError';
        lastErr = new ApiError(
          aborted ? `${provider} request timed out` : `Network error contacting ${provider}`,
          provider,
          endpoint,
          0,
        );
        if (attempt < retries) await sleep(400 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    const err = lastErr ?? new ApiError(`Unknown error contacting ${provider}`, provider, endpoint, 0);
    try {
      reporter?.({ provider, endpoint, status: err.status, message: err.message });
    } catch {
      /* reporting must never break playback */
    }
    throw err;
  })();

  inflight.set(url, run);
  try {
    return await run;
  } finally {
    inflight.delete(url);
  }
}

/** Path only – never log query strings (they can contain client ids). */
function safeEndpoint(url: string): string {
  try {
    return new URL(url).pathname.slice(0, 200);
  } catch {
    return 'invalid-url';
  }
}
