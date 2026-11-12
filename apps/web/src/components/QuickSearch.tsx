'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { trackKey, type Track } from '@sahu/models';
import { sanitizeQuery } from '@sahu/shared';
import { useDebounced } from '@/lib/hooks';
import { useLibrary } from '@/lib/library';
import { music } from '@/lib/music';
import { usePlayer } from '@/lib/player';
import { Artwork } from './Artwork';
import { Icon } from './icons';

/** Same page size as the search page, so its first answer is already in the cache when it opens. */
const PAGE = { offset: 0, limit: 50 };
const SHOWN = 6;

/**
 * Top-bar search (tablet and desktop). Typing shows songs at once: first the ones already seen
 * in this session, your history and favourites, then the live results from every source.
 * Click (or ↑ ↓ Enter) plays a song; Enter on the text, the arrow button or "See all results"
 * opens the search page. Esc closes the list.
 */
export function QuickSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const { playQueue, warm, current, isPlaying } = usePlayer();
  const { history, favorites } = useLibrary();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Track[]>([]);
  /** The query `results` belong to (they stay on screen while the next query runs). */
  const [resultsFor, setResultsFor] = useState('');
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const listId = useId();
  const query = sanitizeQuery(useDebounced(text, 170));

  const quick = useMemo(
    () => (query.length >= 2 ? music.quickMatches(query, SHOWN, [...favorites, ...history.map((h) => h.track)]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );

  useEffect(() => {
    setFailed(false);
    setActive(-1);
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    // the previous songs stay in the list until the new ones arrive (no flicker while typing)
    let alive = true;
    const ctrl = new AbortController();
    setSearching(true);
    music
      .searchTracks(query, PAGE, {
        userSearch: true,
        signal: ctrl.signal,
        onPartial: (partial) => {
          if (!alive) return;
          setResults(partial);
          setResultsFor(query);
        },
      })
      .then(
        (all) => {
          if (!alive) return;
          setResults(all);
          setResultsFor(query);
        },
        () => alive && setFailed(true),
      )
      .finally(() => alive && setSearching(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [query]);

  // close when the page changes or a click lands outside
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // This query's results; else instant matches for it; else, while the listener is still typing
  // the same words ("arij" → "arijit"), the previous songs, dimmed — never songs of an unrelated query.
  const fresh = resultsFor === query && results.length > 0;
  const related = !!resultsFor && (query.startsWith(resultsFor) || resultsFor.startsWith(query));
  const queue = fresh ? results : quick.length ? quick : related ? results : [];
  const stale = !fresh && !quick.length && queue.length > 0;
  const songs = queue.slice(0, SHOWN);
  const typed = sanitizeQuery(text);
  const showList = open && typed.length >= 2;
  // options: the songs, then "See all results"
  const count = songs.length + 1;

  const openSearchPage = () => {
    const q = sanitizeQuery(text);
    router.push(q ? `/search/?q=${encodeURIComponent(q)}` : '/search/');
    setOpen(false);
    setText('');
    inputRef.current?.blur();
  };
  const play = (i: number) => {
    playQueue(queue, i);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <form
      ref={boxRef}
      role="search"
      className="group relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (showList && active >= 0 && active < songs.length) play(active);
        else openSearchPage();
      }}
    >
      <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted transition group-focus-within:text-gold" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (showList) {
              e.preventDefault();
              setOpen(false);
            }
          } else if (e.key === 'ArrowDown' && typed.length >= 2) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1) % count);
          } else if (e.key === 'ArrowUp' && typed.length >= 2) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a <= 0 ? count - 1 : a - 1));
          }
        }}
        maxLength={80}
        placeholder="Search songs, artists, playlists…"
        aria-label="Search songs, artists and playlists"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="w-full rounded-full bg-white/[0.06] py-2.5 pl-11 pr-11 text-sm text-white ring-1 ring-white/10 transition placeholder:text-muted focus:bg-white/[0.09] focus:outline-none focus:ring-gold/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button type="submit" aria-label="Show all results" className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-ink transition hover:brightness-110">
          <Icon name="chevronRight" size={16} />
        </button>
      )}

      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-coal/95 p-1.5 shadow-lift ring-1 ring-white/10 backdrop-blur-xl animate-pop-in">
          <ul id={listId} role="listbox" aria-label={`Songs for ${typed}`} aria-busy={searching || query !== typed} data-results-for={fresh ? query : ''}>
            {songs.map((t, i) => {
              const playing = !!current && trackKey(current) === trackKey(t) && isPlaying;
              return (
                <li
                  key={trackKey(t)}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => {
                    setActive(i);
                    warm(t);
                  }}
                  onMouseDown={(e) => e.preventDefault()} // keep the focus in the box
                  onClick={() => play(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl p-1.5 pr-3 transition-opacity ${active === i ? 'bg-white/[0.08]' : ''} ${stale ? 'opacity-50' : ''}`}
                >
                  <Artwork mirrors={t.artworkMirrors} src={t.artwork} alt="" size="sm" rounded="rounded-lg" className="h-10 w-10 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${playing ? 'text-dyn' : 'text-white'}`}>{t.title}</span>
                    <span className="block truncate text-xs text-white/55">{t.live ? `Live radio · ${t.artist}` : t.artist}</span>
                  </span>
                  <Icon name={playing ? 'pause' : 'play'} size={16} className="shrink-0 text-white/60" />
                </li>
              );
            })}
            {songs.length === 0 && (
              <li className="px-3 py-3 text-sm text-white/55" aria-live="polite">
                {/* while the typing pause has not passed yet, it is still "searching", not "nothing found" */}
                {searching || query !== typed ? 'Searching every source…' : failed ? 'Search failed. Check your connection.' : `No songs found for “${typed}”`}
              </li>
            )}
            <li
              id={`${listId}-${songs.length}`}
              role="option"
              aria-selected={active === songs.length}
              onMouseEnter={() => setActive(songs.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={openSearchPage}
              className={`mt-1 flex cursor-pointer items-center justify-between gap-2 rounded-xl border-t border-white/[0.06] px-3 py-2.5 text-sm font-semibold text-gold ${active === songs.length ? 'bg-white/[0.08]' : ''}`}
            >
              <span className="truncate">See all results for “{typed}”</span>
              {searching && songs.length > 0 ? (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-gold" aria-label="Searching" />
              ) : (
                <Icon name="chevronRight" size={16} className="shrink-0" />
              )}
            </li>
          </ul>
        </div>
      )}
    </form>
  );
}
