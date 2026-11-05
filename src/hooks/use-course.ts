import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { LearningGoal } from '@/constants/profile-options';
import type { Lesson, Step } from '@/lib/lessons';
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
export function useCourse(level = 1) {
  return useQuery({
    queryKey: ['course', level],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<UnitWithLessons[]> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, hsk_level, position, title, title_zh, theme, description, lessons(id, unit_id, position, title, kind, words, minutes)')
        .eq('hsk_level', level)
        .order('position');
      if (error) throw error;
      return (data as UnitWithLessons[]).map((u) => ({ ...u, lessons: [...u.lessons].sort((a, b) => a.position - b.position) }));
    },
  });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: ['lesson', id],
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<LessonContent | null> => {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, unit_id, position, title, kind, words, minutes, steps, readings, word_details')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as LessonContent | null;
    },
  });
}

/** Finished lessons of the signed-in learner (empty for guests). */
export function useProgress() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['progress', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Progress> => {
      const { data, error } = await supabase.from('lesson_progress').select('lesson_id, best_score, completed_at');
      if (error) throw error;
      return new Map(data.map((r) => [r.lesson_id, { best_score: r.best_score, completed_at: r.completed_at }]));
    },
  });
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ lessonId, score }: { lessonId: string; score: number }) => {
      const { error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId, p_score: Math.round(score) });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress', session?.user.id] }),
  });
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
