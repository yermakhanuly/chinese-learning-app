-- Phase 5: characters (stroke order, radical, parts, origin) and handwriting review cards.

-- ---------------------------------------------------------------------------
-- Characters (written by the import script from Make Me a Hanzi; read-only to the app)

create table public.characters (
  character    text primary key check (char_length(character) = 1),
  strokes      text[] not null,             -- SVG paths, 1024×1024 box, y axis up (Make Me a Hanzi)
  medians      jsonb not null,              -- per stroke: [[x, y], …] from start to end
  stroke_count smallint not null,
  radical      text,
  decomposition text,                       -- IDS, e.g. ⿰女子
  etymology    jsonb,                       -- { type, hint, phonetic?, semantic? }
  definition   text,
  pinyin       text[] not null default '{}',
  hsk_level    smallint,                    -- lowest HSK level of a word that uses it
  traditional_only boolean not null default false  -- only used in traditional forms of HSK words
);

comment on table public.characters is
  'Make Me a Hanzi (github.com/skishore/makemeahanzi): strokes/medians under the Arphic Public License, other fields under the LGPL.';

create index characters_level_idx on public.characters (hsk_level, stroke_count) where not traditional_only;

alter table public.characters enable row level security;
create policy "Characters are readable by everyone" on public.characters for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.characters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writing review cards: kind 'character', direction 'write' (meaning + sound → write it).

alter table public.review_cards
  add column character text references public.characters on delete cascade;

alter table public.review_cards drop constraint review_cards_kind_check;
alter table public.review_cards add constraint review_cards_kind_check
  check (kind in ('word', 'sentence', 'custom', 'character'));
alter table public.review_cards drop constraint review_cards_direction_check;
alter table public.review_cards add constraint review_cards_direction_check
  check (direction in ('read', 'listen', 'recall', 'write'));
alter table public.review_cards drop constraint review_cards_source_check;
alter table public.review_cards add constraint review_cards_source_check
  check (source in ('lesson', 'saved', 'sentence', 'custom', 'writing'));
alter table public.review_cards drop constraint review_cards_check;
alter table public.review_cards add constraint review_cards_check check (
  (kind = 'word' and word is not null and sentence_id is null and custom_id is null and character is null
     and direction in ('read', 'listen', 'recall'))
  or (kind = 'sentence' and sentence_id is not null and word is null and custom_id is null and character is null
     and direction in ('read', 'listen'))
  or (kind = 'custom' and custom_id is not null and word is null and sentence_id is null and character is null
     and direction = 'read')
  or (kind = 'character' and character is not null and word is null and sentence_id is null and custom_id is null
     and direction = 'write')
);

create unique index review_cards_character_key on public.review_cards (user_id, character) where kind = 'character';

/** Opt in: practise writing this character in review. */
create function public.add_writing_card(p_character text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.characters where character = p_character) then
    raise exception 'character not found' using errcode = 'P0002';
  end if;
  insert into public.review_cards (user_id, kind, direction, character, source, hsk_level)
  select auth.uid(), 'character', 'write', c.character, 'writing', c.hsk_level
  from public.characters c where c.character = p_character
  on conflict (user_id, character) where kind = 'character' do nothing;
end;
$$;

/** Opt out: removes the writing card (and its history). */
create function public.remove_writing_card(p_character text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.review_cards
  where user_id = auth.uid() and kind = 'character' and character = p_character;
$$;

revoke execute on function public.add_writing_card(text) from public, anon;
revoke execute on function public.remove_writing_card(text) from public, anon;
grant execute on function public.add_writing_card(text) to authenticated;
grant execute on function public.remove_writing_card(text) to authenticated;

-- "Again" on a writing card goes into the mistake notebook too (the character as the word).
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
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Card content and queue, now including writing cards.

create function public.card_content(p_kind text, p_word text, p_sentence_id bigint, p_custom_id uuid, p_character text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'character' then
      (select jsonb_build_object('character', c.character, 'pinyin', c.pinyin, 'definition', c.definition,
                                 'strokes', to_jsonb(c.strokes), 'medians', c.medians)
       from public.characters c where c.character = p_character)
    else public.card_content(p_kind, p_word, p_sentence_id, p_custom_id)
  end;
$$;

revoke execute on function public.card_content(text, text, bigint, uuid, text) from public, anon;
grant execute on function public.card_content(text, text, bigint, uuid, text) to authenticated;

/** As before, plus the 'writing' deck and writing cards. */
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
          and array_position(array['read', 'listen', 'recall', 'write'], o.direction)
            < array_position(array['read', 'listen', 'recall', 'write'], d.direction))
      -- …and not on the same day as one of its siblings was introduced.
      and not exists (
        select 1 from public.review_log l join public.review_cards o on o.id = l.card_id
        where l.user_id = d.user_id and l.state = 0 and l.reviewed_at >= p_day_start
          and o.kind = d.kind and o.word is not distinct from d.word
          and o.sentence_id is not distinct from d.sentence_id and o.custom_id is not distinct from d.custom_id
          and o.character is not distinct from d.character)
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
         public.card_content(p.kind, p.word, p.sentence_id, p.custom_id, p.character) as content
  from picked p
  order by p.part, p.due_at, p.created_at;
$$;
