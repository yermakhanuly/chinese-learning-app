-- Phase 2: dictionary search, example sentences, topics and saved words.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Search helpers

-- array_to_string isn't immutable, so it can't feed a generated column directly.
create function public.join_meanings(text[]) returns text
  language sql immutable parallel safe
  set search_path = ''
  as $$ select array_to_string($1, ' ; ') $$;

alter table public.words
  add column meanings_text text generated always as (public.join_meanings(meanings)) stored,
  -- Tones the learner may type, neutral tones left out: "nǐ hǎo" → "33".
  add column tone_signature text generated always as (regexp_replace(pinyin_numeric, '[^1-4]', '', 'g')) stored;

alter table public.dictionary_entries
  add column definitions_text text generated always as (public.join_meanings(definitions)) stored,
  add column tone_signature text generated always as (regexp_replace(pinyin_numeric, '[^1-4]', '', 'g')) stored;

create index words_meanings_trgm_idx on public.words using gin (meanings_text extensions.gin_trgm_ops);
create index words_pinyin_prefix_idx on public.words (pinyin_plain text_pattern_ops);
create index dictionary_entries_definitions_trgm_idx on public.dictionary_entries using gin (definitions_text extensions.gin_trgm_ops);
create index dictionary_entries_pinyin_prefix_idx on public.dictionary_entries (pinyin_plain text_pattern_ops);

/**
 * One search box for everything: Chinese characters (simplified or traditional), pinyin with or
 * without tones, or English. The app normalizes pinyin first:
 *   q      – what the learner typed (trimmed)
 *   plain  – tone-less, space-less pinyin ("nihao"), or '' when the query isn't pinyin
 *   tones  – tones the learner typed, neutral left out ("33"), or ''
 * HSK words come before other dictionary entries; lower tier = better match.
 */
create function public.search_dictionary(q text, plain text default '', tones text default '', max_results int default 40)
returns table (
  source text,
  simplified text,
  traditional text,
  pinyin text,
  meanings text[],
  hsk_level smallint,
  frequency integer,
  tier int,
  -- where the English query first appears in the definition (0 = not an English match)
  match_at int
)
language sql stable
set search_path = ''
as $$
  with params as (
    select
      lower(q) as lq,
      q ~ '[㐀-鿿]' as is_han,
      -- whole-word English match, regex special characters escaped
      '\m' || regexp_replace(lower(q), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M' as word_re
  ),
  hsk as (
    select 'hsk'::text as source, w.simplified, w.traditional, w.pinyin, w.meanings, w.hsk_level, w.frequency,
      case
        when p.is_han and (w.simplified = q or w.traditional = q) then 0
        when p.is_han and (w.simplified like q || '%' or w.traditional like q || '%') then 3
        when p.is_han then 4
        when plain <> '' and w.pinyin_plain = plain and (tones = '' or w.tone_signature = tones) then 0
        when exists (
          select 1 from regexp_split_to_table(lower(w.meanings_text), '\s*;\s*') m where m = p.lq or m = 'to ' || p.lq
        ) then 1
        when plain <> '' and w.pinyin_plain = plain then 1
        when w.meanings_text ~* p.word_re then 2
        when plain <> '' and w.pinyin_plain like plain || '%' and (tones = '' or w.tone_signature like tones || '%') then 3
        when plain <> '' and w.pinyin_plain like plain || '%' then 4
        else 5
      end as tier,
      strpos(lower(w.meanings_text), p.lq) as match_at
    from public.words w, params p
    where
      (p.is_han and (w.simplified like '%' || q || '%' or w.traditional like '%' || q || '%'))
      or (not p.is_han and plain <> '' and w.pinyin_plain like plain || '%')
      or (not p.is_han and length(q) >= 2 and w.meanings_text ilike '%' || q || '%')
  ),
  dict as (
    select 'dictionary'::text as source, d.simplified, d.traditional, d.pinyin, d.definitions, null::smallint, null::integer,
      case
        when p.is_han and (d.simplified = q or d.traditional = q) then 0
        when p.is_han and (d.simplified like q || '%' or d.traditional like q || '%') then 3
        when p.is_han then 4
        -- Non-HSK entries rank below HSK words: many are rare characters sharing a common syllable.
        when exists (
          select 1 from regexp_split_to_table(lower(d.definitions_text), '\s*;\s*') m where m = p.lq or m = 'to ' || p.lq
        ) then 2
        when plain <> '' and d.pinyin_plain = plain and (tones = '' or d.tone_signature = tones) then 3
        when d.definitions_text ~* p.word_re then 3
        when plain <> '' and d.pinyin_plain like plain || '%' then 4
        else 5
      end as tier,
      strpos(lower(d.definitions_text), p.lq) as match_at
    from public.dictionary_entries d, params p
    where
      (
        (p.is_han and (d.simplified like '%' || q || '%' or d.traditional like '%' || q || '%'))
        or (not p.is_han and plain <> '' and d.pinyin_plain like plain || '%')
        or (not p.is_han and length(q) >= 3 and d.definitions_text ilike '%' || q || '%')
      )
      -- HSK words already appear above, with every reading
      and not exists (select 1 from public.words w where w.simplified = d.simplified)
  )
  select * from (select * from hsk union all select * from dict) r
  where r.tier < 5
  order by r.tier, (r.source = 'dictionary'),
    -- English: the main sense (mentioned early) before a minor one ("love" in 春 "spring; …; love")
    (r.match_at > 25),
    r.frequency nulls last, r.hsk_level nulls last, length(r.simplified), r.pinyin
  limit least(max_results, 100);
$$;

grant execute on function public.search_dictionary(text, text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Example sentences (Tatoeba, CC BY 2.0 FR) linked to HSK words

create table public.sentences (
  id          bigint primary key,           -- Tatoeba sentence id (for attribution links)
  simplified  text not null,
  traditional text not null,
  english     text not null,
  english_id  bigint not null,              -- Tatoeba id of the translation
  tokens      jsonb not null,               -- [{ s: simplified, t: traditional, p?: pinyin }]
  difficulty  smallint not null             -- hardest word's HSK level; 8 = outside the HSK lists
);

comment on table public.sentences is 'Example sentences from Tatoeba (https://tatoeba.org), CC BY 2.0 FR.';

create table public.word_sentences (
  word_id     bigint not null references public.words on delete cascade,
  sentence_id bigint not null references public.sentences on delete cascade,
  position    smallint not null,
  primary key (word_id, sentence_id)
);

create index word_sentences_word_idx on public.word_sentences (word_id, position);
create index word_sentences_sentence_idx on public.word_sentences (sentence_id);

-- ---------------------------------------------------------------------------
-- Topics

create table public.topics (
  slug     text primary key,
  name     text not null,
  hanzi    text not null,
  position smallint not null
);

insert into public.topics (slug, name, hanzi, position) values
  ('daily-life',    'Daily life',             '日常', 1),
  ('food',          'Food & drink',           '饮食', 2),
  ('people',        'Family & people',        '人', 3),
  ('body-health',   'Body & health',          '健康', 4),
  ('home',          'Home',                   '家', 5),
  ('clothing',      'Clothing',               '衣服', 6),
  ('school',        'School & study',         '学习', 7),
  ('work',          'Work & business',        '工作', 8),
  ('money',         'Money & shopping',       '购物', 9),
  ('travel',        'Travel & transport',     '旅行', 10),
  ('places',        'Places & directions',    '地方', 11),
  ('time',          'Time & dates',           '时间', 12),
  ('numbers',       'Numbers & measures',     '数字', 13),
  ('nature',        'Weather & nature',       '自然', 14),
  ('animals',       'Animals & plants',       '动物', 15),
  ('hobbies',       'Sports & hobbies',       '爱好', 16),
  ('arts',          'Arts & entertainment',   '艺术', 17),
  ('feelings',      'Feelings & attitudes',   '感情', 18),
  ('describing',    'Describing people & things', '形容', 19),
  ('communication', 'Language & communication', '交流', 20),
  ('society',       'Society & politics',     '社会', 21),
  ('science-tech',  'Science & technology',   '科技', 22),
  ('culture',       'Culture & history',      '文化', 23),
  ('ideas',         'Ideas & abstract words', '思想', 24),
  ('grammar',       'Grammar words',          '语法', 25);

create table public.word_topics (
  word_id    bigint not null references public.words on delete cascade,
  topic_slug text not null references public.topics on delete cascade,
  primary key (word_id, topic_slug)
);

create index word_topics_topic_idx on public.word_topics (topic_slug, word_id);

create view public.topic_word_counts with (security_invoker = true) as
  select t.slug, t.name, t.hanzi, t.position, count(wt.word_id)::int as word_count
  from public.topics t left join public.word_topics wt on wt.topic_slug = t.slug
  group by t.slug;

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone, written only by the import scripts (service role).

alter table public.sentences enable row level security;
alter table public.word_sentences enable row level security;
alter table public.topics enable row level security;
alter table public.word_topics enable row level security;

create policy "Sentences are readable by everyone" on public.sentences for select to anon, authenticated using (true);
create policy "Word sentences are readable by everyone" on public.word_sentences for select to anon, authenticated using (true);
create policy "Topics are readable by everyone" on public.topics for select to anon, authenticated using (true);
create policy "Word topics are readable by everyone" on public.word_topics for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.sentences, public.word_sentences, public.topics, public.word_topics
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saved words: by characters, so HSK words and other dictionary entries can both be saved.

create table public.saved_words (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  word       text not null check (char_length(word) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (user_id, word)
);

create index saved_words_user_recent_idx on public.saved_words (user_id, created_at desc);

alter table public.saved_words enable row level security;

create policy "Learners see their saved words" on public.saved_words
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Learners save words for themselves" on public.saved_words
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Learners remove their saved words" on public.saved_words
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update, truncate on public.saved_words from anon, authenticated;
revoke all on public.saved_words from anon;
