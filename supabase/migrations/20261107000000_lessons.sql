-- Phase 3: HSK course (units → lessons), learner progress, placement result.

-- ---------------------------------------------------------------------------
-- Course content (written by the import script from content/hsk*/; read-only to the app)

create table public.units (
  id          text primary key,              -- hsk1-u01
  hsk_level   smallint not null check (hsk_level between 1 and 7),
  position    smallint not null,
  title       text not null,
  title_zh    text not null,
  theme       text references public.topics on delete set null,
  description text not null
);

create index units_level_idx on public.units (hsk_level, position);

create table public.lessons (
  id        text primary key,                -- hsk1-u01-l1, hsk1-u01-quiz
  unit_id   text not null references public.units on delete cascade,
  position  smallint not null,
  title     text not null,
  kind      text not null check (kind in ('lesson', 'quiz')),
  words     text[] not null default '{}',     -- words this lesson introduces
  steps     jsonb not null,                   -- src/lib/lessons.ts Step[]
  -- Pinyin/traditional for every Chinese text in the steps, keyed by the text: { "你好": Token[] }
  readings  jsonb not null default '{}',
  -- Dictionary details for the introduced words (pinyin, meanings, example): { "你好": {...} }
  word_details jsonb not null default '{}',
  minutes   smallint not null
);

create index lessons_unit_idx on public.lessons (unit_id, position);

alter table public.units enable row level security;
alter table public.lessons enable row level security;

create policy "Units are readable by everyone" on public.units for select to anon, authenticated using (true);
create policy "Lessons are readable by everyone" on public.lessons for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.units, public.lessons from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Learner progress: one row per finished lesson. Written only through complete_lesson().

create table public.lesson_progress (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id    text not null references public.lessons on delete cascade,
  best_score   smallint not null check (best_score between 0 and 100),
  last_score   smallint not null check (last_score between 0 and 100),
  attempts     integer not null default 1,
  completed_at timestamptz not null default now(),  -- first completion
  updated_at   timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

create policy "Learners see their own progress" on public.lesson_progress
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.lesson_progress from anon, authenticated;
revoke all on public.lesson_progress from anon;

/** Records a finished lesson for the caller: keeps the best score and counts attempts. */
create function public.complete_lesson(p_lesson_id text, p_score smallint)
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.lesson_progress;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100' using errcode = '22023';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, best_score, last_score)
  values (auth.uid(), p_lesson_id, p_score, p_score)
  on conflict (user_id, lesson_id) do update
    set best_score = greatest(public.lesson_progress.best_score, excluded.best_score),
        last_score = excluded.last_score,
        attempts = public.lesson_progress.attempts + 1,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.complete_lesson(text, smallint) from public, anon;
grant execute on function public.complete_lesson(text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Placement test result on the profile: where the learner's path starts.

alter table public.profiles
  add column start_lesson_id text references public.lessons on delete set null,
  add column placed_at timestamptz;

grant update (start_lesson_id, placed_at) on public.profiles to authenticated;
