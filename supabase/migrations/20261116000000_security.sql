-- Phase 10 security review: tidy grants that RLS already made harmless, so the grants say what is
-- allowed. (Findings and checks: README → Security.)

-- Trigger functions are never called directly.
revoke execute on function public.activity_from_lesson() from public, anon, authenticated;
revoke execute on function public.activity_from_review() from public, anon, authenticated;
revoke execute on function public.activity_from_grammar() from public, anon, authenticated;
revoke execute on function public.activity_from_reading() from public, anon, authenticated;
revoke execute on function public.activity_from_pronunciation() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- A read-only summary view.
revoke insert, update, delete, truncate on public.topic_word_counts from anon, authenticated;

-- Only signed-in learners delete (their own) conversations.
revoke delete on public.tutor_conversations from anon;
