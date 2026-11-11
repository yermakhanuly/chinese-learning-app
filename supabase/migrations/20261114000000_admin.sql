-- Phase 10: admin role, content drafts, problem reports, client error log, Stripe subscriptions.

-- --- Admin role ------------------------------------------------------------------------------------
-- Set by hand in the SQL editor (not in the profile column update grant, so nobody can set it from the app).
alter table public.profiles add column is_admin boolean not null default false;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- --- Content edited in the admin dashboard -----------------------------------------------------------
-- Rows changed through the dashboard are marked, so `npm run data:import` (content/ files) doesn't
-- silently overwrite them (it skips marked rows unless run with --overwrite-edits).
alter table public.units add column edited_at timestamptz;
alter table public.lessons add column edited_at timestamptz;
alter table public.words add column edited_at timestamptz;
alter table public.grammar_points add column edited_at timestamptz;
alter table public.reading_texts add column edited_at timestamptz;
alter table public.tutor_scenarios add column edited_at timestamptz;

-- Drafts: an edited copy of a content item, checked and published by the `admin` Edge Function.
create table public.content_drafts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('unit', 'lesson', 'word', 'grammar', 'reading', 'scenario')),
  ref_id       text not null check (char_length(ref_id) between 1 and 80),  -- id of the item (new or existing)
  is_new       boolean not null default false,
  data         jsonb not null,
  status       text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  problems     text[] not null default '{}',                                 -- from the last check
  note         text check (char_length(note) <= 500),
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  checked_at   timestamptz,
  published_at timestamptz
);
create unique index content_drafts_open_idx on public.content_drafts (kind, ref_id) where status = 'draft';
create index content_drafts_status_idx on public.content_drafts (status, updated_at desc);
alter table public.content_drafts enable row level security;
create policy "Admins read drafts" on public.content_drafts for select to authenticated using ((select public.is_admin()));
create policy "Admins add drafts" on public.content_drafts for insert to authenticated
  with check ((select public.is_admin()) and status = 'draft' and created_by = (select auth.uid()));
create policy "Admins edit open drafts" on public.content_drafts for update to authenticated
  using ((select public.is_admin()) and status = 'draft')
  with check ((select public.is_admin()) and status in ('draft', 'discarded'));
create policy "Admins delete drafts" on public.content_drafts for delete to authenticated using ((select public.is_admin()));
revoke truncate on public.content_drafts from anon, authenticated;
revoke all on public.content_drafts from anon;
-- Learners and admins can't mark a draft published or edit its check results: only the function can.
revoke update on public.content_drafts from authenticated;
grant update (data, status, note, updated_at) on public.content_drafts to authenticated;

-- --- Problem reports from learners ---------------------------------------------------------------
create table public.reports (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users on delete set null,
  kind        text not null check (kind in ('lesson', 'word', 'grammar', 'reading', 'tutor', 'audio', 'other')),
  ref         text check (char_length(ref) <= 120),             -- lesson id, word, grammar id, message id…
  category    text not null check (category in ('wrong', 'unclear', 'audio', 'bug', 'other')),
  message     text not null check (char_length(message) between 1 and 1000),
  context     jsonb not null default '{}',                      -- app version, platform, screen
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note  text check (char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_user_idx on public.reports (user_id, created_at desc);
alter table public.reports enable row level security;
create policy "Learners read own reports" on public.reports for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Admins resolve reports" on public.reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, delete, truncate on public.reports from anon, authenticated;
revoke all on public.reports from anon;
revoke update on public.reports from authenticated;
grant update (status, admin_note, resolved_at) on public.reports to authenticated;

-- Reports come in through this function (signed-in learners, at most 20 a day).
create function public.submit_report(p_kind text, p_ref text, p_category text, p_message text, p_context jsonb default '{}')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if (select count(*) from public.reports r where r.user_id = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'report limit reached' using errcode = '53400';
  end if;
  if char_length(coalesce(p_context::text, '')) > 2000 then
    raise exception 'context too large' using errcode = '22023';
  end if;
  insert into public.reports (user_id, kind, ref, category, message, context)
  values (auth.uid(), p_kind, nullif(trim(p_ref), ''), p_category, trim(p_message), coalesce(p_context, '{}'))
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.submit_report(text, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_report(text, text, text, text, jsonb) to authenticated;

-- --- Client errors (our own error monitoring: no third-party service) -----------------------------
create table public.client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users on delete set null,
  source     text not null check (source in ('app', 'function')),
  message    text not null check (char_length(message) <= 1000),
  stack      text check (char_length(stack) <= 4000),
  context    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
create policy "Admins read errors" on public.client_errors for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete, truncate on public.client_errors from anon, authenticated;
revoke all on public.client_errors from anon;

-- Anyone (also signed out) may log an error; at most 30 per user / 300 per hour overall.
create function public.log_client_error(p_message text, p_stack text default null, p_context jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.client_errors e where e.created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  if auth.uid() is not null and (select count(*) from public.client_errors e
      where e.user_id = auth.uid() and e.created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.client_errors (user_id, source, message, stack, context)
  values (auth.uid(), 'app', left(coalesce(p_message, '(no message)'), 1000), left(p_stack, 4000),
          case when char_length(coalesce(p_context::text, '')) <= 2000 then coalesce(p_context, '{}') else '{}' end);
end;
$$;
revoke execute on function public.log_client_error(text, text, jsonb) from public;
grant execute on function public.log_client_error(text, text, jsonb) to anon, authenticated;

-- --- Stripe subscriptions (written by the stripe-webhook Edge Function) ------------------------------
create table public.subscriptions (
  user_id                uuid primary key references auth.users on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  plan                   text check (plan in ('monthly', 'yearly')),
  status                 text not null,                -- Stripe status: trialing, active, past_due, canceled, …
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "Learners read own subscription" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
revoke all on public.subscriptions from anon;

-- Premium: switched on by hand (profiles.premium_until) or by a live subscription.
create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.premium_until > now() from public.profiles p where p.id = p_user), false)
      or exists (select 1 from public.subscriptions s
                 where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due')
                   and coalesce(s.current_period_end, now() + interval '1 day') > now());
$$;

-- The app asks this (learners can't call is_premium(uuid) for other people).
create function public.my_premium()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'premium', public.is_premium((select auth.uid())),
    'manual_until', (select p.premium_until from public.profiles p where p.id = (select auth.uid())),
    'subscription', (select to_jsonb(s) - 'user_id' - 'stripe_customer_id' - 'stripe_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid()))
  );
$$;
revoke execute on function public.my_premium() from public, anon;
grant execute on function public.my_premium() to authenticated;

-- --- Admin views and actions (each checks is_admin) --------------------------------------------------
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'learners', (select count(*) from public.profiles),
    'active_7d', (select count(distinct a.user_id) from public.activity a where a.created_at > now() - interval '7 days'),
    'premium', (select count(*) from public.profiles p where public.is_premium(p.id)),
    'subscribers', (select count(*) from public.subscriptions s where s.status in ('trialing', 'active', 'past_due')),
    'open_reports', (select count(*) from public.reports r where r.status = 'open'),
    'errors_24h', (select count(*) from public.client_errors e where e.created_at > now() - interval '1 day'),
    'open_drafts', (select count(*) from public.content_drafts d where d.status = 'draft'),
    'tutor_tokens_today', (select coalesce(sum(u.input_tokens + u.output_tokens), 0) from public.tutor_usage u where u.day = current_date),
    'tutor_tokens_30d', (select coalesce(sum(u.input_tokens + u.output_tokens), 0) from public.tutor_usage u where u.day > current_date - 30)
  );
end;
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create function public.admin_learners(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, email text, display_name text, created_at timestamptz, last_active timestamptz, total_xp bigint,
  premium boolean, premium_until timestamptz, subscription_status text, is_admin boolean,
  tutor_input_30d bigint, tutor_output_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, u.created_at,
           (select max(a.created_at) from public.activity a where a.user_id = p.id),
           (select coalesce(sum(a.xp), 0)::bigint from public.activity a where a.user_id = p.id),
           public.is_premium(p.id), p.premium_until,
           (select s.status from public.subscriptions s where s.user_id = p.id),
           p.is_admin,
           (select coalesce(sum(t.input_tokens), 0)::bigint from public.tutor_usage t where t.user_id = p.id and t.day > current_date - 30),
           (select coalesce(sum(t.output_tokens), 0)::bigint from public.tutor_usage t where t.user_id = p.id and t.day > current_date - 30)
    from public.profiles p join auth.users u on u.id = p.id
    where coalesce(p_search, '') = ''
       or u.email ilike '%' || p_search || '%'
       or p.display_name ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function public.admin_learners(text, integer, integer) from public, anon;
grant execute on function public.admin_learners(text, integer, integer) to authenticated;

-- Switch manual Premium on (until a date) or off (null). Subscriptions are separate.
create function public.admin_set_premium(p_user uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.profiles set premium_until = p_until where id = p_user;
end;
$$;
revoke execute on function public.admin_set_premium(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_premium(uuid, timestamptz) to authenticated;

-- Fields authors write that the checks need when an item is edited in the dashboard (the import
-- used to drop them): words a grammar point teaches, names in a reading, names and extra words of a scenario.
alter table public.grammar_points add column words text[] not null default '{}';
alter table public.reading_texts add column names text[] not null default '{}';
alter table public.tutor_scenarios add column names text[] not null default '{}';
alter table public.tutor_scenarios add column words text[] not null default '{}';

-- A small lexicon for the texts being published: HSK words and CC-CEDICT entries for the given
-- strings (the `admin` Edge Function passes every substring the word splitter could use).
create function public.lexicon_entries(p_words text[])
returns table (source text, simplified text, traditional text, pinyin text, pinyin_numeric text, hsk_level smallint,
               meanings text[], classifiers text[])
language sql
stable
set search_path = ''
as $$
  select 'hsk', w.simplified, w.traditional, w.pinyin, w.pinyin_numeric, w.hsk_level, w.meanings, w.classifiers
  from public.words w where w.simplified = any(p_words)
  union all
  select 'cedict', d.simplified, d.traditional, d.pinyin, d.pinyin_numeric, null, d.definitions, '{}'::text[]
  from (select * from public.dictionary_entries e where e.simplified = any(p_words) order by e.id) d;
$$;
revoke execute on function public.lexicon_entries(text[]) from public, anon, authenticated;
grant execute on function public.lexicon_entries(text[]) to service_role;

-- Characters (of the given ones) that appear in some HSK word up to a level.
create function public.known_characters(p_chars text[], p_level smallint)
returns setof text
language sql
stable
set search_path = ''
as $$
  select c from unnest(p_chars) c
  where exists (select 1 from public.words w where w.hsk_level <= p_level and strpos(w.simplified, c) > 0);
$$;
revoke execute on function public.known_characters(text[], smallint) from public, anon, authenticated;
grant execute on function public.known_characters(text[], smallint) to service_role;
