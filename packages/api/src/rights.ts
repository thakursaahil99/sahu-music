import type { Permission, Track, TrackRights } from '@sahu/models';
import { trackKey } from '@sahu/models';

/**
 * TRACK RIGHTS VERIFICATION
 *
 * A track is playable only when ALL of these hold:
 *   1. the provider explicitly confirmed it may be streamed (streamingPermitted)
 *   2. its rights status is `approved`
 *   3. it has a stream URL
 *   4. an admin has not blocked/rejected it (blocklist from `music_rights`)
 *
 * "unconfirmed" is never treated as permission.
 */

/** Derive commercial-use permission from a licence string. Unknown → unconfirmed. */
export function commercialUseFromLicense(license: string | null | undefined): Permission {
  if (!license) return 'unconfirmed';
  const l = license.toLowerCase();
  if (l.includes('all rights reserved')) return 'not_allowed';
  if (/(^|[^a-z])nc([^a-z]|$)/.test(l) || l.includes('noncommercial') || l.includes('non-commercial')) {
    return 'not_allowed';
  }
  if (
    l.includes('cc0') ||
    l.includes('public domain') ||
    l.includes('publicdomain') ||
    l.includes('attribution') ||
    /(^|[^a-z])cc[ -]?by/.test(l) ||
    /licenses\/by(-sa|-nd)?\//.test(l)
  ) {
    return 'allowed';
  }
  return 'unconfirmed';
}

export interface RightsInput {
  /** Provider's explicit "this can be streamed" signal. */
  providerSaysStreamable: boolean;
  /** Paywalled / token-gated / unlisted / deleted etc. */
  restricted: boolean;
  license: string | null | undefined;
  basis: string;
  /** Advertising permission is only ever granted explicitly. */
  advertising?: Permission;
}

export function evaluateRights(input: RightsInput): TrackRights {
  const streamingPermitted = input.providerSaysStreamable && !input.restricted;
  return {
    status: streamingPermitted ? 'approved' : 'rejected',
    streamingPermitted,
    commercialUse: commercialUseFromLicense(input.license),
    advertising: input.advertising ?? 'unconfirmed',
    license: input.license || null,
    basis: streamingPermitted ? input.basis : `Not playable: ${input.restricted ? 'restricted or gated by the provider' : 'provider did not confirm streaming permission'}.`,
  };
}

export interface PlayableOpts {
  /**
   * Allow 30-second preview clips. OFF by default: SAHU MUSIC plays complete songs,
   * so a track that only has a preview clip is treated as unavailable.
   */
  allowPreviews?: boolean;
}

/**
 * Why a track cannot be played, as a sentence a listener can understand.
 * `null` means the track is playable (full length, permission confirmed, not blocked).
 */
export function unavailableReason(track: Track, blocklist?: ReadonlySet<string>, opts: PlayableOpts = {}): string | null {
  if (blocklist?.has(trackKey(track))) return 'This track has been removed from SAHU MUSIC.';
  if (track.preview && !opts.allowPreviews) {
    return 'Only a 30-second preview exists for this song. The full song is not available from an authorised free source.';
  }
  if (!track.streamUrl || !track.rights.streamingPermitted || track.rights.status !== 'approved') {
    return 'The full-length stream for this track is not available.';
  }
  return null;
}

export function isPlayable(track: Track, blocklist?: ReadonlySet<string>, opts: PlayableOpts = {}): boolean {
  return unavailableReason(track, blocklist, opts) === null;
}

export function filterPlayable(tracks: Track[], blocklist?: ReadonlySet<string>, opts: PlayableOpts = {}): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const k = trackKey(t);
    if (seen.has(k) || !isPlayable(t, blocklist, opts)) return false;
    seen.add(k);
    return true;
  });
}
