-- Phase 0: vocabulary reference data.
-- Learner tables (profiles, progress, reviews…) are added in the phase that uses them.

-- HSK vocabulary: one row per simplified word.
create table public.words (
  id              bigint generated always as identity primary key,
  simplified      text not null unique,
  traditional     text not null,
  pinyin          text not null,               -- tone marks: "ài hào"
  pinyin_numeric  text not null,               -- numbered:   "ai4 hao4"
  pinyin_plain    text not null,               -- search key: "aihao" (ü → v)
  meanings        text[] not null default '{}',
  hsk_level       smallint check (hsk_level between 1 and 7),           -- 2026 HSK 3.0 syllabus; 7 = levels 7–9
  hsk_2021_level  smallint check (hsk_2021_level between 1 and 7),      -- 2021 HSK 3.0 standard; 7 = levels 7–9
  hsk2_level      smallint check (hsk2_level between 1 and 6),          -- old HSK 2.0
  frequency       integer,                     -- corpus rank; lower = more common
  pos             text[] not null default '{}',
  radical         text,
  classifiers     text[] not null default '{}',
  forms           jsonb not null default '[]', -- every reading: traditional, pinyin, meanings, classifiers
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.words is 'HSK vocabulary from complete-hsk-vocabulary (MIT) and CC-CEDICT (CC BY-SA 4.0).';

create index words_hsk_level_idx on public.words (hsk_level, frequency);
create index words_traditional_idx on public.words (traditional);
create index words_pinyin_plain_idx on public.words (pinyin_plain);

-- Full CC-CEDICT dictionary (~125k entries), for words outside the HSK lists.
create table public.dictionary_entries (
  id              bigint generated always as identity primary key,
  traditional     text not null,
  simplified      text not null,
  pinyin          text not null,
  pinyin_numeric  text not null,
  pinyin_plain    text not null,
  definitions     text[] not null
);

comment on table public.dictionary_entries is 'CC-CEDICT, CC BY-SA 4.0, https://www.mdbg.net/chinese/dictionary?page=cc-cedict';

create index dictionary_entries_simplified_idx on public.dictionary_entries (simplified);
create index dictionary_entries_traditional_idx on public.dictionary_entries (traditional);
create index dictionary_entries_pinyin_plain_idx on public.dictionary_entries (pinyin_plain);

-- Reference data: anyone can read, only the service role (import scripts, admin) can write.
alter table public.words enable row level security;
alter table public.dictionary_entries enable row level security;

create policy "Vocabulary is readable by everyone"
  on public.words for select to anon, authenticated using (true);

create policy "Dictionary is readable by everyone"
  on public.dictionary_entries for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.words, public.dictionary_entries from anon, authenticated;
