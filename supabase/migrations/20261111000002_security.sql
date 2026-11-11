-- ═══════════════════════════════════════════════════════════════════
-- SAHU MUSIC – functions, triggers and Row Level Security
-- ═══════════════════════════════════════════════════════════════════

-- ── helpers ────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_blocked);
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and is_blocked);
$$;

-- ── create a profile for every new auth user ───────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 50), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── users can never change their own role / blocked flag ───────────
-- (API requests carry role anon/authenticated; the SQL editor and service role do not.)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_blocked is distinct from old.is_blocked)
     and coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'Only an administrator can change role or blocked status';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ── NO UNLICENSED SONG CAN BECOME PUBLIC ───────────────────────────
-- 1) A song may only be marked public while an approved rights record
--    with streaming permission exists for it.
create or replace function public.enforce_song_rights()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not exists (
    select 1 from public.music_rights r
    where r.song_id = new.id and r.rights_status = 'approved' and r.streaming_permitted
  ) then
    raise exception 'Song % cannot be public: no approved rights record with streaming permission', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_song_rights on public.songs;
create trigger enforce_song_rights
  before insert or update on public.songs
  for each row execute function public.enforce_song_rights();

-- 2) If a rights record stops being approved (or is deleted), the song is unpublished immediately.
create or replace function public.unpublish_on_rights_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.songs set is_public = false where id = old.song_id and is_public;
    return old;
  end if;
  if new.song_id is not null and not (new.rights_status = 'approved' and new.streaming_permitted) then
    update public.songs set is_public = false where id = new.song_id and is_public;
  end if;
  return new;
end;
$$;

drop trigger if exists unpublish_on_rights_change on public.music_rights;
create trigger unpublish_on_rights_change
  after update or delete on public.music_rights
  for each row execute function public.unpublish_on_rights_change();

-- 3) Rights decisions are stamped with who made them.
create or replace function public.stamp_rights_verifier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.rights_status is distinct from old.rights_status then
    if new.rights_status <> 'pending' then
      new.verified_by := coalesce(auth.uid(), new.verified_by);
      new.verified_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_rights_verifier on public.music_rights;
create trigger stamp_rights_verifier
  before insert or update on public.music_rights
  for each row execute function public.stamp_rights_verifier();

-- ── public view of approved catalogue songs ────────────────────────
create or replace view public.public_songs with (security_invoker = true) as
  select s.id, s.provider, s.provider_track_id, s.title, s.artist_name, s.artwork_url, s.stream_url,
         s.permalink, s.duration, s.genre, s.created_at,
         a.provider_artist_id,
         r.commercial_use, r.advertising, r.license, r.evidence
  from public.songs s
  join public.music_rights r on r.song_id = s.id
  left join public.artists a on a.id = s.artist_id
  where s.is_public and r.rights_status = 'approved' and r.streaming_permitted;

grant select on public.public_songs to anon, authenticated;

-- ── admin dashboard analytics ──────────────────────────────────────
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return jsonb_build_object(
    'users',            (select count(*) from profiles),
    'admins',           (select count(*) from profiles where role = 'admin'),
    'blocked_users',    (select count(*) from profiles where is_blocked),
    'songs',            (select count(*) from songs),
    'public_songs',     (select count(*) from songs where is_public),
    'artists',          (select count(*) from artists),
    'albums',           (select count(*) from albums),
    'playlists',        (select count(*) from playlists),
    'favorites',        (select count(*) from favorites),
    'plays_24h',        (select count(*) from listening_history where played_at > now() - interval '24 hours'),
    'plays_7d',         (select count(*) from listening_history where played_at > now() - interval '7 days'),
    'rights_pending',   (select count(*) from music_rights where rights_status = 'pending'),
    'rights_approved',  (select count(*) from music_rights where rights_status = 'approved'),
    'rights_blocked',   (select count(*) from music_rights where rights_status in ('blocked', 'rejected')),
    'api_errors_24h',   (select count(*) from api_errors where created_at > now() - interval '24 hours'),
    'plays_by_day',     (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'plays', c) order by d), '[]'::jsonb)
                           from (select date_trunc('day', played_at)::date as d, count(*) as c
                                 from listening_history where played_at > now() - interval '14 days'
                                 group by 1) x),
    'top_tracks',       (select coalesce(jsonb_agg(t), '[]'::jsonb)
                           from (select track ->> 'title' as title, track ->> 'artist' as artist, count(*) as plays
                                 from listening_history where played_at > now() - interval '30 days'
                                 group by 1, 2 order by 3 desc limit 10) t)
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════
alter table public.profiles          enable row level security;
alter table public.music_providers   enable row level security;
alter table public.artists           enable row level security;
alter table public.albums            enable row level security;
alter table public.genres            enable row level security;
alter table public.songs             enable row level security;
alter table public.music_rights      enable row level security;
alter table public.playlists         enable row level security;
alter table public.playlist_songs    enable row level security;
alter table public.favorites         enable row level security;
alter table public.listening_history enable row level security;
alter table public.user_preferences  enable row level security;
alter table public.api_errors        enable row level security;

-- profiles: you see and edit yourself; admins see and manage everyone.
create policy "profiles: read own or admin"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own"          on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin update"        on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- reference data: readable by everyone (guests included), writable by admins only.
create policy "providers: public read"  on public.music_providers for select using (true);
create policy "providers: admin write"  on public.music_providers for all using (public.is_admin()) with check (public.is_admin());

create policy "artists: public read"    on public.artists for select using (true);
create policy "artists: admin write"    on public.artists for all using (public.is_admin()) with check (public.is_admin());

create policy "albums: public read"     on public.albums for select using (true);
create policy "albums: admin write"     on public.albums for all using (public.is_admin()) with check (public.is_admin());

create policy "genres: public read"     on public.genres for select using (enabled or public.is_admin());
create policy "genres: admin write"     on public.genres for all using (public.is_admin()) with check (public.is_admin());

-- songs: guests only ever see publicly approved songs.
create policy "songs: public read approved" on public.songs for select using (is_public or public.is_admin());
create policy "songs: admin write"          on public.songs for all using (public.is_admin()) with check (public.is_admin());

-- music_rights: readable so every client can honour blocks; only admins decide.
create policy "rights: public read"  on public.music_rights for select using (true);
create policy "rights: admin write"  on public.music_rights for all using (public.is_admin()) with check (public.is_admin());

-- playlists: private by default; owners manage their own; admins manage all.
create policy "playlists: read own, public or admin" on public.playlists for select
  using (owner_id = auth.uid() or is_public or public.is_admin());
create policy "playlists: insert own" on public.playlists for insert
  with check (owner_id = auth.uid() and public.is_active_user() and (not is_editorial or public.is_admin()));
create policy "playlists: update own" on public.playlists for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_active_user() and (not is_editorial or public.is_admin()));
create policy "playlists: delete own" on public.playlists for delete using (owner_id = auth.uid());
create policy "playlists: admin all"  on public.playlists for all using (public.is_admin()) with check (public.is_admin());

create policy "playlist_songs: read if playlist visible" on public.playlist_songs for select
  using (exists (select 1 from public.playlists p where p.id = playlist_id and (p.owner_id = auth.uid() or p.is_public or public.is_admin())));
create policy "playlist_songs: insert into own" on public.playlist_songs for insert
  with check (public.is_active_user() and exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy "playlist_songs: update own" on public.playlist_songs for update
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy "playlist_songs: delete own" on public.playlist_songs for delete
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
create policy "playlist_songs: admin all" on public.playlist_songs for all using (public.is_admin()) with check (public.is_admin());

-- personal data: strictly the owner.
create policy "favorites: own"   on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
create policy "history: own"     on public.listening_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
create policy "preferences: own" on public.user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- api_errors: any client may report (length-limited by table checks); only admins read/clear.
create policy "api_errors: anyone can report" on public.api_errors for insert with check (true);
create policy "api_errors: admin read"        on public.api_errors for select using (public.is_admin());
create policy "api_errors: admin delete"      on public.api_errors for delete using (public.is_admin());
