-- Phase 9: AI tutor (premium). Conversations, role-play scenarios, usage records, XP for practice.
-- Everything here is written by the `tutor` Edge Function with the service role; learners only read
-- their own rows (and may delete their own conversations).

-- --- Premium -----------------------------------------------------------------------------------
-- Set by the server only (by hand until Phase 10 connects payments). Not in the column update grant
-- from 20261105000000_profiles.sql, so learners can't give themselves premium.
alter table public.profiles add column premium_until timestamptz;

create function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.premium_until > now() from public.profiles p where p.id = p_user), false);
$$;
revoke execute on function public.is_premium(uuid) from public, anon, authenticated;
grant execute on function public.is_premium(uuid) to service_role;

-- --- Role-play scenarios (content/tutor/scenarios.json, imported like lessons) ------------------
create table public.tutor_scenarios (
  id           text primary key,          -- restaurant, doctor, …
  hsk_level    smallint not null check (hsk_level between 1 and 6),
  position     smallint not null,
  title        text not null,
  emoji        text not null,
  setting      text not null,             -- English: where we are, what's going on
  ai_role      text not null,             -- English: who the tutor plays
  learner_role text not null,             -- English: who the learner is
  voice        text not null check (voice in ('female', 'male')), -- the voice the tutor's lines are read in
  goals        text[] not null,           -- English: what the learner should get done
  opening      jsonb not null,            -- { zh, en }: the tutor's first line
  phrases      jsonb not null,            -- [{ zh, en }]: useful phrases
  readings     jsonb not null default '{}' -- pinyin for every Chinese text: { "你好": Token[] }
);
alter table public.tutor_scenarios enable row level security;
create policy "Anyone reads scenarios" on public.tutor_scenarios for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.tutor_scenarios from anon, authenticated;

-- --- Conversations ------------------------------------------------------------------------------
create table public.tutor_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  mode        text not null check (mode in ('tutor', 'roleplay', 'free')),
  scenario_id text references public.tutor_scenarios on delete set null,
  topic       text check (char_length(topic) <= 80),       -- free conversation: what about
  title       text not null check (char_length(title) <= 80),
  level       smallint not null check (level between 1 and 6), -- the level it was held at
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz,
  feedback    jsonb                                        -- end-of-conversation summary
);
create index tutor_conversations_user_idx on public.tutor_conversations (user_id, updated_at desc);
alter table public.tutor_conversations enable row level security;
create policy "Users read own conversations" on public.tutor_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users delete own conversations" on public.tutor_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, truncate on public.tutor_conversations from anon, authenticated;

create table public.tutor_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.tutor_conversations on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  text            text not null check (char_length(text) <= 4000),
  -- assistant: { pinyin, en } (role-play) / user: { correction: { ok, corrected, explanation, … }, voice }
  data            jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index tutor_messages_conversation_idx on public.tutor_messages (conversation_id, id);
create index tutor_messages_corrections_idx on public.tutor_messages (user_id, created_at desc)
  where role = 'user' and (data -> 'correction' ->> 'ok') = 'false';
alter table public.tutor_messages enable row level security;
create policy "Users read own messages" on public.tutor_messages
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.tutor_messages from anon, authenticated;

-- --- Usage (no limits; recorded so cost can be watched, and for Phase 10's admin pages) ----------
create table public.tutor_usage (
  user_id       uuid not null references auth.users on delete cascade,
  day           date not null default current_date,
  requests      integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);
alter table public.tutor_usage enable row level security;
create policy "Users read own usage" on public.tutor_usage
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.tutor_usage from anon, authenticated;

create function public.record_tutor_usage(p_user uuid, p_input integer, p_output integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tutor_usage as u (user_id, day, requests, input_tokens, output_tokens)
  values (p_user, current_date, 1, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (user_id, day) do update
    set requests = u.requests + 1,
        input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens;
$$;
revoke execute on function public.record_tutor_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.record_tutor_usage(uuid, integer, integer) to service_role;

-- --- What the tutor knows about the learner (adaptive difficulty) ---------------------------------
-- level: the higher of the self-rated level and the highest HSK level with a finished lesson.
-- pace: 'easier' when recent review accuracy is low, 'harder' when it is high, else 'level'.
create function public.tutor_context(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with acc as (
    select count(*) as n, round(100.0 * count(*) filter (where r.rating > 1) / nullif(count(*), 0)) as pct
    from public.review_log r
    where r.user_id = p_user and r.reviewed_at > now() - interval '30 days'
  ), lvl as (
    select greatest(
      (select case p.self_level when 'elementary' then 2 when 'intermediate' then 3 when 'advanced' then 4 else 1 end
       from public.profiles p where p.id = p_user),
      (select max(u.hsk_level) from public.lesson_progress lp
       join public.lessons l on l.id = lp.lesson_id join public.units u on u.id = l.unit_id
       where lp.user_id = p_user),
      1) as level
  )
  select jsonb_build_object(
    'name', (select p.display_name from public.profiles p where p.id = p_user),
    'goal', (select p.learning_goal from public.profiles p where p.id = p_user),
    'level', (select least(level, 6) from lvl),
    'accuracy', (select pct from acc),
    'pace', (select case when n >= 20 and pct < 70 then 'easier' when n >= 50 and pct >= 90 then 'harder' else 'level' end from acc),
    'known_words', (select coalesce(jsonb_agg(w.word), '[]') from (
                      select c.word from public.review_cards c
                      where c.user_id = p_user and c.kind = 'word' and c.reps > 0 and c.word is not null
                      group by c.word order by max(c.last_review_at) desc nulls last limit 400) w),
    'recent_words', (select coalesce(jsonb_agg(w.word), '[]') from (
                       select c.word from public.review_cards c
                       where c.user_id = p_user and c.kind = 'word' and c.word is not null
                       group by c.word order by max(c.created_at) desc limit 30) w),
    'weak_words', (select coalesce(jsonb_agg(w.word), '[]') from (
                     select m.word from public.mistakes m
                     where m.user_id = p_user and m.word is not null and m.created_at > now() - interval '30 days'
                     group by m.word order by count(*) desc limit 15) w)
  );
$$;
revoke execute on function public.tutor_context(uuid) from public, anon, authenticated;
grant execute on function public.tutor_context(uuid) to service_role;

-- --- XP: 2 XP per message the learner sends (at most 60 messages a day count) --------------------
alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('lesson', 'review', 'grammar', 'reading', 'listening', 'tones', 'characters',
                  'pronunciation', 'mock', 'conversation', 'ai_quiz'));

create function public.activity_from_tutor_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'user' then
    return new;
  end if;
  if (select count(*) from public.activity a
      where a.user_id = new.user_id and a.kind = 'conversation' and a.created_at > now() - interval '1 day') >= 60 then
    return new;
  end if;
  perform public.log_activity(new.user_id, 'conversation', 2, 45, null, null, new.conversation_id::text);
  return new;
end;
$$;
revoke execute on function public.activity_from_tutor_message() from public, anon, authenticated;
create trigger tutor_messages_activity after insert on public.tutor_messages
  for each row execute function public.activity_from_tutor_message();

-- Generated quizzes report through complete_quiz like the other quizzes (1 XP per right answer).
create or replace function public.complete_quiz(p_kind text, p_ref text, p_correct smallint, p_total smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind not in ('listening', 'tones', 'characters', 'ai_quiz') then
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

-- --- Voice replies: MP3s in a private bucket, handed out as short-lived signed URLs ----------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-audio', 'tutor-audio', false, 2097152, array['audio/mpeg'])
on conflict (id) do nothing;
