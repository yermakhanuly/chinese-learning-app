-- Phase 7: grammar library, graded reading, grammar review cards, grammar mistakes.

-- ---------------------------------------------------------------------------
-- Content (written by the import script from content/grammar/ and content/reading/; read-only)

create table public.grammar_points (
  id          text primary key,               -- g1-shi
  hsk_level   smallint not null check (hsk_level between 1 and 7),
  position    smallint not null,
  title       text not null,
  topic       text not null,
  summary     text not null,
  structure   text[] not null,
  explanation text not null,
  examples    jsonb not null,                 -- [{ zh, en }]
  mistakes    jsonb not null,                 -- [{ wrong, right, why }]
  related     text[] not null default '{}',
  exercises   jsonb not null,                 -- src/lib/grammar.ts GrammarExercise[]
  readings    jsonb not null default '{}',    -- pinyin/traditional per Chinese text: { "我是老师。": Token[] }
  lessons     text[] not null default '{}'    -- lessons whose grammar note this point expands on
);

create index grammar_points_level_idx on public.grammar_points (hsk_level, position);

create table public.reading_texts (
  id           text primary key,              -- r1-01
  hsk_level    smallint not null check (hsk_level between 1 and 7),
  position     smallint not null,
  kind         text not null check (kind in ('story', 'dialogue')),
  title        text not null,
  title_zh     text not null,
  summary      text not null,
  speakers     jsonb not null default '[]',   -- [{ name, voice }]
  sentences    jsonb not null,                -- [{ zh, en, speaker? }]
  questions    jsonb not null,                -- [{ prompt, options, answer, why }]
  new_words    jsonb not null default '[]',   -- [{ word, en }]
  grammar      text[] not null default '{}',  -- grammar points it practises
  readings     jsonb not null default '{}',
  -- Pinyin + meanings of every word in the text, for tap-to-translate: { "喜欢": { pinyin, meanings, level } }
  word_details jsonb not null default '{}',
  char_count   smallint not null
);

create index reading_texts_level_idx on public.reading_texts (hsk_level, position);

alter table public.grammar_points enable row level security;
alter table public.reading_texts enable row level security;
create policy "Grammar is readable by everyone" on public.grammar_points for select to anon, authenticated using (true);
create policy "Readings are readable by everyone" on public.reading_texts for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.grammar_points, public.reading_texts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Progress: one row per practised point / read text. Written only through the functions below.

create table public.grammar_progress (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  grammar_id   text not null references public.grammar_points on delete cascade,
  best_score   smallint not null check (best_score between 0 and 100),
  last_score   smallint not null check (last_score between 0 and 100),
  attempts     integer not null default 1,
  completed_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, grammar_id)
);

create table public.reading_progress (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  text_id      text not null references public.reading_texts on delete cascade,
  best_score   smallint not null check (best_score between 0 and 100),
  last_score   smallint not null check (last_score between 0 and 100),
  attempts     integer not null default 1,
  completed_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, text_id)
);

alter table public.grammar_progress enable row level security;
alter table public.reading_progress enable row level security;
create policy "Learners see their grammar progress" on public.grammar_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Learners see their reading progress" on public.reading_progress
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.grammar_progress, public.reading_progress from anon;
revoke insert, update, delete, truncate on public.grammar_progress, public.reading_progress from authenticated;

-- ---------------------------------------------------------------------------
-- Grammar mistakes: the mistake notebook gets rows for missed grammar exercises (no word).

alter table public.mistakes alter column word drop not null;
alter table public.mistakes
  add column grammar_id text references public.grammar_points on delete cascade,
  add column exercise smallint;
alter table public.mistakes drop constraint mistakes_source_check;
alter table public.mistakes add constraint mistakes_source_check check (source in ('lesson', 'review', 'grammar'));
alter table public.mistakes add constraint mistakes_subject_check check ((word is null) <> (grammar_id is null));

create index mistakes_user_grammar_idx on public.mistakes (user_id, grammar_id, created_at desc) where grammar_id is not null;

/** Words missed at least 3 times in the last 30 days (grammar rows aren't words). */
create or replace function public.weak_words()
returns table (word text, misses bigint)
language sql
stable
set search_path = ''
as $$
  select m.word, count(*) as misses
  from public.mistakes m
  where m.user_id = (select auth.uid()) and m.word is not null and m.created_at > now() - interval '30 days'
  group by m.word
  having count(*) >= 3;
$$;

create or replace function public.mistake_notebook()
returns table (word text, misses bigint, recent_misses bigint, last_missed_at timestamptz, weak boolean, content jsonb)
language sql
stable
set search_path = ''
as $$
  select m.word,
         count(*) as misses,
         count(*) filter (where m.created_at > now() - interval '30 days') as recent_misses,
         max(m.created_at) as last_missed_at,
         count(*) filter (where m.created_at > now() - interval '30 days') >= 3 as weak,
         public.card_content('word', m.word, null, null) as content
  from public.mistakes m
  where m.user_id = (select auth.uid()) and m.word is not null
  group by m.word
  order by max(m.created_at) desc
  limit 200;
$$;

/** Grammar points the caller got wrong, most recent first, with the exercises missed. */
create function public.grammar_mistakes()
returns table (grammar_id text, title text, hsk_level smallint, misses bigint, last_missed_at timestamptz, exercises smallint[])
language sql
stable
set search_path = ''
as $$
  select m.grammar_id, g.title, g.hsk_level, count(*) as misses, max(m.created_at) as last_missed_at,
         array_agg(distinct m.exercise) filter (where m.exercise is not null) as exercises
  from public.mistakes m
  join public.grammar_points g on g.id = m.grammar_id
  where m.user_id = (select auth.uid()) and m.grammar_id is not null
  group by m.grammar_id, g.title, g.hsk_level
  order by max(m.created_at) desc
  limit 100;
$$;

revoke execute on function public.grammar_mistakes() from public, anon;
grant execute on function public.grammar_mistakes() to authenticated;

-- ---------------------------------------------------------------------------
-- Saving practice and reading

/** Records a finished grammar practice: best score, attempts, and a mistake per missed exercise. */
create function public.complete_grammar(p_grammar_id text, p_score smallint, p_missed smallint[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100' using errcode = '22023';
  end if;
  select jsonb_array_length(exercises) into n from public.grammar_points where id = p_grammar_id;
  if n is null then
    raise exception 'grammar point not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(p_missed) e where e < 0 or e >= n) or cardinality(p_missed) > n then
    raise exception 'invalid exercise index' using errcode = '22023';
  end if;

  insert into public.grammar_progress (user_id, grammar_id, best_score, last_score)
  values (auth.uid(), p_grammar_id, p_score, p_score)
  on conflict (user_id, grammar_id) do update
    set best_score = greatest(public.grammar_progress.best_score, excluded.best_score),
        last_score = excluded.last_score,
        attempts = public.grammar_progress.attempts + 1,
        updated_at = now();

  insert into public.mistakes (user_id, grammar_id, exercise, source)
  select auth.uid(), p_grammar_id, e, 'grammar' from (select distinct unnest(p_missed) as e) x;
end;
$$;

/** Records a read text with its comprehension score. */
create function public.complete_reading(p_text_id text, p_score smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reading_texts where id = p_text_id) then
    raise exception 'text not found' using errcode = 'P0002';
  end if;
  insert into public.reading_progress (user_id, text_id, best_score, last_score)
  values (auth.uid(), p_text_id, p_score, p_score)
  on conflict (user_id, text_id) do update
    set best_score = greatest(public.reading_progress.best_score, excluded.best_score),
        last_score = excluded.last_score,
        attempts = public.reading_progress.attempts + 1,
        updated_at = now();
end;
$$;

revoke execute on function public.complete_grammar(text, smallint, smallint[]) from public, anon;
revoke execute on function public.complete_reading(text, smallint) from public, anon;
grant execute on function public.complete_grammar(text, smallint, smallint[]) to authenticated;
grant execute on function public.complete_reading(text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Grammar review cards: kind 'grammar', direction 'practice' (one exercise of the point per review).

alter table public.review_cards
  add column grammar_id text references public.grammar_points on delete cascade;

alter table public.review_cards drop constraint review_cards_kind_check;
alter table public.review_cards add constraint review_cards_kind_check
  check (kind in ('word', 'sentence', 'custom', 'character', 'grammar'));
alter table public.review_cards drop constraint review_cards_direction_check;
alter table public.review_cards add constraint review_cards_direction_check
  check (direction in ('read', 'listen', 'recall', 'write', 'practice'));
alter table public.review_cards drop constraint review_cards_source_check;
alter table public.review_cards add constraint review_cards_source_check
  check (source in ('lesson', 'saved', 'sentence', 'custom', 'writing', 'grammar'));
alter table public.review_cards drop constraint review_cards_check;
alter table public.review_cards add constraint review_cards_check check (
  (kind = 'word' and word is not null and sentence_id is null and custom_id is null and character is null
     and grammar_id is null and direction in ('read', 'listen', 'recall'))
  or (kind = 'sentence' and sentence_id is not null and word is null and custom_id is null and character is null
     and grammar_id is null and direction in ('read', 'listen'))
  or (kind = 'custom' and custom_id is not null and word is null and sentence_id is null and character is null
     and grammar_id is null and direction = 'read')
  or (kind = 'character' and character is not null and word is null and sentence_id is null and custom_id is null
     and grammar_id is null and direction = 'write')
  or (kind = 'grammar' and grammar_id is not null and word is null and sentence_id is null and custom_id is null
     and character is null and direction = 'practice')
);

create unique index review_cards_grammar_key on public.review_cards (user_id, grammar_id) where kind = 'grammar';

/** Opt in: practise this grammar point in review. */
create function public.add_grammar_card(p_grammar_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.grammar_points where id = p_grammar_id) then
    raise exception 'grammar point not found' using errcode = 'P0002';
  end if;
  insert into public.review_cards (user_id, kind, direction, grammar_id, source, hsk_level)
  select auth.uid(), 'grammar', 'practice', g.id, 'grammar', g.hsk_level
  from public.grammar_points g where g.id = p_grammar_id
  on conflict (user_id, grammar_id) where kind = 'grammar' do nothing;
end;
$$;

create function public.remove_grammar_card(p_grammar_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.review_cards
  where user_id = auth.uid() and kind = 'grammar' and grammar_id = p_grammar_id;
$$;

revoke execute on function public.add_grammar_card(text) from public, anon;
revoke execute on function public.remove_grammar_card(text) from public, anon;
grant execute on function public.add_grammar_card(text) to authenticated;
grant execute on function public.remove_grammar_card(text) to authenticated;

-- "Again" on a grammar card goes into the mistake notebook as a grammar mistake.
create or replace function public.record_review(p_card_id uuid, p_rating smallint, p_card jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.review_cards;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_rating not between 1 and 4 then
    raise exception 'rating must be 1–4' using errcode = '22023';
  end if;
  select * into old from public.review_cards where id = p_card_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'card not found' using errcode = 'P0002';
  end if;

  update public.review_cards set
    state           = (p_card ->> 'state')::smallint,
    schedule_status = p_card ->> 'scheduleStatus',
    stability       = (p_card ->> 'stability')::double precision,
    stability_fast  = coalesce((p_card ->> 'stabilityFast')::double precision, 0),
    difficulty      = (p_card ->> 'difficulty')::double precision,
    due_at          = (p_card ->> 'dueAt')::timestamptz,
    last_review_at  = (p_card ->> 'lastReviewAt')::timestamptz,
    reps            = (p_card ->> 'reps')::integer,
    lapses          = (p_card ->> 'lapses')::integer,
    scheduled_days  = (p_card ->> 'scheduledDays')::double precision,
    learning_step   = (p_card ->> 'learningStep')::smallint
  where id = p_card_id;

  insert into public.review_log (user_id, card_id, rating, state, due_at)
  values (auth.uid(), p_card_id, p_rating, old.state, old.due_at);

  if p_rating = 1 and old.kind in ('word', 'character') then
    insert into public.mistakes (user_id, word, source) values (auth.uid(), coalesce(old.word, old.character), 'review');
  elsif p_rating = 1 and old.kind = 'grammar' then
    insert into public.mistakes (user_id, grammar_id, source) values (auth.uid(), old.grammar_id, 'review');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Card content and queue, now including grammar cards.

create function public.card_content(
  p_kind text, p_word text, p_sentence_id bigint, p_custom_id uuid, p_character text, p_grammar_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'grammar' then
      (select jsonb_build_object('id', g.id, 'title', g.title, 'summary', g.summary, 'structure', to_jsonb(g.structure),
                                 'exercises', g.exercises, 'readings', g.readings)
       from public.grammar_points g where g.id = p_grammar_id)
    else public.card_content(p_kind, p_word, p_sentence_id, p_custom_id, p_character)
  end;
$$;

revoke execute on function public.card_content(text, text, bigint, uuid, text, text) from public, anon;
grant execute on function public.card_content(text, text, bigint, uuid, text, text) to authenticated;

/** As before, plus the 'grammar' deck and grammar cards. */
create or replace function public.review_queue(p_day_start timestamptz, p_deck text default 'all')
returns table (
  id uuid, kind text, direction text, word text, sentence_id bigint, custom_id uuid,
  state smallint, schedule_status text, stability double precision, stability_fast double precision,
  difficulty double precision, due_at timestamptz, last_review_at timestamptz, reps integer, lapses integer,
  scheduled_days double precision, learning_step smallint, content jsonb
)
language sql
stable
set search_path = ''
as $$
  with deck as (
    select c.* from public.review_cards c
    where c.user_id = (select auth.uid())
      and case
        when p_deck = 'all' or p_deck = 'weak' then true
        when p_deck = 'saved' then c.kind = 'word' and exists (
          select 1 from public.saved_words s where s.user_id = c.user_id and s.word = c.word)
        when p_deck = 'sentences' then c.kind = 'sentence'
        when p_deck = 'custom' then c.kind = 'custom'
        when p_deck = 'writing' then c.kind = 'character'
        when p_deck = 'grammar' then c.kind = 'grammar'
        when p_deck like 'level:%' then c.hsk_level = nullif(substr(p_deck, 7), '')::smallint
        when p_deck like 'unit:%' then c.unit_id = substr(p_deck, 6)
        else false
      end
      and (p_deck <> 'weak' or coalesce(c.word, c.character) in (select ww.word from public.weak_words() ww))
  ),
  limits as (
    select greatest(0, coalesce((select pr.new_cards_per_day from public.profiles pr where pr.id = (select auth.uid())), 20)
      - (select count(*) from public.review_log l
         where l.user_id = (select auth.uid()) and l.state = 0 and l.reviewed_at >= p_day_start)) as new_left
  ),
  due as (
    select d.* from deck d
    where p_deck = 'weak'
       or (d.state <> 0 and (d.due_at <= now() or (d.state in (1, 3) and d.due_at <= now() + interval '20 minutes')))
  ),
  fresh as (
    select d.* from deck d
    where p_deck <> 'weak' and d.state = 0
      -- Only the first unseen direction of each word or sentence (read → listen → recall).
      and not exists (
        select 1 from public.review_cards o
        where o.user_id = d.user_id and o.kind = d.kind and o.state = 0
          and o.word is not distinct from d.word and o.sentence_id is not distinct from d.sentence_id
          and o.custom_id is not distinct from d.custom_id and o.character is not distinct from d.character
          and o.grammar_id is not distinct from d.grammar_id
          and array_position(array['read', 'listen', 'recall', 'write', 'practice'], o.direction)
            < array_position(array['read', 'listen', 'recall', 'write', 'practice'], d.direction))
      -- …and not on the same day as one of its siblings was introduced.
      and not exists (
        select 1 from public.review_log l join public.review_cards o on o.id = l.card_id
        where l.user_id = d.user_id and l.state = 0 and l.reviewed_at >= p_day_start
          and o.kind = d.kind and o.word is not distinct from d.word
          and o.sentence_id is not distinct from d.sentence_id and o.custom_id is not distinct from d.custom_id
          and o.character is not distinct from d.character and o.grammar_id is not distinct from d.grammar_id)
    order by d.created_at, d.word, d.direction
    limit (select new_left from limits)
  ),
  picked as (
    select d.*, 0 as part from due d
    union all
    select f.*, 1 as part from fresh f
  )
  select p.id, p.kind, p.direction, p.word, p.sentence_id, p.custom_id,
         p.state, p.schedule_status, p.stability, p.stability_fast, p.difficulty, p.due_at, p.last_review_at,
         p.reps, p.lapses, p.scheduled_days, p.learning_step,
         public.card_content(p.kind, p.word, p.sentence_id, p.custom_id, p.character, p.grammar_id) as content
  from picked p
  order by p.part, p.due_at, p.created_at;
$$;
