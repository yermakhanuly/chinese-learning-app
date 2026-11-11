-- Phase 10: offline study on iPhone. Lessons and reviews done offline are sent when the device is
-- back online, with the time they were done (p_at), so XP and streaks count the right day.
-- p_at is accepted only within the last 14 days and never in the future.

create function public.study_time(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when p_at is null or p_at > now() or p_at < now() - interval '14 days' then now() else p_at end;
$$;

-- log_activity records the time set for this transaction by the saving function (else now()).
create or replace function public.log_activity(
  p_user uuid, p_kind text, p_xp integer, p_seconds integer, p_correct integer, p_total integer, p_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (user_id, kind, xp, seconds, correct, total, ref, created_at)
  values (p_user, p_kind, p_xp, p_seconds, p_correct, p_total, p_ref,
          coalesce(nullif(current_setting('app.study_at', true), '')::timestamptz, now()));
$$;
revoke execute on function public.log_activity(uuid, text, integer, integer, integer, integer, text) from public, anon, authenticated;

-- --- record_review with the time of the review --------------------------------------------------------
drop function public.record_review(uuid, smallint, jsonb);
create function public.record_review(p_card_id uuid, p_rating smallint, p_card jsonb, p_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old public.review_cards;
  at timestamptz := public.study_time(p_at);
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
  perform set_config('app.study_at', at::text, true);
  -- A review made offline that arrives after a newer one (from another device) is only logged.
  -- Both times come from devices' clocks (lastReviewAt is set by the app), so they compare fairly.
  if p_at is not null and old.last_review_at is not null and old.last_review_at > p_at + interval '1 second' then
    insert into public.review_log (user_id, card_id, rating, state, due_at, reviewed_at)
    values (auth.uid(), p_card_id, p_rating, old.state, old.due_at, at);
    perform set_config('app.study_at', '', true);
    return;
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

  insert into public.review_log (user_id, card_id, rating, state, due_at, reviewed_at)
  values (auth.uid(), p_card_id, p_rating, old.state, old.due_at, at);

  if p_rating = 1 and old.kind in ('word', 'character') then
    insert into public.mistakes (user_id, word, source, created_at) values (auth.uid(), coalesce(old.word, old.character), 'review', at);
  elsif p_rating = 1 and old.kind = 'grammar' then
    insert into public.mistakes (user_id, grammar_id, source, created_at) values (auth.uid(), old.grammar_id, 'review', at);
  end if;
  perform set_config('app.study_at', '', true);
end;
$$;
revoke execute on function public.record_review(uuid, smallint, jsonb, timestamptz) from public, anon;
grant execute on function public.record_review(uuid, smallint, jsonb, timestamptz) to authenticated;

-- --- complete_lesson with the time it was finished -------------------------------------------------------
drop function public.complete_lesson(text, smallint, text[]);
create function public.complete_lesson(p_lesson_id text, p_score smallint, p_missed text[] default '{}', p_at timestamptz default null)
returns public.lesson_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.lesson_progress;
  w text;
  at timestamptz := public.study_time(p_at);
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
  perform set_config('app.study_at', at::text, true);
  insert into public.lesson_progress (user_id, lesson_id, best_score, last_score, completed_at, updated_at)
  values (auth.uid(), p_lesson_id, p_score, p_score, at, at)
  on conflict (user_id, lesson_id) do update
    set best_score = greatest(public.lesson_progress.best_score, excluded.best_score),
        last_score = excluded.last_score,
        attempts = public.lesson_progress.attempts + 1,
        updated_at = at
  returning * into result;

  for w in select unnest(l.words) from public.lessons l where l.id = p_lesson_id loop
    perform public.add_word_cards(auth.uid(), w, 'lesson');
  end loop;

  insert into public.mistakes (user_id, word, source, lesson_id, created_at)
  select distinct auth.uid(), m, 'lesson', p_lesson_id, at
  from unnest(p_missed) as m
  where char_length(m) between 1 and 32;
  perform set_config('app.study_at', '', true);

  return result;
end;
$$;
revoke execute on function public.complete_lesson(text, smallint, text[], timestamptz) from public, anon;
grant execute on function public.complete_lesson(text, smallint, text[], timestamptz) to authenticated;
