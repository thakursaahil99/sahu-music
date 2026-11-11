-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – reference data (providers + categories). No songs are seeded:
-- the catalogue is filled only from authorised provider APIs.
-- ═══════════════════════════════════════════════════════════════════

insert into public.music_providers (id, name, homepage, api_base_url, requires_key, enabled, terms_note) values
  ('audius',  'Audius',  'https://audius.co',       'https://api.audius.co/v1',     false, true,
   'Free public API, no key. Tracks are uploaded by creators; only tracks flagged streamable and not gated are played.'),
  ('jamendo', 'Jamendo', 'https://www.jamendo.com', 'https://api.jamendo.com/v3.0', true,  true,
   'Free API tier is for NON-COMMERCIAL use only. Requires a client_id set in the app environment. Creative Commons licences per track.'),
  ('demo',    'SAHU MUSIC Demo', null, null, false, true,
   'Original audio synthesized in-app (CC0). Used only when the live catalogue is unreachable or demo mode is forced.')
on conflict (id) do nothing;

insert into public.genres (slug, name, description, strategy, sort_order) values
  ('hindi',               'Hindi',               'Hindi tracks from independent creators',                          '{"kind":"search","queries":["hindi"]}', 1),
  ('bollywood',           'Bollywood',           'Bollywood-inspired originals and remixes shared by their creators','{"kind":"search","queries":["bollywood"]}', 2),
  ('punjabi',             'Punjabi',             'Punjabi beats and bhangra',                                        '{"kind":"search","queries":["punjabi","bhangra"]}', 3),
  ('haryanvi',            'Haryanvi',            'Haryanvi sounds',                                                  '{"kind":"search","queries":["haryanvi"]}', 4),
  ('english',             'English',             'Pop from around the world',                                        '{"kind":"genre","genre":"Pop"}', 5),
  ('old-hindi',           'Old Hindi',           'Retro and classic Hindi flavours',                                 '{"kind":"search","queries":["old hindi","retro hindi"]}', 6),
  ('90s-classics',        '90s Classics',        'Tracks tagged with the 90s sound',                                 '{"kind":"search","queries":["90s"]}', 7),
  ('2000s-hits',          '2000s Hits',          'Tracks tagged with the 2000s sound',                               '{"kind":"search","queries":["2000s"]}', 8),
  ('romantic',            'Romantic',            'Love songs',                                                       '{"kind":"search","queries":["romantic","love song"]}', 9),
  ('sad',                 'Sad',                 'For the quiet hours',                                              '{"kind":"search","queries":["sad"]}', 10),
  ('party',               'Party',               'Turn it up',                                                       '{"kind":"search","queries":["party"]}', 11),
  ('devotional',          'Devotional',          'Bhajans, kirtan and spiritual music',                              '{"kind":"genre","genre":"Devotional"}', 12),
  ('independent-artists', 'Independent Artists', 'Trending right now from independent artists',                      '{"kind":"trending"}', 13)
on conflict (slug) do nothing;

-- ── Make yourself an admin (run once in the SQL editor after signing up) ──
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
