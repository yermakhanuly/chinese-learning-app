import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import type { MockTest } from '@/lib/mock-test';
import {
  badges,
  computeStreak,
  dailyChallenges,
  levelFor,
  localDate,
  weekStart,
  weeklyChallenges,
  type DayXp,
  type KindCounts,
  type Stats,
} from '@/lib/progress';
import type { Token } from '@/lib/sentences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

/** Every progress query starts with this key, so one invalidation refreshes them all. */
export const PROGRESS_KEY = 'progress';

export function useInvalidateProgress() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [PROGRESS_KEY] });
}

export type DayActivity = DayXp & { seconds: number; activities: number };

function useSignedIn() {
  const { session } = useAuth();
  return session?.user.id;
}

/** XP, time and activity count per local day (the last ~13 months). */
export function useDailyActivity() {
  const userId = useSignedIn();
  return useQuery({
    queryKey: [PROGRESS_KEY, 'days', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DayActivity[]> => {
      const { data, error } = await supabase.rpc('daily_activity', { p_days: 400 });
      if (error) throw error;
      return (data as { day: string; xp: number; seconds: number; activities: number }[]).map((d) => ({
        day: d.day,
        xp: Number(d.xp),
        seconds: Number(d.seconds),
        activities: Number(d.activities),
      }));
    },
  });
}

/** Activity per kind since a local date (midnight on this device). */
export function useActivityCounts(since: string) {
  const userId = useSignedIn();
  return useQuery({
    queryKey: [PROGRESS_KEY, 'counts', userId, since],
    enabled: !!userId,
    queryFn: async (): Promise<KindCounts> => {
      const start = new Date(`${since}T00:00:00`).toISOString();
      const { data, error } = await supabase.rpc('activity_counts', { p_since: start });
      if (error) throw error;
      return Object.fromEntries(
        (data as { kind: string; activities: number; xp: number }[]).map((r) => [r.kind, { activities: Number(r.activities), xp: Number(r.xp) }]),
      );
    },
  });
}

export function useProgressStats() {
  const userId = useSignedIn();
  return useQuery({
    queryKey: [PROGRESS_KEY, 'stats', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc('progress_stats');
      if (error) throw error;
      return data as Stats;
    },
  });
}

export type ActivityRow = { kind: string; xp: number; correct: number | null; total: number | null; ref: string | null; created_at: string };

export function useRecentActivity(limit = 20) {
  const userId = useSignedIn();
  return useQuery({
    queryKey: [PROGRESS_KEY, 'recent', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.rpc('recent_activity', { p_limit: limit });
      if (error) throw error;
      return data as ActivityRow[];
    },
  });
}

/**
 * Everything the Home card and the dashboard need: streak, level, today's XP and the challenges.
 * `ready` is false until the learner's data has loaded.
 */
export function useProgressSummary() {
  const profile = useProfile().data;
  const days = useDailyActivity();
  const stats = useProgressStats();
  const today = localDate();
  const week = weekStart(today);
  const todayCounts = useActivityCounts(today);
  const weekCounts = useActivityCounts(week);
  const goal = profile?.daily_goal_xp ?? 20;

  const ready = !!(profile && days.data && stats.data && todayCounts.data && weekCounts.data);
  if (!ready) return { ready: false as const, isError: days.isError || stats.isError };
  const streak = computeStreak(days.data!, today, goal);
  const daysActive = days.data!.filter((d) => d.day >= week && d.day <= today && d.xp > 0).length;
  return {
    ready: true as const,
    goal,
    today,
    days: days.data!,
    stats: stats.data!,
    streak,
    level: levelFor(stats.data!.total_xp),
    daily: dailyChallenges(today, todayCounts.data!, goal),
    weekly: weeklyChallenges(today, weekCounts.data!, daysActive, goal),
    badges: badges(stats.data!, streak),
    weekCounts: weekCounts.data!,
  };
}

/** Keeps the profile's time zone in step with this device (streaks count local days). */
export function useSyncTimeZone() {
  const profile = useProfile().data;
  const update = useUpdateProfile();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { mutate } = update;
  useEffect(() => {
    if (profile && zone && profile.time_zone !== zone) mutate({ time_zone: zone });
  }, [profile, zone, mutate]);
}

/** Saves a finished listening / tone / character quiz (1 XP per right answer). */
export function useCompleteQuiz() {
  const invalidate = useInvalidateProgress();
  const userId = useSignedIn();
  return useMutation({
    mutationFn: async ({ kind, ref, correct, total }: { kind: 'listening' | 'tones' | 'characters'; ref: string; correct: number; total: number }) => {
      if (!userId) return;
      const { error } = await supabase.rpc('complete_quiz', { p_kind: kind, p_ref: ref, p_correct: correct, p_total: total });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Saves a quiz result once when the quiz ends (signed-in learners; guests earn no XP). */
export function useSaveQuizOnce(kind: 'listening' | 'tones' | 'characters', ref: string, correct: number, total: number, done: boolean) {
  const { mutate, isIdle } = useCompleteQuiz();
  const userId = useSignedIn();
  useEffect(() => {
    if (done && userId && isIdle && total > 0) mutate({ kind, ref, correct, total });
  }, [done, userId, isIdle, mutate, kind, ref, correct, total]);
}

// ---------------------------------------------------------------------------
// Leaderboard

export type LeaderRow = { rank: number; display_name: string; avatar_url: string | null; xp: number; is_me: boolean };

export function useLeaderboard() {
  const userId = useSignedIn();
  return useQuery({
    queryKey: [PROGRESS_KEY, 'leaderboard', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LeaderRow[]> => {
      const { data, error } = await supabase.rpc('weekly_leaderboard');
      if (error) throw error;
      return (data as LeaderRow[]).map((r) => ({ ...r, rank: Number(r.rank), xp: Number(r.xp) }));
    },
  });
}

// ---------------------------------------------------------------------------
// Mock tests

export type MockTestRow = MockTest & { readings: Record<string, Token[]> };

export function useMockTest(id: string | undefined) {
  return useQuery({
    queryKey: ['mock-test', id],
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<MockTestRow | null> => {
      const { data, error } = await supabase.from('mock_tests').select('id, hsk_level, title, minutes, sections, readings').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, level: data.hsk_level } as unknown as MockTestRow) : null;
    },
  });
}

export function useCompleteMock() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: async ({ id, listening, reading }: { id: string; listening: number; reading: number }) => {
      const { error } = await supabase.rpc('complete_mock', { p_test_id: id, p_listening: listening, p_reading: reading });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
