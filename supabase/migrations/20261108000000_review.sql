-- Phase 4: spaced repetition (FSRS), custom cards, mistake notebook.
--
-- Cards are created by the database (finishing a lesson, saving a word, adding a sentence or a
-- custom card) and scheduled by the app (ts-fsrs). Learners never write review tables directly:
-- every review goes through record_review(), which also keeps the review log and mistakes.

-- ---------------------------------------------------------------------------
-- New cards per day (profile setting)

alter table public.profiles
  add column new_cards_per_day smallint not null default 20 check (new_cards_per_day in (5, 10, 20, 30, 50));

grant update (new_cards_per_day) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Custom cards: the learner's own front/back, optional Chinese text for audio.

create table public.custom_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  front      text not null check (char_length(trim(front)) between 1 and 200),
  back       text not null check (char_length(trim(back)) between 1 and 500),
  zh         text check (char_length(zh) <= 200),
  created_at timestamptz not null default now()
);

create index custom_cards_user_idx on public.custom_cards (user_id, created_at desc);

alter table public.custom_cards enable row level security;

create policy "Learners see their custom cards" on public.custom_cards
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Learners add custom cards" on public.custom_cards
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Learners edit their custom cards" on public.custom_cards
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Learners delete their custom cards" on public.custom_cards
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.custom_cards from anon;
revoke truncate on public.custom_cards from authenticated;
revoke update on public.custom_cards from authenticated;
grant update (front, back, zh) on public.custom_cards to authenticated;

-- ---------------------------------------------------------------------------
-- Review cards: one row per learner × thing × direction, with its FSRS memory state.
--   word:     read (characters → meaning), listen (audio → meaning), recall (meaning → characters)
--   sentence: read, listen
--   custom:   read (front → back)

create table public.review_cards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  kind           text not null check (kind in ('word', 'sentence', 'custom')),
  direction      text not null check (direction in ('read', 'listen', 'recall')),
  word           text,
  sentence_id    bigint references public.sentences on delete cascade,
  custom_id      uuid references public.custom_cards on delete cascade,
  source         text not null check (source in ('lesson', 'saved', 'sentence', 'custom')),
  hsk_level      smallint,                  -- word cards: the word's HSK level, for deck filters
  unit_id        text references public.units on delete set null,  -- word cards: unit that teaches it
  -- FSRS memory state (ts-fsrs DefaultScheduler card, camelCase there)
  state          smallint not null default 0 check (state between 0 and 3),  -- 0 new, 1 learning, 2 review, 3 relearning
  schedule_status text not null default 'new',
  stability      double precision not null default 0,
  stability_fast double precision not null default 0,
  difficulty     double precision not null default 0,
  due_at         timestamptz not null default now(),
  last_review_at timestamptz,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  scheduled_days double precision not null default 0,
  learning_step  smallint not null default 0,
  created_at     timestamptz not null default now(),
  check (
    (kind = 'word' and word is not null and sentence_id is null and custom_id is null)
    or (kind = 'sentence' and sentence_id is not null and word is null and custom_id is null and direction <> 'recall')
    or (kind = 'custom' and custom_id is not null and word is null and sentence_id is null and direction = 'read')
  )
);

create unique index review_cards_word_key on public.review_cards (user_id, word, direction) where kind = 'word';
create unique index review_cards_sentence_key on public.review_cards (user_id, sentence_id, direction) where kind = 'sentence';
create unique index review_cards_custom_key on public.review_cards (user_id, custom_id, direction) where kind = 'custom';
create index review_cards_due_idx on public.review_cards (user_id, due_at);

alter table public.review_cards enable row level security;

create policy "Learners see their review cards" on public.review_cards
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.review_cards from anon;
revoke insert, update, delete, truncate on public.review_cards from authenticated;

-- One row per answer.
create table public.review_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  card_id     uuid not null references public.review_cards on delete cascade,
  rating      smallint not null check (rating between 1 and 4),  -- 1 Again, 2 Hard, 3 Good, 4 Easy
  state       smallint not null,           -- state before this review (0 = the card was new)
  due_at      timestamptz not null,        -- due date before this review
  reviewed_at timestamptz not null default now()
);

create index review_log_user_time_idx on public.review_log (user_id, reviewed_at desc);
create index review_log_card_idx on public.review_log (card_id);

alter table public.review_log enable row level security;

create policy "Learners see their review log" on public.review_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.review_log from anon;
revoke insert, update, delete, truncate on public.review_log from authenticated;

-- Mistake notebook: every wrong lesson answer and every "Again" on a word card.
create table public.mistakes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  word       text not null,
  source     text not null check (source in ('lesson', 'review')),
  lesson_id  text references public.lessons on delete set null,
  created_at timestamptz not null default now()
);

create index mistakes_user_word_idx on public.mistakes (user_id, word, created_at desc);

alter table public.mistakes enable row level security;

create policy "Learners see their mistakes" on public.mistakes
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.mistakes from anon;
revoke insert, update, delete, truncate on public.mistakes from authenticated;

-- ---------------------------------------------------------------------------
-- Creating cards (internal helpers; not callable by clients)

/** Adds the three word cards for one learner (no-op for directions that already exist). */
create function public.add_word_cards(p_user uuid, p_word text, p_source text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.review_cards (user_id, kind, direction, word, source, hsk_level, unit_id)
  select p_user, 'word', d.direction, p_word, p_source,
         (select w.hsk_level from public.words w where w.simplified = p_word),
         (select l.unit_id from public.lessons l where p_word = any (l.words) and l.kind = 'lesson' order by l.id limit 1)
  from unnest(array['read', 'listen', 'recall']) as d (direction)
  on conflict (user_id, word, direction) where kind = 'word' do nothing;
$$;

revoke execute on function public.add_word_cards(uuid, text, text) from public, anon, authenticated;

-- Saving a word in the dictionary adds it to review. Un-saving keeps the cards (and their history).
create function public.saved_word_to_review() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.add_word_cards(new.user_id, new.word, 'saved');
  return new;
end;
$$;

revoke execute on function public.saved_word_to_review() from public, anon, authenticated;

create trigger saved_words_review after insert on public.saved_words
  for each row execute function public.saved_word_to_review();

-- A custom card gets one review card.
create function public.custom_card_to_review() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.review_cards (user_id, kind, direction, custom_id, source)
  values (new.user_id, 'custom', 'read', new.id, 'custom')
  on conflict (user_id, custom_id, direction) where kind = 'custom' do nothing;
  return new;
end;
$$;

revoke execute on function public.custom_card_to_review() from public, anon, authenticated;

create trigger custom_cards_review after insert on public.custom_cards
  for each row execute function public.custom_card_to_review();

/** Adds an example sentence to the caller's review (read + listen cards). */
create function public.add_sentence_card(p_sentence_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.review_cards (user_id, kind, direction, sentence_id, source)
  select auth.uid(), 'sentence', d.direction, s.id, 'sentence'
  from public.sentences s, unnest(array['read', 'listen']) as d (direction)
  where s.id = p_sentence_id
  on conflict (user_id, sentence_id, direction) where kind = 'sentence' do nothing;
  if not found and not exists (select 1 from public.sentences where id = p_sentence_id) then
    raise exception 'sentence not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.add_sentence_card(bigint) from public, anon;
grant execute on function public.add_sentence_card(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Finishing a lesson now also adds its words to review and logs the words the learner missed.

drop function public.complete_lesson(text, smallint);

create function public.complete_lesson(p_lesson_id text, p_score smallint, p_missed text[] default '{}')
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.lesson_progress;
  w text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100' using errcode = '22023';
  end if;
  if coalesce(array_length(p_missed, 1), 0) > 50 then
    raise exception 'too many missed words' using errcode = '22023';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, best_score, last_score)
  values (auth.uid(), p_lesson_id, p_score, p_score)
  on conflict (user_id, lesson_id) do update
    set best_score = greatest(public.lesson_progress.best_score, excluded.best_score),
        last_score = excluded.last_score,
        attempts = public.lesson_progress.attempts + 1,
        updated_at = now()
  returning * into result;

  for w in select unnest(l.words) from public.lessons l where l.id = p_lesson_id loop
    perform public.add_word_cards(auth.uid(), w, 'lesson');
  end loop;

  insert into public.mistakes (user_id, word, source, lesson_id)
  select distinct auth.uid(), m, 'lesson', p_lesson_id
  from unnest(p_missed) as m
  where char_length(m) between 1 and 32;

  return result;
end;
$$;

revoke execute on function public.complete_lesson(text, smallint, text[]) from public, anon;
grant execute on function public.complete_lesson(text, smallint, text[]) to authenticated;

-- Learners who finished lessons or saved words before this phase get their cards now.
select public.add_word_cards(p.user_id, w, 'lesson')
from public.lesson_progress p
join public.lessons l on l.id = p.lesson_id
cross join lateral unnest(l.words) as w;

select public.add_word_cards(s.user_id, s.word, 'saved') from public.saved_words s;

-- ---------------------------------------------------------------------------
-- Recording a review

/**
 * Saves one answer: the card's new FSRS state (computed by the app with ts-fsrs), a log row,
 * and a mistake for "Again" on a word card.
 */
create function public.record_review(p_card_id uuid, p_rating smallint, p_card jsonb)
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

  if p_rating = 1 and old.kind = 'word' then
    insert into public.mistakes (user_id, word, source) values (auth.uid(), old.word, 'review');
  end if;
end;
$$;

revoke execute on function public.record_review(uuid, smallint, jsonb) from public, anon;
grant execute on function public.record_review(uuid, smallint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading the queue

/** What a card shows: word details, sentence, or custom text. */
create function public.card_content(p_kind text, p_word text, p_sentence_id bigint, p_custom_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'word' then coalesce(
      (select jsonb_build_object('simplified', w.simplified, 'traditional', w.traditional, 'pinyin', w.pinyin,
                                 'meanings', to_jsonb(w.meanings[1:3]))
       from public.words w where w.simplified = p_word),
      (select jsonb_build_object('simplified', d.simplified, 'traditional', d.traditional, 'pinyin', d.pinyin,
                                 'meanings', to_jsonb(d.definitions[1:3]))
       from public.dictionary_entries d where d.simplified = p_word order by d.id limit 1),
      jsonb_build_object('simplified', p_word, 'traditional', p_word, 'pinyin', '', 'meanings', '[]'::jsonb))
    when 'sentence' then
      (select jsonb_build_object('simplified', s.simplified, 'traditional', s.traditional, 'english', s.english,
                                 'tokens', s.tokens, 'id', s.id)
       from public.sentences s where s.id = p_sentence_id)
    else
      (select jsonb_build_object('front', c.front, 'back', c.back, 'zh', c.zh)
       from public.custom_cards c where c.id = p_custom_id)
  end;
$$;

/** Words missed at least 3 times in the last 30 days. */
create function public.weak_words()
returns table (word text, misses bigint)
language sql
stable
set search_path = ''
as $$
  select m.word, count(*) as misses
  from public.mistakes m
  where m.user_id = (select auth.uid()) and m.created_at > now() - interval '30 days'
  group by m.word
  having count(*) >= 3;
$$;

grant execute on function public.weak_words() to authenticated;

/**
 * Today's review session for the caller: due cards (soonest first), then new cards up to the
 * daily limit (counting new cards already started since p_day_start, the learner's local midnight).
 * A word's next new direction waits until its earlier one has been seen, so siblings spread over days.
 * Decks: all | saved | sentences | custom | weak | level:<n> | unit:<id>.
 * The weak deck practises every card of the weak words, due or not.
 */
create function public.review_queue(p_day_start timestamptz, p_deck text default 'all')
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
        when p_deck like 'level:%' then c.hsk_level = nullif(substr(p_deck, 7), '')::smallint
        when p_deck like 'unit:%' then c.unit_id = substr(p_deck, 6)
        else false
      end
      and (p_deck <> 'weak' or c.word in (select ww.word from public.weak_words() ww))
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
          and o.custom_id is not distinct from d.custom_id
          and array_position(array['read', 'listen', 'recall'], o.direction)
            < array_position(array['read', 'listen', 'recall'], d.direction))
      -- …and not on the same day as one of its siblings was introduced.
      and not exists (
        select 1 from public.review_log l join public.review_cards o on o.id = l.card_id
        where l.user_id = d.user_id and l.state = 0 and l.reviewed_at >= p_day_start
          and o.kind = d.kind and o.word is not distinct from d.word
          and o.sentence_id is not distinct from d.sentence_id and o.custom_id is not distinct from d.custom_id)
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
         public.card_content(p.kind, p.word, p.sentence_id, p.custom_id) as content
  from picked p
  order by p.part, p.due_at, p.created_at;
$$;

grant execute on function public.review_queue(timestamptz, text) to authenticated;

/** Counts for Home and the Review tab. */
create function public.review_summary(p_day_start timestamptz)
returns table (due bigint, new bigint, total bigint, weak bigint)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*) from public.review_queue(p_day_start, 'all') q where q.state <> 0),
    (select count(*) from public.review_queue(p_day_start, 'all') q where q.state = 0),
    (select count(*) from public.review_cards c where c.user_id = (select auth.uid())),
    (select count(*) from public.weak_words());
$$;

grant execute on function public.review_summary(timestamptz) to authenticated;

/** The mistake notebook: every missed word, most recent first, with details. */
create function public.mistake_notebook()
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
  where m.user_id = (select auth.uid())
  group by m.word
  order by max(m.created_at) desc
  limit 200;
$$;

grant execute on function public.mistake_notebook() to authenticated;

revoke execute on function public.card_content(text, text, bigint, uuid) from public, anon;
revoke execute on function public.weak_words() from public, anon;
revoke execute on function public.review_queue(timestamptz, text) from public, anon;
revoke execute on function public.review_summary(timestamptz) from public, anon;
revoke execute on function public.mistake_notebook() from public, anon;
grant execute on function public.card_content(text, text, bigint, uuid) to authenticated;
