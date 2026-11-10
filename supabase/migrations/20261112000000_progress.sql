-- Phase 8: activity + XP, daily goal, streaks, weekly leaderboard, mock HSK tests.
--
-- Every activity row is written by the database itself (triggers on the tables the existing save
-- functions write, plus complete_quiz / complete_mock), so XP can't be faked by a client.

-- ---------------------------------------------------------------------------
-- Profile settings

alter table public.profiles
  add column daily_goal_xp smallint not null default 20 check (daily_goal_xp in (10, 20, 30, 50)),
  add column leaderboard_opt_in boolean not null default false,
  add column time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64);

-- Carry over the minutes goal chosen during onboarding.
update public.profiles set daily_goal_xp = case
  when daily_goal_minutes <= 5 then 10 when daily_goal_minutes <= 10 then 20
  when daily_goal_minutes <= 15 then 30 else 50 end;

grant update (daily_goal_xp, leaderboard_opt_in, time_zone) on public.profiles to authenticated;

/** The caller's local date for a timestamp (falls back to UTC for an unknown zone name). */
create function public.local_day(p_at timestamptz, p_zone text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return (p_at at time zone p_zone)::date;
exception when others then
  return (p_at at time zone 'UTC')::date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity log

create table public.activity (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('lesson', 'review', 'grammar', 'reading', 'listening', 'tones',
                                           'characters', 'pronunciation', 'mock')),
  xp         smallint not null check (xp between 0 and 100),
  seconds    integer not null check (seconds between 0 and 7200),   -- estimated study time
  correct    smallint,
  total      smallint,
  ref        text,                                                   -- lesson / point / text id …
  created_at timestamptz not null default now()
);

create index activity_user_time_idx on public.activity (user_id, created_at desc);
create index activity_time_idx on public.activity (created_at);

alter table public.activity enable row level security;
create policy "Learners see their activity" on public.activity
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.activity from anon;
revoke insert, update, delete, truncate on public.activity from authenticated;

create function public.log_activity(
  p_user uuid, p_kind text, p_xp integer, p_seconds integer, p_correct integer, p_total integer, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (user_id, kind, xp, seconds, correct, total, ref)
  values (p_user, p_kind, p_xp, p_seconds, p_correct, p_total, p_ref);
$$;

revoke execute on function public.log_activity(uuid, text, integer, integer, integer, integer, text) from public, anon, authenticated;

-- Lessons: 10 XP (+5 for 80 % or more) the first time, 5 XP for a repeat.
create function public.activity_from_lesson() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  mins integer;
begin
  select l.minutes into mins from public.lessons l where l.id = new.lesson_id;
  perform public.log_activity(new.user_id, 'lesson',
    case when tg_op = 'INSERT' then 10 + case when new.last_score >= 80 then 5 else 0 end else 5 end,
    coalesce(mins, 5) * 60, new.last_score, 100, new.lesson_id);
  return new;
end;
$$;
create trigger lesson_progress_activity after insert or update on public.lesson_progress
  for each row execute function public.activity_from_lesson();

-- Review answers: 2 XP for a new card, 1 XP otherwise; "Again" counts as wrong.
create function public.activity_from_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.user_id, 'review', case when new.state = 0 then 2 else 1 end, 12,
    case when new.rating > 1 then 1 else 0 end, 1, null);
  return new;
end;
$$;
create trigger review_log_activity after insert on public.review_log
  for each row execute function public.activity_from_review();

-- Grammar practice: 8 XP (+2 for 80 % or more).
create function public.activity_from_grammar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  select jsonb_array_length(g.exercises) into n from public.grammar_points g where g.id = new.grammar_id;
  perform public.log_activity(new.user_id, 'grammar', 8 + case when new.last_score >= 80 then 2 else 0 end,
    coalesce(n, 8) * 20, new.last_score, 100, new.grammar_id);
  return new;
end;
$$;
create trigger grammar_progress_activity after insert or update on public.grammar_progress
  for each row execute function public.activity_from_grammar();

-- Reading: 10 XP (+ up to 4 for the questions); time from the text length.
create function public.activity_from_reading() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chars integer;
begin
  select t.char_count into chars from public.reading_texts t where t.id = new.text_id;
  perform public.log_activity(new.user_id, 'reading', 10 + new.last_score / 25,
    least(1800, 60 + coalesce(chars, 100) * 2), new.last_score, 100, new.text_id);
  return new;
end;
$$;
create trigger reading_progress_activity after insert or update on public.reading_progress
  for each row execute function public.activity_from_reading();

-- Pronunciation checks: 2 XP each (the Edge Function takes the quota once per check).
create function public.activity_from_pronunciation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.user_id, 'pronunciation', 2, 30, null, null, null);
  return new;
end;
$$;
create trigger pronunciation_usage_activity after insert or update on public.pronunciation_usage
  for each row execute function public.activity_from_pronunciation();

/**
 * Finished quiz without its own table (listening, tone, character quizzes): 1 XP per right answer.
 * At most 40 quizzes a day count, so XP can't be farmed.
 */
create function public.complete_quiz(p_kind text, p_ref text, p_correct smallint, p_total smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind not in ('listening', 'tones', 'characters') then
    raise exception 'unknown quiz kind' using errcode = '22023';
  end if;
  if p_total not between 1 and 20 or p_correct not between 0 and p_total or char_length(coalesce(p_ref, '')) > 40 then
    raise exception 'invalid quiz result' using errcode = '22023';
  end if;
  if (select count(*) from public.activity a
      where a.user_id = auth.uid() and a.kind = p_kind and a.created_at > now() - interval '1 day') >= 40 then
    return;
  end if;
  perform public.log_activity(auth.uid(), p_kind, p_correct, p_total * 10, p_correct, p_total, p_ref);
end;
$$;

revoke execute on function public.complete_quiz(text, text, smallint, smallint) from public, anon;
grant execute on function public.complete_quiz(text, text, smallint, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Mock HSK tests (content from content/mock/; read-only) and results

create table public.mock_tests (
  id        text primary key,               -- hsk1, hsk2
  hsk_level smallint not null,
  title     text not null,
  minutes   smallint not null,
  sections  jsonb not null,                 -- src/lib/mock-test.ts MockSection[]
  readings  jsonb not null default '{}'
);

alter table public.mock_tests enable row level security;
create policy "Mock tests are readable by everyone" on public.mock_tests for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.mock_tests from anon, authenticated;

create table public.mock_results (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  test_id     text not null references public.mock_tests on delete cascade,
  listening   smallint not null check (listening between 0 and 100),
  reading     smallint not null check (reading between 0 and 100),
  total       smallint generated always as (listening + reading) stored,
  created_at  timestamptz not null default now()
);

create index mock_results_user_idx on public.mock_results (user_id, created_at desc);

alter table public.mock_results enable row level security;
create policy "Learners see their mock results" on public.mock_results
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.mock_results from anon;
revoke insert, update, delete, truncate on public.mock_results from authenticated;

/** Saves a finished mock test (section scores out of 100, as on the real HSK 1–2): 30 XP. */
create function public.complete_mock(p_test_id text, p_listening smallint, p_reading smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mins integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_listening not between 0 and 100 or p_reading not between 0 and 100 then
    raise exception 'scores must be between 0 and 100' using errcode = '22023';
  end if;
  select m.minutes into mins from public.mock_tests m where m.id = p_test_id;
  if mins is null then
    raise exception 'test not found' using errcode = 'P0002';
  end if;
  insert into public.mock_results (user_id, test_id, listening, reading) values (auth.uid(), p_test_id, p_listening, p_reading);
  perform public.log_activity(auth.uid(), 'mock', 30, mins * 60, p_listening + p_reading, 200, p_test_id);
end;
$$;

revoke execute on function public.complete_mock(text, smallint, smallint) from public, anon;
grant execute on function public.complete_mock(text, smallint, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading progress back to the app

/** XP, study time and activity count per local day for the last p_days days (caller's time zone). */
create function public.daily_activity(p_days integer default 400)
returns table (day date, xp bigint, seconds bigint, activities bigint)
language sql
stable
set search_path = ''
as $$
  with me as (select coalesce((select p.time_zone from public.profiles p where p.id = (select auth.uid())), 'UTC') as tz)
  select public.local_day(a.created_at, me.tz) as day, sum(a.xp), sum(a.seconds), count(*)
  from public.activity a, me
  where a.user_id = (select auth.uid()) and a.created_at > now() - make_interval(days => least(greatest(p_days, 1), 800) + 1)
  group by 1
  order by 1;
$$;

/** Activity counts and XP per kind since a moment (for challenges and the weekly report). */
create function public.activity_counts(p_since timestamptz)
returns table (kind text, activities bigint, xp bigint, correct bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  select a.kind, count(*), sum(a.xp), coalesce(sum(a.correct), 0), coalesce(sum(a.total), 0)
  from public.activity a
  where a.user_id = (select auth.uid()) and a.created_at >= p_since
  group by a.kind;
$$;

/** Totals for the dashboard and badges. */
create function public.progress_stats()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select jsonb_build_object(
    'total_xp', (select coalesce(sum(a.xp), 0) from public.activity a, me where a.user_id = me.uid),
    'total_seconds', (select coalesce(sum(a.seconds), 0) from public.activity a, me where a.user_id = me.uid),
    'lessons', (select count(*) from public.lesson_progress l, me where l.user_id = me.uid),
    'perfect_lessons', (select count(*) from public.lesson_progress l, me where l.user_id = me.uid and l.best_score = 100),
    'reviews', (select count(*) from public.review_log r, me where r.user_id = me.uid),
    'review_accuracy', (select round(100.0 * count(*) filter (where r.rating > 1) / nullif(count(*), 0))
                        from public.review_log r, me where r.user_id = me.uid and r.reviewed_at > now() - interval '30 days'),
    'words_learned', (select count(distinct c.word) from public.review_cards c, me
                      where c.user_id = me.uid and c.kind = 'word' and c.reps > 0),
    'words_mastered', (select count(*) from (
                         select c.word from public.review_cards c, me
                         where c.user_id = me.uid and c.kind = 'word' group by c.word
                         having min(c.stability) >= 21 and min(c.reps) > 0) w),
    'words_by_level', (select coalesce(jsonb_object_agg(lv, n), '{}') from (
                         select c.hsk_level as lv, count(distinct c.word) as n from public.review_cards c, me
                         where c.user_id = me.uid and c.kind = 'word' and c.reps > 0 and c.hsk_level is not null
                         group by c.hsk_level) x),
    'characters_written', (select count(*) from public.review_cards c, me
                           where c.user_id = me.uid and c.kind = 'character' and c.reps > 0),
    'grammar_practised', (select count(*) from public.grammar_progress g, me where g.user_id = me.uid),
    'grammar_by_level', (select coalesce(jsonb_object_agg(lv, jsonb_build_object('points', n, 'avg', av)), '{}') from (
                           select p.hsk_level as lv, count(*) as n, round(avg(g.best_score)) as av
                           from public.grammar_progress g join public.grammar_points p on p.id = g.grammar_id, me
                           where g.user_id = me.uid group by p.hsk_level) x),
    'readings', (select count(*) from public.reading_progress r, me where r.user_id = me.uid),
    'reading_avg', (select round(avg(r.best_score)) from public.reading_progress r, me where r.user_id = me.uid),
    'pronunciation_checks', (select count(*) from public.activity a, me where a.user_id = me.uid and a.kind = 'pronunciation'),
    'skills', (select coalesce(jsonb_object_agg(k, jsonb_build_object('activities', n, 'correct', c, 'total', t)), '{}') from (
                 select a.kind as k, count(*) as n, coalesce(sum(a.correct), 0) as c, coalesce(sum(a.total), 0) as t
                 from public.activity a, me where a.user_id = me.uid group by a.kind) x),
    'mock_best', (select coalesce(jsonb_object_agg(t, b), '{}') from (
                    select m.test_id as t, max(m.total) as b from public.mock_results m, me
                    where m.user_id = me.uid group by m.test_id) x)
  );
$$;

/** The latest activities, newest first. */
create function public.recent_activity(p_limit integer default 20)
returns table (kind text, xp smallint, correct smallint, total smallint, ref text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.kind, a.xp, a.correct, a.total, a.ref, a.created_at
  from public.activity a
  where a.user_id = (select auth.uid())
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

/**
 * This week's XP (Monday 00:00 in the caller's time zone) of learners who joined the leaderboard,
 * top 50, plus the caller's own row when they joined. Only display name and avatar are shown.
 */
create function public.weekly_leaderboard()
returns table (rank bigint, display_name text, avatar_url text, xp bigint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.leaderboard_opt_in as joined, coalesce(p.time_zone, 'UTC') as tz
    from public.profiles p where p.id = (select auth.uid())
  ),
  week as (
    select (date_trunc('week', now() at time zone (select tz from me)) at time zone (select tz from me)) as start
  ),
  scores as (
    select p.id, p.display_name, p.avatar_url, coalesce(sum(a.xp), 0) as xp
    from public.profiles p
    join public.activity a on a.user_id = p.id and a.created_at >= (select start from week)
    where p.leaderboard_opt_in
    group by p.id, p.display_name, p.avatar_url
  ),
  ranked as (
    select s.*, rank() over (order by s.xp desc) as rank from scores s
  )
  select r.rank, coalesce(nullif(trim(r.display_name), ''), 'Learner'), r.avatar_url, r.xp, r.id = (select id from me)
  from ranked r
  where (select joined from me) and (r.rank <= 50 or r.id = (select id from me))
  order by r.rank, r.display_name;
$$;

revoke execute on function public.daily_activity(integer) from public, anon;
revoke execute on function public.activity_counts(timestamptz) from public, anon;
revoke execute on function public.progress_stats() from public, anon;
revoke execute on function public.recent_activity(integer) from public, anon;
revoke execute on function public.weekly_leaderboard() from public, anon;
grant execute on function public.daily_activity(integer) to authenticated;
grant execute on function public.activity_counts(timestamptz) to authenticated;
grant execute on function public.progress_stats() to authenticated;
grant execute on function public.recent_activity(integer) to authenticated;
grant execute on function public.weekly_leaderboard() to authenticated;
