import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LearningGoal } from '@/constants/profile-options';
import { useInvalidateReview } from '@/hooks/use-review';
import type { Lesson, Step } from '@/lib/lessons';
import { isOnline } from '@/lib/network';
import { enqueue, isNetworkError, saveCopy, withCopy } from '@/lib/offline';
import type { Token } from '@/lib/sentences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type LessonSummary = {
  id: string;
  unit_id: string;
  position: number;
  title: string;
  kind: Lesson['kind'];
  words: string[];
  minutes: number;
};

export type UnitWithLessons = {
  id: string;
  hsk_level: number;
  position: number;
  title: string;
  title_zh: string;
  theme: string | null;
  description: string;
  lessons: LessonSummary[];
};

export type WordDetail = {
  traditional: string;
  pinyin: string;
  meanings: string[];
  classifiers: string[];
  example: { simplified: string; traditional: string; english: string; tokens: Token[] } | null;
};

export type LessonContent = LessonSummary & {
  steps: Step[];
  readings: Record<string, Token[]>;
  word_details: Record<string, WordDetail>;
};

export type Progress = Map<string, { best_score: number; completed_at: string }>;

/** Units and lessons of one HSK level, in course order. */
export const courseQuery = (level: number) => ({
  queryKey: ['course', level],
  staleTime: 60 * 60 * 1000,
  queryFn: () =>
    withCopy(`course:${level}`, async (): Promise<UnitWithLessons[]> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, hsk_level, position, title, title_zh, theme, description, lessons(id, unit_id, position, title, kind, words, minutes)')
        .eq('hsk_level', level)
        .order('position');
      if (error) throw error;
      return (data as UnitWithLessons[]).map((u) => ({ ...u, lessons: [...u.lessons].sort((a, b) => a.position - b.position) }));
    }),
});

export function useCourse(level = 1) {
  return useQuery(courseQuery(level));
}

export const lessonQuery = (id: string) => ({
  queryKey: ['lesson', id],
  staleTime: 60 * 60 * 1000,
  queryFn: () =>
    withCopy(`lesson:${id}`, async (): Promise<LessonContent | null> => {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, unit_id, position, title, kind, words, minutes, steps, readings, word_details')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as LessonContent | null;
    }),
});

export function useLesson(id: string | undefined) {
  return useQuery({ ...lessonQuery(id ?? ''), enabled: !!id });
}

/** Finished lessons of the signed-in learner (empty for guests). */
export function useProgress() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['progress', userId],
    enabled: !!userId,
    queryFn: () =>
      withCopy(`progress:${userId}`, async (): Promise<Progress> => {
        const { data, error } = await supabase.from('lesson_progress').select('lesson_id, best_score, completed_at');
        if (error) throw error;
        return new Map(data.map((r) => [r.lesson_id, { best_score: r.best_score, completed_at: r.completed_at }]));
      }),
  });
}

/** Saves a finished lesson; the database also adds its words to review and logs the missed words. */
export function useCompleteLesson() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const invalidateReview = useInvalidateReview();
  return useMutation({
    mutationFn: async ({ lessonId, score, missed }: { lessonId: string; score: number; missed: string[] }): Promise<'saved' | 'queued'> => {
      const result = await saveLesson(lessonId, Math.round(score), missed.slice(0, 50));
      if (result === 'queued') {
        // Offline: show the lesson as done now; the outbox sends it later.
        const key = ['progress', session?.user.id];
        queryClient.setQueryData<Progress>(key, (old) => {
          const next = new Map(old ?? []);
          const prev = next.get(lessonId);
          next.set(lessonId, { best_score: Math.max(prev?.best_score ?? 0, Math.round(score)), completed_at: prev?.completed_at ?? new Date().toISOString() });
          saveCopy(`progress:${session?.user.id}`, { __map: [...next.entries()] });
          return next;
        });
      }
      return result;
    },
    onSuccess: (result) =>
      result === 'saved'
        ? Promise.all([queryClient.invalidateQueries({ queryKey: ['progress', session?.user.id] }), invalidateReview()])
        : undefined,
  });
}

/**
 * Saves a finished lesson; with no connection it goes into the outbox (sent with the time it was
 * finished, so XP counts that day).
 */
export async function saveLesson(lessonId: string, score: number, missed: string[], at?: string): Promise<'saved' | 'queued'> {
  if (!isOnline()) {
    enqueue({ type: 'lesson', at: at ?? new Date().toISOString(), lessonId, score, missed });
    return 'queued';
  }
  const { error } = await supabase.rpc('complete_lesson', {
    p_lesson_id: lessonId,
    p_score: score,
    p_missed: missed,
    ...(at ? { p_at: at } : {}),
  });
  if (!error) return 'saved';
  if (!at && isNetworkError(error)) {
    enqueue({ type: 'lesson', at: new Date().toISOString(), lessonId, score, missed });
    return 'queued';
  }
  throw error;
}

/** Lessons in course order, flattened. */
export function allLessons(units: UnitWithLessons[]): LessonSummary[] {
  return units.flatMap((u) => u.lessons);
}

/**
 * The lesson to do next: the first unfinished lesson at or after the learner's starting point
 * (from the placement test), else the first unfinished lesson overall.
 */
export function nextLesson(units: UnitWithLessons[], progress: Progress | undefined, startLessonId?: string | null) {
  const lessons = allLessons(units);
  const start = Math.max(0, lessons.findIndex((l) => l.id === startLessonId));
  const done = (l: LessonSummary) => progress?.has(l.id);
  return lessons.slice(start).find((l) => !done(l)) ?? lessons.find((l) => !done(l)) ?? null;
}

/** Unit themes that suit each learning goal; matching units are highlighted on the roadmap. */
export const GOAL_THEMES: Record<LearningGoal, string[]> = {
  travel: ['travel', 'places', 'food', 'money'],
  business: ['work', 'money', 'communication', 'numbers'],
  hsk_exam: [],
  study_abroad: ['school', 'places', 'daily-life', 'people'],
  casual: ['hobbies', 'food', 'daily-life', 'people'],
};
