import type { SVGProps } from 'react';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2 5 5',
  library: 'M4 4v16M9 4v16M14 5l5 15',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  next: 'M5 5l10 7-10 7zM19 5v14',
  prev: 'M19 5 9 12l10 7zM5 5v14',
  shuffle: 'M3 7h3c4 0 6 10 10 10h5m-3-3 3 3-3 3M3 17h3c1.5 0 2.7-1.4 3.8-3.2M21 7h-5c-1.5 0-2.7 1.4-3.8 3.2M18 4l3 3-3 3',
  repeat: 'M4 12V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 12v3a3 3 0 0 1-3 3H4m3 3-3-3 3-3',
  queue: 'M4 6h12M4 11h12M4 16h7M16 14v6l5-3z',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'M6 9l6 6 6-6',
  back: 'M19 12H5m6-7-7 7 7 7',
  chevronRight: 'M9 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4',
  volume: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  download: 'M12 4v11m-4-4 4 4 4-4M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  share: 'M8 12h8M13 7l5 5-5 5M6 5v14',
  wifiOff: 'M3 3l18 18M5 12.5a10 10 0 0 1 3.5-2.3M2 9a15 15 0 0 1 4.2-2.7M12 5c3.7 0 7.2 1.4 10 4M15 11.3a10 10 0 0 1 4 1.2M8.5 16a5 5 0 0 1 7 0M12 20h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9h.01',
  check: 'M5 12l5 5 9-10',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
} as const;

export type IconName = keyof typeof PATHS | 'play' | 'pause' | 'heartFill';

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  if (name === 'play' || name === 'pause' || name === 'heartFill') {
    const d = name === 'play' ? 'M7 4.5v15l13-7.5z' : name === 'pause' ? 'M6 4h4v16H6zM14 4h4v16h-4z' : PATHS.heart;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
        <path d={d} />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
