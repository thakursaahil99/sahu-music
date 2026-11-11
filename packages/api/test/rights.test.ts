import { describe, expect, it } from 'vitest';
import type { Track } from '@sahu/models';
import { AudiusProvider, commercialUseFromLicense, evaluateRights, filterPlayable, isPlayable } from '../src';

const audius = new AudiusProvider({ appName: 'TEST' });
const raw = (over: Record<string, unknown> = {}) => ({
  id: 'AbC123',
  title: 'Test song',
  duration: 200,
  is_streamable: true,
  is_stream_gated: false,
  user: { id: 'u1', name: 'Tester' },
  ...over,
});

describe('rights verification', () => {
  it('approves only when the provider confirms streaming and nothing restricts it', () => {
    expect(evaluateRights({ providerSaysStreamable: true, restricted: false, license: null, basis: 'x' }).status).toBe('approved');
    expect(evaluateRights({ providerSaysStreamable: false, restricted: false, license: null, basis: 'x' }).status).toBe('rejected');
    expect(evaluateRights({ providerSaysStreamable: true, restricted: true, license: null, basis: 'x' }).streamingPermitted).toBe(false);
  });

  it('never grants advertising permission implicitly', () => {
    expect(evaluateRights({ providerSaysStreamable: true, restricted: false, license: 'CC0', basis: 'x' }).advertising).toBe('unconfirmed');
  });

  it('derives commercial use from the licence; unknown stays unconfirmed', () => {
    expect(commercialUseFromLicense(null)).toBe('unconfirmed');
    expect(commercialUseFromLicense('Some custom licence')).toBe('unconfirmed');
    expect(commercialUseFromLicense('Attribution CC BY')).toBe('allowed');
    expect(commercialUseFromLicense('https://creativecommons.org/licenses/by-sa/3.0/')).toBe('allowed');
    expect(commercialUseFromLicense('Attribution-NonCommercial CC BY-NC')).toBe('not_allowed');
    expect(commercialUseFromLicense('https://creativecommons.org/licenses/by-nc-nd/3.0/')).toBe('not_allowed');
    expect(commercialUseFromLicense('All rights reserved')).toBe('not_allowed');
  });
});

describe('Audius mapping', () => {
  it('maps a streamable track with a real stream URL', () => {
    const t = audius.mapTrack(raw())!;
    expect(t.streamUrl).toBe('https://api.audius.co/v1/tracks/AbC123/stream?app_name=TEST');
    expect(isPlayable(t)).toBe(true);
  });

  it.each([
    ['stream-gated', { is_stream_gated: true }],
    ['not streamable', { is_streamable: false }],
    ['deleted', { is_delete: true }],
    ['unlisted', { is_unlisted: true }],
    ['unavailable', { is_available: false }],
    ['has stream conditions', { stream_conditions: { usdc_purchase: {} } }],
  ])('refuses a %s track and gives it no stream URL', (_name, over) => {
    const t = audius.mapTrack(raw(over))!;
    expect(t.streamUrl).toBe('');
    expect(isPlayable(t)).toBe(false);
  });

  it('drops malformed provider data', () => {
    expect(audius.mapTrack(raw({ id: '../../etc' }))).toBeNull();
    expect(audius.mapTrack(raw({ title: undefined }))).toBeNull();
    expect(audius.mapTrack(null)).toBeNull();
  });
});

describe('playability gate', () => {
  const ok = audius.mapTrack(raw())!;
  it('honours the admin blocklist', () => {
    expect(isPlayable(ok, new Set(['audius:AbC123']))).toBe(false);
  });
  it('rejects tampered tracks (stream URL but no permission)', () => {
    const forged: Track = { ...ok, rights: { ...ok.rights, streamingPermitted: false } };
    expect(isPlayable(forged)).toBe(false);
    expect(isPlayable({ ...ok, rights: { ...ok.rights, status: 'pending' } })).toBe(false);
  });
  it('treats a preview-only track as unavailable unless previews are explicitly allowed', () => {
    const clip: Track = { ...ok, preview: true, duration: 30 };
    expect(isPlayable(clip)).toBe(false);
    expect(filterPlayable([ok, clip])).toHaveLength(1);
    expect(isPlayable(clip, undefined, { allowPreviews: true })).toBe(true);
  });
  it('uses the Audius full-track stream endpoint and the real duration', () => {
    expect(ok.streamUrl).toMatch(/\/v1\/tracks\/AbC123\/stream\?/);
    expect(ok.streamUrl).not.toMatch(/preview/i);
    expect(ok.duration).toBe(200);
    expect(ok.preview).toBeUndefined();
  });
  it('filters and de-duplicates lists', () => {
    const gated = audius.mapTrack(raw({ id: 'Zz9', is_stream_gated: true }))!;
    expect(filterPlayable([ok, ok, gated]).map((t) => t.providerTrackId)).toEqual(['AbC123']);
  });
});
