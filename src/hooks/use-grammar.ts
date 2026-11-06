import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useInvalidateReview } from '@/hooks/use-review';
import type { CommonMistake, GrammarExercise, ReadingQuestion, ReadingSentence, ReadingSpeaker } from '@/lib/grammar';
import type { Example } from '@/lib/lessons';
import type { Token } from '@/lib/sentences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Grammar

export type GrammarSummary = {
  id: string;
  hsk_level: number;
  position: number;
  title: string;
  topic: string;
  summary: string;
  structure: string[];
  examples: Example[];
};

export type GrammarPointRow = GrammarSummary & {
  explanation: string;
  mistakes: CommonMistake[];
  related: string[];
  exercises: GrammarExercise[];
  readings: Record<string, Token[]>;
  lessons: string[];
};

/** Every grammar point (title, patterns, examples — enough to search), in library order. */
export function useGrammarList() {
  return useQuery({
    queryKey: ['grammar-list'],
    staleTime: HOUR,
    queryFn: async (): Promise<GrammarSummary[]> => {
      const { data, error } = await supabase
        .from('grammar_points')
        .select('id, hsk_level, position, title, topic, summary, structure, examples')
        .order('hsk_level')
        .order('position');
      if (error) throw error;
      return data as GrammarSummary[];
    },
  });
}

export function useGrammarPoint(id: string | undefined) {
  return useQuery({
    queryKey: ['grammar', id],
    enabled: !!id,
    staleTime: HOUR,
    queryFn: async (): Promise<GrammarPointRow | null> => {
      const { data, error } = await supabase.from('grammar_points').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as GrammarPointRow | null;
    },
  });
}

/** Best practice score per grammar point (signed-in learners). */
export function useGrammarProgress() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['grammar-progress', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from('grammar_progress').select('grammar_id, best_score');
      if (error) throw error;
      return new Map(data.map((r) => [r.grammar_id as string, r.best_score as number]));
    },
  });
}

/** Saves a finished practice; missed exercises go to the mistake notebook. */
export function useCompleteGrammar() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ id, score, missed }: { id: string; score: number; missed: number[] }) => {
      const { error } = await supabase.rpc('complete_grammar', {
        p_grammar_id: id,
        p_score: Math.round(score),
        p_missed: [...new Set(missed)],
      });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['grammar-progress', session?.user.id] }),
        queryClient.invalidateQueries({ queryKey: ['grammar-mistakes'] }),
      ]),
  });
}

/** Whether this point is in the learner's review, and a toggle. */
export function useGrammarCard(id: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const invalidateReview = useInvalidateReview();
  const key = ['grammar-card', userId, id];
  const status = useQuery({
    queryKey: key,
    enabled: !!userId && !!id,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('review_cards')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'grammar')
        .eq('grammar_id', id!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const toggle = useMutation({
    mutationFn: async (add: boolean) => {
      const { error } = await supabase.rpc(add ? 'add_grammar_card' : 'remove_grammar_card', { p_grammar_id: id });
      if (error) throw error;
      return add;
    },
    onSuccess: (added) => {
      queryClient.setQueryData(key, added);
      return invalidateReview();
    },
  });
  return { status, toggle };
}

export type GrammarMistake = {
  grammar_id: string;
  title: string;
  hsk_level: number;
  misses: number;
  last_missed_at: string;
  exercises: number[] | null;
};

export function useGrammarMistakes() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['grammar-mistakes', userId],
    enabled: !!userId,
    queryFn: async (): Promise<GrammarMistake[]> => {
      const { data, error } = await supabase.rpc('grammar_mistakes');
      if (error) throw error;
      return (data as GrammarMistake[]).map((m) => ({ ...m, misses: Number(m.misses) }));
    },
  });
}

// ---------------------------------------------------------------------------
// Reading

export type ReadingSummary = {
  id: string;
  hsk_level: number;
  position: number;
  kind: 'story' | 'dialogue';
  title: string;
  title_zh: string;
  summary: string;
  char_count: number;
};

export type WordInfo = { pinyin: string; meanings: string[]; level: number | null };

export type ReadingRow = ReadingSummary & {
  speakers: ReadingSpeaker[];
  sentences: ReadingSentence[];
  questions: ReadingQuestion[];
  new_words: { word: string; en: string }[];
  grammar: string[];
  readings: Record<string, Token[]>;
  word_details: Record<string, WordInfo>;
};

export function useReadingList() {
  return useQuery({
    queryKey: ['reading-list'],
    staleTime: HOUR,
    queryFn: async (): Promise<ReadingSummary[]> => {
      const { data, error } = await supabase
        .from('reading_texts')
        .select('id, hsk_level, position, kind, title, title_zh, summary, char_count')
        .order('hsk_level')
        .order('position');
      if (error) throw error;
      return data as ReadingSummary[];
    },
  });
}

export function useReadingText(id: string | undefined) {
  return useQuery({
    queryKey: ['reading', id],
    enabled: !!id,
    staleTime: HOUR,
    queryFn: async (): Promise<ReadingRow | null> => {
      const { data, error } = await supabase.from('reading_texts').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as ReadingRow | null;
    },
  });
}

/** Best comprehension score per text (signed-in learners). */
export function useReadingProgress() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['reading-progress', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from('reading_progress').select('text_id, best_score');
      if (error) throw error;
      return new Map(data.map((r) => [r.text_id as string, r.best_score as number]));
    },
  });
}

export function useCompleteReading() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number }) => {
      const { error } = await supabase.rpc('complete_reading', { p_text_id: id, p_score: Math.round(score) });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reading-progress', session?.user.id] }),
  });
}

/** Grammar point titles by id (for links from readings and related points). */
export function useGrammarTitles() {
  const list = useGrammarList();
  return new Map((list.data ?? []).map((g) => [g.id, g.title]));
}
