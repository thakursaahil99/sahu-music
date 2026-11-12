'use client';

import { useId } from 'react';

/** SAHU MUSIC mark: a gold "S" flanked by sound-wave bars. Same artwork as /public/logo.svg. */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  // Each mark needs its own gradient id: a shared id would point at the copy inside a hidden
  // header (phone/tablet/desktop each have one), and a gradient inside a hidden element paints nothing.
  const id = `sahu-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="SAHU MUSIC logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD580" />
          <stop offset="0.55" stopColor="#F6B73C" />
          <stop offset="1" stopColor="#FF7A59" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="#121019" />
      <rect x="6" y="6" width="500" height="500" rx="122" fill="none" stroke={`url(#${id})`} strokeOpacity="0.45" strokeWidth="8" />
      <g stroke={`url(#${id})`} strokeLinecap="round" fill="none">
        <path d="M330 172c0-52-140-62-140 18 0 80 140 50 140 135 0 80-145 70-150 15" strokeWidth="44" />
        <path d="M92 216v80M128 186v140M384 186v140M420 216v80" strokeWidth="22" />
      </g>
    </svg>
  );
}

/** Credit line shown at the top of every page. */
export const BUILT_BY = 'Sahil Thakur';

/** Wordmark. `compact` = phone header: one line for the name, one short line for the credit. */
export function Logo({ compact = false, byline = false }: { compact?: boolean; byline?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={compact ? 34 : 40} className="shrink-0" />
      <span className="min-w-0 leading-none">
        <span className="block whitespace-nowrap font-display text-[17px] font-extrabold tracking-[0.06em] text-white">
          SAHU <span className="text-gold-gradient">MUSIC</span>
        </span>
        {byline ? (
          <span className="mt-1 block whitespace-nowrap text-[10px] font-semibold text-white/55">
            by <span className="text-gold">{BUILT_BY}</span>
          </span>
        ) : (
          !compact && <span className="mt-1 block whitespace-nowrap text-[11px] font-medium text-muted">Har Gaana, Ek Jagah.</span>
        )}
      </span>
    </span>
  );
}

/** "Built by …" pill for the desktop top bar. */
export function BuiltByBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3.5 text-xs font-semibold text-white/75 ring-1 ring-white/10 ${className}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft via-gold to-[#FF7A59] text-[10px] font-extrabold text-ink" aria-hidden="true">
        ST
      </span>
      <span>
        Built by <span className="font-bold text-gold">{BUILT_BY}</span>
      </span>
    </span>
  );
}
