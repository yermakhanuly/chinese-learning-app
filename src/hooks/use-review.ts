import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { localDayStart, type Deck, type FsrsCard, type Grade, type ReviewCardRow, type WordContent } from '@/lib/srs';
import { useAuth } from '@/providers/auth';

export type ReviewSummary = { due: number; new: number; total: number; weak: number };

export type NotebookEntry = {
  word: string;
  misses: number;
  recent_misses: number;
  last_missed_at: string;
  weak: boolean;
  content: WordContent;
};

export type CustomCard = { id: string; front: string; back: string; zh: string | null; created_at: string };

/** Everything that changes when cards are added or reviewed. */
const REVIEW_KEYS = ['review-summary', 'review-queue', 'mistakes', 'custom-cards'];

export function useInvalidateReview() {
  const queryClient = useQueryClient();
  return () => Promise.all(REVIEW_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
}

/** Due / new counts for today (signed-in learners). */
export function useReviewSummary() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['review-summary', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ReviewSummary> => {
      const { data, error } = await supabase.rpc('review_summary', { p_day_start: localDayStart() }).single();
      if (error) throw error;
      const d = data as Record<keyof ReviewSummary, number | string>;
      return { due: Number(d.due), new: Number(d.new), total: Number(d.total), weak: Number(d.weak) };
    },
  });
}

/** Today's cards for a deck. Fetched once per session (not refetched while reviewing). */
export function useReviewQueue(deck: Deck, enabled = true) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['review-queue', userId, deck],
    enabled: !!userId && enabled,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ReviewCardRow[]> => {
      const { data, error } = await supabase.rpc('review_queue', { p_day_start: localDayStart(), p_deck: deck });
      if (error) throw error;
      return data as ReviewCardRow[];
    },
  });
}

/**
 * Saves one answer (retrying a few times on network errors). A plain function rather than a
 * mutation hook: answers are sent in quick succession and each needs its own result.
 */
export async function recordReview(cardId: string, grade: Grade, card: FsrsCard, attempts = 3): Promise<void> {
  for (let i = 1; ; i++) {
    const { error } = await supabase.rpc('record_review', { p_card_id: cardId, p_rating: grade, p_card: card });
    if (!error) return;
    if (i >= attempts) throw error;
    await new Promise((r) => setTimeout(r, 500 * i));
  }
}

export function useMistakeNotebook() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['mistakes', userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotebookEntry[]> => {
      const { data, error } = await supabase.rpc('mistake_notebook');
      if (error) throw error;
      return (data as NotebookEntry[]).map((e) => ({ ...e, misses: Number(e.misses), recent_misses: Number(e.recent_misses) }));
    },
  });
}

export function useCustomCards() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['custom-cards', userId],
    enabled: !!userId,
    queryFn: async (): Promise<CustomCard[]> => {
      const { data, error } = await supabase
        .from('custom_cards')
        .select('id, front, back, zh, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddCustomCard() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: async (card: { front: string; back: string; zh: string | null }) => {
      const { error } = await supabase.from('custom_cards').insert(card);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCustomCard() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Sentence ids the learner has added to review. */
export function useSentenceCards() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['review-summary', userId, 'sentences'],
    enabled: !!userId,
    queryFn: async (): Promise<Set<number>> => {
      const { data, error } = await supabase.from('review_cards').select('sentence_id').eq('kind', 'sentence');
      if (error) throw error;
      return new Set(data.map((r) => r.sentence_id as number));
    },
  });
}

export function useAddSentenceCard() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: async (sentenceId: number) => {
      const { error } = await supabase.rpc('add_sentence_card', { p_sentence_id: sentenceId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
