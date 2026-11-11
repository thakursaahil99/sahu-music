'use client';

import Link from 'next/link';
import { Artwork } from '@/components/Artwork';
import { Icon } from '@/components/icons';
import { QueuePanel } from '@/components/players';
import { EmptyState } from '@/components/ui';
import { usePlayer } from '@/lib/player';

/** /player – "now playing" page with the queue; the button opens the full-screen player. */
export default function PlayerPage() {
  const { current, setFullOpen, isPlaying, toggle } = usePlayer();

  if (!current) {
    return (
      <EmptyState title="Nothing is playing" text="Pick a song to start listening.">
        <Link href="/" className="btn-gold">Browse music</Link>
      </EmptyState>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold text-white">Now playing</h1>
      <div className="grid gap-8 lg:grid-cols-[20rem,1fr]">
        <div>
          <Artwork src={current.artworkLarge || current.artwork} alt={`${current.title} artwork`} size="lg" rounded="rounded-2xl" className="shadow-glow" />
          <h2 className="mt-4 truncate text-xl font-bold text-white">{current.title}</h2>
          <p className="truncate text-sm text-muted">{current.artist}</p>
          <div className="mt-4 flex gap-3">
            <button type="button" className="btn-gold" onClick={toggle}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={18} /> {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setFullOpen(true)}>
              Full-screen player
            </button>
          </div>
        </div>
        <div className="card h-[60dvh]">
          <QueuePanel />
        </div>
      </div>
    </>
  );
}
