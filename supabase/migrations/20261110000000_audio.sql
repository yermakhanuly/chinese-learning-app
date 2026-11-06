-- Phase 6: recorded (neural) audio and pronunciation scoring limits.

-- ---------------------------------------------------------------------------
-- Audio clips: MP3 files in the public "audio" bucket at clips/<key>.mp3, where key =
-- src/lib/audio-key.ts(text). Written by scripts/generate-audio.ts (service role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 1048576, array['audio/mpeg', 'application/json'])
on conflict (id) do nothing;

create policy "Audio is readable by everyone" on storage.objects
  for select to anon, authenticated using (bucket_id = 'audio');

create table public.audio_clips (
  key         text primary key,               -- audioKey(text)
  text        text not null,                  -- the Chinese text, or "tone:ma3" for syllables
  kind        text not null check (kind in ('word', 'sentence', 'syllable')),
  voice       text not null,                  -- Azure voice name
  duration_ms integer not null,
  pitch       jsonb not null default '[]',    -- model pitch curve: [[t 0–1, v or null], …]
  hsk_level   smallint
);

create index audio_clips_text_idx on public.audio_clips (text);
create index audio_clips_kind_level_idx on public.audio_clips (kind, hsk_level);

alter table public.audio_clips enable row level security;
create policy "Audio clips are readable by everyone" on public.audio_clips for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.audio_clips from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pronunciation scoring: a daily limit per learner (keeps Azure inside its free tier).

create table public.pronunciation_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.pronunciation_usage enable row level security;
create policy "Learners see their pronunciation usage" on public.pronunciation_usage
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.pronunciation_usage from anon;
revoke insert, update, delete, truncate on public.pronunciation_usage from authenticated;

/**
 * Called by the pronounce Edge Function (as the learner) before each scoring request.
 * Returns how many checks are left today after this one; raises when the limit is reached.
 */
create function public.take_pronunciation_quota(p_limit integer default 60)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.pronunciation_usage (user_id, day, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = public.pronunciation_usage.count + 1
  returning count into used;
  if used > least(p_limit, 200) then
    raise exception 'daily pronunciation limit reached' using errcode = 'P0001';
  end if;
  return least(p_limit, 200) - used;
end;
$$;

revoke execute on function public.take_pronunciation_quota(integer) from public, anon;
grant execute on function public.take_pronunciation_quota(integer) to authenticated;

-- Example sentences of the words up to an HSK level, for the audio generation script.
create function public.audio_sentence_texts(p_max_level smallint)
returns table (simplified text, hsk_level smallint)
language sql
stable
set search_path = ''
as $$
  select s.simplified, min(w.hsk_level)::smallint
  from public.word_sentences ws
  join public.words w on w.id = ws.word_id
  join public.sentences s on s.id = ws.sentence_id
  where w.hsk_level <= p_max_level
  group by s.simplified;
$$;

revoke execute on function public.audio_sentence_texts(smallint) from public, anon, authenticated;
