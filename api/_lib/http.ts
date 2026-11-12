import { HttpError } from './db';

const MAX_BODY = 64 * 1024;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function fail(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error('[api]', e);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

/** Reads a JSON object body (max 64 KB). Only application/json is accepted, which also blocks form-based CSRF. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) throw new HttpError(415, 'Send JSON.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large.');
  if (!text) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Expected a JSON object.');
  return data as Record<string, unknown>;
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || h.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 64);
}

export function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * Cookie-authenticated writes must come from this site. Browsers always send Origin on
 * cross-site POST/PATCH/DELETE; the mobile app sends a Bearer token instead of a cookie.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request refused.');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      /* "null" or malformed */
    }
    if (originHost !== host) throw new HttpError(403, 'Cross-site request refused.');
  }
}

// ── small validators ──────────────────────────────────────────────
export function str(v: unknown, field: string, { min = 0, max = 500, required = true } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${field} is required.`);
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${field} must be ${min}–${max} characters.`);
  return s;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v: unknown, field = 'id'): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `${field} is not valid.`);
  return v.toLowerCase();
}

export const PROVIDER = /^[a-z0-9_-]{2,32}$/;

export interface TrackRef {
  provider: string;
  providerTrackId: string;
  json: string;
  track: Record<string, unknown>;
}

/** A track snapshot as the apps send it: provider reference + display metadata. Never audio. */
export function trackRef(v: unknown): TrackRef {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'track is required.');
  const t = v as Record<string, unknown>;
  const provider = typeof t.provider === 'string' ? t.provider : '';
  const id = typeof t.providerTrackId === 'string' ? t.providerTrackId : typeof t.providerTrackId === 'number' ? String(t.providerTrackId) : '';
  if (!PROVIDER.test(provider) || provider === 'demo') throw new HttpError(400, 'This track cannot be saved.');
  if (!id || id.length > 200) throw new HttpError(400, 'track.providerTrackId is not valid.');
  if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 500) throw new HttpError(400, 'track.title is not valid.');
  const text = JSON.stringify(t);
  if (text.length > 16_000) throw new HttpError(413, 'Track data too large.');
  return { provider, providerTrackId: id, json: text, track: t };
}

export function refOnly(v: Record<string, unknown>): { provider: string; providerTrackId: string } {
  const provider = typeof v.provider === 'string' ? v.provider : '';
  const id = typeof v.providerTrackId === 'string' ? v.providerTrackId : '';
  if (!PROVIDER.test(provider) || !id || id.length > 200) throw new HttpError(400, 'provider and providerTrackId are required.');
  return { provider, providerTrackId: id };
}
