'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { YT_HOST_ID } from '@/lib/engines';
import { usePlayer } from '@/lib/player';
import { Icon } from './icons';
import { youtubeAppUrl } from './tracks';

/**
 * The visible frame for YouTube's official player.
 *
 * YouTube's terms require the player to stay visible (at least 200×200 px) while it plays, so the
 * video is never hidden: it sits in the full player when that is open, otherwise it floats above
 * the mini player. The same element moves between the two places, so the video never reloads.
 */
export function VideoStage() {
  const { current, fullOpen, videoSlot, setFullOpen, stop, isPlaying, toggle } = usePlayer();
  const video = !!current?.video;
  const appUrl = current ? youtubeAppUrl(current) : null;
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Follow the slot in the full player (it slides in, and moves on resize).
  useEffect(() => {
    if (!video || !fullOpen || !videoSlot) {
      setRect(null);
      return;
    }
    let raf = 0;
    let last = '';
    const follow = () => {
      const r = videoSlot.getBoundingClientRect();
      const sig = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (sig !== last) {
        last = sig;
        setRect(r);
      }
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [video, fullOpen, videoSlot]);

  const inSlot = video && fullOpen && rect && rect.width > 0;
  const style: CSSProperties = inSlot
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : {};

  return (
    <div
      id={YT_HOST_ID}
      style={style}
      aria-hidden={!video}
      className={
        !video
          ? 'pointer-events-none fixed -left-[9999px] top-0 h-[200px] w-[356px] opacity-0'
          : inSlot
            ? 'fixed z-[55] overflow-hidden rounded-2xl bg-black shadow-glow-lg ring-1 ring-white/10'
            : // floating dock above the mini player (and above the bottom navigation on phones)
              // (a corner card from small tablets up, so it never covers the whole page)
              'fixed bottom-[calc(8.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 overflow-hidden rounded-2xl bg-black shadow-lift ring-1 ring-gold/30 animate-pop-in sm:left-auto sm:right-4 sm:w-[22.25rem] md:bottom-[6.5rem] lg:right-5'
      }
    >
      {video && !inSlot && (
        <div className="flex items-center gap-2 bg-black/90 px-3 py-1.5 text-xs text-white/80">
          <span className="rounded bg-[#ff0033] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">YouTube</span>
          <span className="min-w-0 flex-1 truncate">{current?.title}</span>
          {appUrl && (
            // continue in the YouTube app (its own mini window works there); stop the copy here
            <a href={appUrl} target="_blank" rel="noopener noreferrer" onClick={() => isPlaying && toggle()} className="icon-btn !h-8 !w-8 text-white/80 hover:text-gold" aria-label="Open in YouTube app" title="Open in YouTube app">
              <Icon name="external" size={16} />
            </a>
          )}
          <button type="button" onClick={() => setFullOpen(true)} className="icon-btn !h-8 !w-8 text-white/80 hover:text-gold" aria-label="Open full player">
            <Icon name="chevronDown" size={16} className="rotate-180" />
          </button>
          <button type="button" onClick={stop} className="icon-btn !h-8 !w-8 text-white/80 hover:text-white" aria-label="Close video">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {/* 16:9, never below YouTube's 200 px minimum */}
      <div data-yt-mount className={inSlot ? 'h-full w-full' : 'aspect-video min-h-[200px] w-full'} />
    </div>
  );
}
