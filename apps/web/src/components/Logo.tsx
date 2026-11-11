/** SAHU MUSIC mark: a gold "S" flanked by sound-wave bars. Same artwork as /public/logo.svg. */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="SAHU MUSIC logo">
      <rect width="512" height="512" rx="112" fill="#0B0B0B" />
      <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#D7AE55" strokeOpacity="0.35" strokeWidth="6" />
      <g stroke="#D7AE55" strokeLinecap="round" fill="none">
        <path d="M330 172c0-52-140-62-140 18 0 80 140 50 140 135 0 80-145 70-150 15" strokeWidth="44" />
        <path d="M92 216v80M128 186v140M384 186v140M420 216v80" strokeWidth="22" />
      </g>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={compact ? 32 : 40} />
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-[0.18em] text-white">
          SAHU <span className="text-gold">MUSIC</span>
        </span>
        {!compact && <span className="block text-[11px] text-muted">Har Gaana, Ek Jagah.</span>}
      </span>
    </span>
  );
}
