-- When each account was last active (updated by the API at most every few minutes), so the admin
-- console can show who is using the app. Also an index for "newest users" lists.
alter table profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_created_idx on profiles (created_at desc);
create index if not exists profiles_last_seen_idx on profiles (last_seen_at desc nulls last);
create index if not exists favorites_user_idx on favorites (user_id, created_at desc);

-- accounts that existed before this column: use their newest session as a first value
update profiles p set last_seen_at = s.latest
  from (select user_id, max(created_at) as latest from sessions group by user_id) s
 where s.user_id = p.id and p.last_seen_at is null;
