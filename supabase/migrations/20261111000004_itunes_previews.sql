-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – Apple Music preview provider + Bollywood era categories.
-- Label-owned film songs are available only as 30-second preview clips
-- (iTunes Search API); no audio is stored.
-- ═══════════════════════════════════════════════════════════════════

insert into public.music_providers (id, name, homepage, api_base_url, requires_key, enabled, terms_note) values
  ('itunes', 'Apple Music previews', 'https://music.apple.com', 'https://itunes.apple.com', false, true,
   'Free official iTunes Search API, no key. 30-SECOND PREVIEW CLIPS ONLY, for promotional listening with a link to the full song on Apple Music. About 20 calls/minute per client.')
on conflict (id) do nothing;

insert into public.genres (slug, name, description, strategy, sort_order) values
  ('new-bollywood',   'New Bollywood',   'Most played film songs in India right now · 30-second previews',        '{"kind":"genre","genre":"Bollywood"}', 1),
  ('bollywood',       'Bollywood',       'Film songs from every era · 30-second previews, plus creator uploads', '{"kind":"search","queries":["bollywood","arijit singh","shreya ghoshal"]}', 2),
  ('2010s-bollywood', '2010s Bollywood', 'Film hits released 2010–2019 · 30-second previews',                    '{"kind":"search","queries":["arijit singh","pritam","amit trivedi"],"years":[2010,2019]}', 3),
  ('2000s-hits',      '2000s Hits',      'Film hits released 2000–2009 · 30-second previews',                    '{"kind":"search","queries":["sonu nigam","shreya ghoshal","pritam"],"years":[2000,2009]}', 4),
  ('90s-classics',    '90s Classics',    'Film hits released 1990–1999 · 30-second previews',                    '{"kind":"search","queries":["kumar sanu","udit narayan","alka yagnik"],"years":[1990,1999]}', 5),
  ('80s-bollywood',   '80s Bollywood',   'Film hits released 1980–1989 · 30-second previews',                    '{"kind":"search","queries":["kishore kumar","bappi lahiri","r.d. burman"],"years":[1980,1989]}', 6),
  ('old-hindi',       'Old Hindi',       'Golden-era film songs up to 1979 · 30-second previews',                '{"kind":"search","queries":["mohammed rafi","lata mangeshkar","kishore kumar"],"years":[1930,1979]}', 7),
  ('hindi',           'Hindi',           'Hindi tracks from independent creators and film previews',             '{"kind":"search","queries":["hindi"]}', 8)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description, strategy = excluded.strategy, sort_order = excluded.sort_order;
