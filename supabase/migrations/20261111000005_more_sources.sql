-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – more full-length sources: YouTube official player,
-- live radio (Radio Browser) and the Internet Archive.
-- Also: 30-second preview clips are off by default, and the categories
-- now describe complete songs only. No audio is stored.
-- ═══════════════════════════════════════════════════════════════════

insert into public.music_providers (id, name, homepage, api_base_url, requires_key, enabled, terms_note) values
  ('youtube', 'YouTube (official player)', 'https://www.youtube.com', 'https://www.googleapis.com/youtube/v3', true, true,
   'Original film songs. Search/metadata via the YouTube Data API (free key, 10,000 units a day: a search costs 100, the chart 1). Playback only in YouTube''s official embedded player, which must stay visible; no background playback; only embeddable, public, not age-restricted videos.'),
  ('radio', 'Live radio (Radio Browser)', 'https://www.radio-browser.info', 'https://de1.api.radio-browser.info/json', false, true,
   'Free community directory of radio stations, no key. Only working HTTPS streams are listed. The station publishes the stream and holds its broadcast licences.'),
  ('archive', 'Internet Archive', 'https://archive.org', 'https://archive.org/advancedsearch.php', false, true,
   'Free, no key. Only items with an open licence (Creative Commons or public domain) declared by the uploader, and not access-restricted. Block any item under Rights verification.')
on conflict (id) do update
  set name = excluded.name, homepage = excluded.homepage, api_base_url = excluded.api_base_url,
      requires_key = excluded.requires_key, terms_note = excluded.terms_note;

-- Preview clips are opt-in in the apps (NEXT_PUBLIC_ITUNES_PREVIEWS); reflect that here.
update public.music_providers set enabled = false where id = 'itunes';

-- Categories that existed only for preview clips.
delete from public.genres where slug in ('new-bollywood', '2010s-bollywood', '80s-bollywood');

insert into public.genres (slug, name, description, strategy, sort_order) values
  ('bollywood-top',   'Bollywood Top Songs', 'Original film songs trending in India, in YouTube''s official player', '{"kind":"youtube-chart"}', 1),
  ('bollywood-radio', 'Bollywood Radio',     'Live Bollywood stations playing full songs non-stop',                  '{"kind":"radio","tags":["bollywood","hindi"]}', 2),
  ('retro-radio',     'Retro Hindi Radio',   'Live stations for 90s and golden-era Hindi songs',                      '{"kind":"radio","tags":["bollywood 90s","retro bollywood","purane","old hindi","kishore","rafi","lata","mukesh"]}', 3),
  ('bhakti-radio',    'Bhakti Radio',        'Live bhajan and devotional stations',                                   '{"kind":"radio","tags":["bhajan","devotional","hindu","bhakti"]}', 4),
  ('hindi',           'Hindi',               'Hindi songs shared by independent creators',                            '{"kind":"search","queries":["hindi","hindi song"]}', 5),
  ('bollywood',       'Bollywood',           'Bollywood-style originals, covers and remixes shared by their creators', '{"kind":"search","queries":["bollywood","bollywood remix"]}', 6),
  ('90s-classics',    '90s Classics',        'Tracks with the 90s sound',                                             '{"kind":"search","queries":["90s hindi","90s"]}', 7),
  ('2000s-hits',      '2000s Hits',          'Tracks with the 2000s sound',                                           '{"kind":"search","queries":["2000s"]}', 8),
  ('old-hindi',       'Old Hindi',           'Retro and classic Hindi flavours',                                      '{"kind":"search","queries":["old hindi","old hindi songs"]}', 9),
  ('lofi-hindi',      'Lo-fi Hindi',         'Slow, mellow Hindi lo-fi',                                              '{"kind":"search","queries":["lofi hindi"]}', 14),
  ('ghazal-qawwali',  'Ghazal & Qawwali',    'Ghazals, qawwali and sufi sounds',                                      '{"kind":"search","queries":["ghazal","qawwali"]}', 15)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, strategy = excluded.strategy, sort_order = excluded.sort_order;
