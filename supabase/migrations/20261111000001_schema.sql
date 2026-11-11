-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – database schema (Supabase / PostgreSQL)
-- Run in order:  20261111000001_schema.sql → …02_security.sql → …03_seed.sql
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── profiles ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 50),
  avatar_url   text check (avatar_url is null or avatar_url ~ '^https://'),
  role         text not null default 'user' check (role in ('user', 'admin')),
  is_blocked   boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── music_providers ────────────────────────────────────────────────
create table if not exists public.music_providers (
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

-- ── artists ────────────────────────────────────────────────────────
create table if not exists public.artists (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null references public.music_providers (id),
  provider_artist_id text not null,
  name               text not null check (char_length(name) between 1 and 200),
  image_url          text,
  bio                text,
  verified           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (provider, provider_artist_id)
);

-- ── albums ─────────────────────────────────────────────────────────
create table if not exists public.albums (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null references public.music_providers (id),
  provider_album_id text not null,
  title             text not null check (char_length(title) between 1 and 200),
  artist_id         uuid references public.artists (id) on delete set null,
  artwork_url       text,
  release_date      date,
  created_at        timestamptz not null default now(),
  unique (provider, provider_album_id)
);

-- ── genres (SAHU MUSIC categories, editable by admins) ─────────────
create table if not exists public.genres (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 60),
  description text,
  -- {"kind":"genre","genre":"Devotional"} | {"kind":"search","queries":["hindi"]} | {"kind":"trending"}
  strategy    jsonb not null default '{"kind":"trending"}'::jsonb,
  sort_order  int not null default 0,
  enabled     boolean not null default true
);

-- ── songs (admin-curated catalogue; live provider results are not stored) ──
create table if not exists public.songs (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null references public.music_providers (id),
  provider_track_id text not null,
  title             text not null check (char_length(title) between 1 and 300),
  artist_name       text not null,
  artist_id         uuid references public.artists (id) on delete set null,
  album_id          uuid references public.albums (id) on delete set null,
  artwork_url       text,
  stream_url        text not null check (stream_url ~ '^https://'),
  permalink         text,
  duration          int not null default 0 check (duration >= 0),
  genre             text,
  -- A song can only be public while an approved rights record exists (enforced by trigger).
  is_public         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (provider, provider_track_id)
);
create index if not exists songs_public_idx on public.songs (is_public, created_at desc);

-- ── music_rights (one verification record per provider track) ──────
create table if not exists public.music_rights (
  id                  uuid primary key default gen_random_uuid(),
  song_id             uuid unique references public.songs (id) on delete cascade,
  provider            text not null references public.music_providers (id),
  provider_track_id   text not null,
  rights_status       text not null default 'pending' check (rights_status in ('pending', 'approved', 'rejected', 'blocked')),
  streaming_permitted boolean not null default false,
  commercial_use      text not null default 'unconfirmed' check (commercial_use in ('allowed', 'not_allowed', 'unconfirmed')),
  advertising         text not null default 'unconfirmed' check (advertising in ('allowed', 'not_allowed', 'unconfirmed')),
  license             text,
  evidence            text,
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, provider_track_id)
);
create index if not exists music_rights_status_idx on public.music_rights (rights_status);

-- ── playlists ──────────────────────────────────────────────────────
create table if not exists public.playlists (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  description  text check (description is null or char_length(description) <= 500),
  artwork_url  text,
  is_public    boolean not null default false,
  is_editorial boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists playlists_owner_idx on public.playlists (owner_id, created_at desc);

-- Tracks are stored as provider references + a metadata snapshot (never audio).
create table if not exists public.playlist_songs (
  id                uuid primary key default gen_random_uuid(),
  playlist_id       uuid not null references public.playlists (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  position          bigint not null default 0,
  added_at          timestamptz not null default now(),
  unique (playlist_id, provider, provider_track_id)
);
create index if not exists playlist_songs_order_idx on public.playlist_songs (playlist_id, position);

-- ── favorites ──────────────────────────────────────────────────────
create table if not exists public.favorites (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  created_at        timestamptz not null default now(),
  primary key (user_id, provider, provider_track_id)
);

-- ── listening_history ──────────────────────────────────────────────
create table if not exists public.listening_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  provider          text not null,
  provider_track_id text not null,
  track             jsonb not null,
  played_at         timestamptz not null default now()
);
create index if not exists listening_history_user_idx on public.listening_history (user_id, played_at desc);

-- ── user_preferences ───────────────────────────────────────────────
create table if not exists public.user_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── api_errors (provider API error monitoring for the admin panel) ─
create table if not exists public.api_errors (
  id         bigint generated always as identity primary key,
  provider   text not null check (char_length(provider) <= 40),
  endpoint   text not null check (char_length(endpoint) <= 200),
  status     int not null default 0,
  message    text not null check (char_length(message) <= 300),
  client     text not null default 'web' check (client in ('web', 'mobile', 'admin', 'edge')),
  created_at timestamptz not null default now()
);
create index if not exists api_errors_created_idx on public.api_errors (created_at desc);
