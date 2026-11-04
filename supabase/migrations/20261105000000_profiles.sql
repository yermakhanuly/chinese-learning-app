-- Phase 1: learner profiles, avatars, account deletion.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 50),
  avatar_url text,
  learning_goal text check (learning_goal in ('travel', 'business', 'hsk_exam', 'study_abroad', 'casual')),
  self_level text check (self_level in ('beginner', 'elementary', 'intermediate', 'advanced')),
  daily_goal_minutes smallint not null default 10 check (daily_goal_minutes in (5, 10, 15, 20, 30)),
  script text not null default 'simplified' check (script in ('simplified', 'traditional')),
  explanation_language text not null default 'en' check (explanation_language in ('en')),
  onboarded_at timestamptz,
  tutorial_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke insert, delete, truncate on public.profiles from anon, authenticated;
revoke all on public.profiles from anon;
-- Clients may not forge timestamps or ids.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, learning_goal, self_level, daily_goal_minutes, script,
              explanation_language, onboarded_at, tutorial_completed_at)
  on public.profiles to authenticated;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new auth user gets a profile row (name/avatar from sign-up data or Google).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name',
                              new.raw_user_meta_data ->> 'full_name',
                              new.raw_user_meta_data ->> 'name')), ''), 50),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deletes the caller's account; profile rows cascade. Avatar files are removed by the client first
-- (storage objects can only be deleted through the Storage API).
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Avatars: public read, each user writes only inside their own folder "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users list own avatar" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
