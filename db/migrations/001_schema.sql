-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – database schema for Neon (PostgreSQL)
-- Applied automatically on every Vercel build by scripts/db-migrate.mjs.
-- The database is only reached through the API in /api: browsers never
-- connect to it, so access rules live in the API (see api/_lib/*).
-- The rights rules below are enforced by the database itself.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── accounts ───────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique check (char_length(email) between 3 and 254),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists profiles (
  id           uuid primary key references users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 50),
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  role         text not null default 'user' check (role in ('user', 'admin')),
  is_blocked   boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Sessions: only a SHA-256 hash of the token is stored, so a database leak does not leak logins.
create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  client     text not null default 'web' check (client in ('web', 'mobile', 'admin')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- Failed sign-ins, for rate limiting (rows older than a day are pruned by the API).
create table if not exists auth_failures (
  id         bigint generated always as identity primary key,
  email      citext not null,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_failures_email_idx on auth_failures (email, created_at desc);
create index if not exists auth_failures_ip_idx on auth_failures (ip, created_at desc);

-- ── music_providers ────────────────────────────────────────────────
create table if not exists music_providers (
  id            text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  name          text not null,
  homepage      text,
  api_base_url  text,
  requires_key  boolean not null default false,
  enabled       boolean not null default true,
  terms_note    text,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── artists / albums ───────────────────────────────────────────────
create table if not exists artists (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null references music_providers (id),
  provider_artist_id text not null,
  name               text not null check (char_length(name) between 1 and 200),
  image_url          text,
  bio                text,
  verified           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (provider, provider_artist_id)
);

create table if not exists albums (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null references music_providers (id),
  provider_album_id text not null,
  title             text not null check (char_length(title) between 1 and 200),
  artist_id         uuid references artists (id) on delete set null,
  artwork_url       text,
  release_date      date,
  created_at        timestamptz not null default now(),
  unique (provider, provider_album_id)
);

-- ── genres (SAHU MUSIC categories, editable by admins) ─────────────
create table if not exists genres (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 60),
  description text,
  strategy    jsonb not null default '{"kind":"trending"}'::jsonb,
  sort_order  int not null default 0,
  enabled     boolean not null default true
);

-- ── songs (admin-curated catalogue; live provider results are not stored) ──
create table if not exists songs (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null references music_providers (id),
  provider_track_id text not null,
  title             text not null check (char_length(title) between 1 and 300),
  artist_name       text not null,
  artist_id         uuid references artists (id) on delete set null,
  album_id          uuid references albums (id) on delete set null,
  artwork_url       text,
  stream_url        text not null check (stream_url ~ '^https://'),
  permalink         text,
  duration          int not null default 0 check (duration >= 0),
  genre             text,
  is_public         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (provider, provider_track_id)
);
create index if not exists songs_public_idx on songs (is_public, created_at desc);

-- ── music_rights (one verification record per provider track) ──────
create table if not exists music_rights (
  id                  uuid primary key default gen_random_uuid(),
  song_id             uuid unique references songs (id) on delete cascade,
  provider            text not null references music_providers (id),
  provider_track_id   text not null,
  rights_status       text not null default 'pending' check (rights_status in ('pending', 'approved', 'rejected', 'blocked')),
  streaming_permitted boolean not null default false,
  commercial_use      text not null default 'unconfirmed' check (commercial_use in ('allowed', 'not_allowed', 'unconfirmed')),
  advertising         text not null default 'unconfirmed' check (advertising in ('allowed', 'not_allowed', 'unconfirmed')),
  license             text,
  evidence            text,
  verified_by         uuid references profiles (id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, provider_track_id)
);
create index if not exists music_rights_status_idx on music_rights (rights_status, created_at desc);

-- ── playlists ──────────────────────────────────────────────────────
create table if not exists playlists (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  description  text check (description is null or char_length(description) <= 500),
  artwork_url  text,
  is_public    boolean not null default false,
  is_editorial boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists playlists_owner_idx on playlists (owner_id, created_at desc);

-- Tracks are stored as provider references + a metadata snapshot (never audio).
create table if not exists playlist_songs (
  id                uuid primary key default gen_random_uuid(),
  playlist_id       uuid not null references playlists (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  position          bigint not null default 0,
  added_at          timestamptz not null default now(),
  unique (playlist_id, provider, provider_track_id)
);
create index if not exists playlist_songs_order_idx on playlist_songs (playlist_id, position);

-- ── personal data ──────────────────────────────────────────────────
create table if not exists favorites (
  user_id           uuid not null references profiles (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  created_at        timestamptz not null default now(),
  primary key (user_id, provider, provider_track_id)
);

create table if not exists listening_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  played_at         timestamptz not null default now()
);
create index if not exists listening_history_user_idx on listening_history (user_id, played_at desc);
create index if not exists listening_history_played_idx on listening_history (played_at desc);

create table if not exists user_preferences (
  user_id     uuid primary key references profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── api_errors (provider API error monitoring for the admin panel) ─
create table if not exists api_errors (
  id         bigint generated always as identity primary key,
  provider   text not null check (char_length(provider) <= 40),
  endpoint   text not null check (char_length(endpoint) <= 200),
  status     int not null default 0,
  message    text not null check (char_length(message) <= 300),
  client     text not null default 'web' check (client in ('web', 'mobile', 'admin', 'edge')),
  created_at timestamptz not null default now()
);
create index if not exists api_errors_created_idx on api_errors (created_at desc);

-- ═══════════════════════════════════════════════════════════════════
-- NO UNLICENSED SONG CAN BECOME PUBLIC (enforced by the database)
-- ═══════════════════════════════════════════════════════════════════
-- 1) A song may only be public while an approved rights record with streaming permission exists.
create or replace function enforce_song_rights() returns trigger language plpgsql as $$
begin
  if new.is_public and not exists (
    select 1 from music_rights r
    where r.song_id = new.id and r.rights_status = 'approved' and r.streaming_permitted
  ) then
    raise exception 'Song cannot be public: no approved rights record with streaming permission'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_song_rights on songs;
create trigger enforce_song_rights before insert or update on songs
  for each row execute function enforce_song_rights();

-- 2) If a rights record stops being approved (or is deleted), the song is unpublished immediately.
create or replace function unpublish_on_rights_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    update songs set is_public = false where id = old.song_id and is_public;
    return old;
  end if;
  if new.song_id is not null and not (new.rights_status = 'approved' and new.streaming_permitted) then
    update songs set is_public = false where id = new.song_id and is_public;
  end if;
  return new;
end;
$$;
drop trigger if exists unpublish_on_rights_change on music_rights;
create trigger unpublish_on_rights_change after update or delete on music_rights
  for each row execute function unpublish_on_rights_change();

-- 3) Rights decisions are time-stamped (the API also records who made them).
create or replace function stamp_rights_decision() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' or new.rights_status is distinct from old.rights_status) and new.rights_status <> 'pending' then
    new.verified_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_rights_decision on music_rights;
create trigger stamp_rights_decision before insert or update on music_rights
  for each row execute function stamp_rights_decision();

-- Approved catalogue as served to the apps.
create or replace view public_songs as
  select s.id, s.provider, s.provider_track_id, s.title, s.artist_name, s.artwork_url, s.stream_url,
         s.permalink, s.duration, s.genre, s.created_at,
         a.provider_artist_id,
         r.commercial_use, r.advertising, r.license, r.evidence
  from songs s
  join music_rights r on r.song_id = s.id
  left join artists a on a.id = s.artist_id
  where s.is_public and r.rights_status = 'approved' and r.streaming_permitted;

-- ═══════════════════════════════════════════════════════════════════
-- Reference data. No songs are seeded: the catalogue is filled only
-- from authorised provider APIs, after an admin approves the rights.
-- ═══════════════════════════════════════════════════════════════════
insert into music_providers (id, name, homepage, api_base_url, requires_key, enabled, terms_note) values
  ('audius',  'Audius',  'https://audius.co', 'https://api.audius.co/v1', false, true,
   'Free public API, no key. Tracks are uploaded by creators; only tracks flagged streamable and not gated are played.'),
  ('jamendo', 'Jamendo', 'https://www.jamendo.com', 'https://api.jamendo.com/v3.0', true, true,
   'Free API tier is for NON-COMMERCIAL use only. Requires a client_id set in the app environment. Creative Commons licences per track.'),
  ('youtube', 'YouTube (official player)', 'https://www.youtube.com', 'https://www.googleapis.com/youtube/v3', true, true,
   'Original film songs. Search/metadata via the YouTube Data API (free key, 10,000 units a day: a search costs 100, the chart 1). Playback only in YouTube''s official embedded player, which must stay visible; no background playback; only embeddable, public, not age-restricted videos.'),
  ('radio', 'Live radio (Radio Browser)', 'https://www.radio-browser.info', 'https://de1.api.radio-browser.info/json', false, true,
   'Free community directory of radio stations, no key. Only working HTTPS streams are listed. The station publishes the stream and holds its broadcast licences.'),
  ('archive', 'Internet Archive', 'https://archive.org', 'https://archive.org/advancedsearch.php', false, true,
   'Free, no key. Only items with an open licence (Creative Commons or public domain) declared by the uploader, and not access-restricted.'),
  ('itunes', 'Apple Music previews', 'https://music.apple.com', 'https://itunes.apple.com', false, false,
   '30-SECOND PREVIEW CLIPS ONLY. Off by default; the apps only play complete songs unless previews are explicitly enabled.'),
  ('demo', 'SAHU MUSIC Demo', null, null, false, true,
   'Original audio synthesized in-app (CC0). Used only when the live catalogue is unreachable or demo mode is forced.')
on conflict (id) do nothing;

insert into genres (slug, name, description, strategy, sort_order) values
  ('bollywood-top',       'Bollywood Top Songs', 'Original film songs trending in India, in YouTube''s official player', '{"kind":"youtube-chart"}', 1),
  ('bollywood-radio',     'Bollywood Radio',     'Live Bollywood stations playing full songs non-stop',                  '{"kind":"radio","tags":["bollywood","hindi"]}', 2),
  ('retro-radio',         'Retro Hindi Radio',   'Live stations for 90s and golden-era Hindi songs',                      '{"kind":"radio","tags":["bollywood 90s","retro bollywood","purane","old hindi","kishore","rafi","lata","mukesh"]}', 3),
  ('bhakti-radio',        'Bhakti Radio',        'Live bhajan and devotional stations',                                   '{"kind":"radio","tags":["bhajan","devotional","hindu","bhakti"]}', 4),
  ('hindi',               'Hindi',               'Hindi songs shared by independent creators',                            '{"kind":"search","queries":["hindi","hindi song"]}', 5),
  ('bollywood',           'Bollywood',           'Bollywood-style originals, covers and remixes shared by their creators', '{"kind":"search","queries":["bollywood","bollywood remix"]}', 6),
  ('90s-classics',        '90s Classics',        'Tracks with the 90s sound',                                             '{"kind":"search","queries":["90s hindi","90s"]}', 7),
  ('2000s-hits',          '2000s Hits',          'Tracks with the 2000s sound',                                           '{"kind":"search","queries":["2000s"]}', 8),
  ('old-hindi',           'Old Hindi',           'Retro and classic Hindi flavours',                                      '{"kind":"search","queries":["old hindi","old hindi songs"]}', 9),
  ('punjabi',             'Punjabi',             'Punjabi beats and bhangra',                                             '{"kind":"search","queries":["punjabi","bhangra"]}', 10),
  ('haryanvi',            'Haryanvi',            'Haryanvi sounds',                                                       '{"kind":"search","queries":["haryanvi"]}', 11),
  ('romantic',            'Romantic',            'Love songs',                                                            '{"kind":"search","queries":["romantic","love song"]}', 12),
  ('sad',                 'Sad',                 'For the quiet hours',                                                   '{"kind":"search","queries":["sad"]}', 13),
  ('lofi-hindi',          'Lo-fi Hindi',         'Slow, mellow Hindi lo-fi',                                              '{"kind":"search","queries":["lofi hindi"]}', 14),
  ('ghazal-qawwali',      'Ghazal & Qawwali',    'Ghazals, qawwali and sufi sounds',                                      '{"kind":"search","queries":["ghazal","qawwali"]}', 15),
  ('party',               'Party',               'Turn it up',                                                            '{"kind":"search","queries":["party"]}', 16),
  ('devotional',          'Devotional',          'Bhajans, kirtan and spiritual music',                                   '{"kind":"genre","genre":"Devotional"}', 17),
  ('english',             'English',             'Pop from around the world',                                             '{"kind":"genre","genre":"Pop"}', 18),
  ('independent-artists', 'Independent Artists', 'Trending right now from independent artists',                          '{"kind":"trending"}', 19)
on conflict (slug) do nothing;
