import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WordSummary } from '@/hooks/use-dictionary';
import { useInvalidateReview } from '@/hooks/use-review';
import type { Etymology } from '@/lib/characters';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type CharacterInfo = {
  character: string;
  strokes: string[];
  medians: number[][][];
  stroke_count: number;
  radical: string | null;
  decomposition: string | null;
  etymology: Etymology | null;
  definition: string | null;
  pinyin: string[];
  hsk_level: number | null;
  traditional_only: boolean;
};

export type CharacterSummary = Pick<CharacterInfo, 'character' | 'pinyin' | 'definition' | 'hsk_level' | 'stroke_count'>;

const SUMMARY = 'character, pinyin, definition, hsk_level, stroke_count';

export function useCharacter(character: string | undefined) {
  return useQuery({
    queryKey: ['character', character],
    enabled: !!character,
    staleTime: Infinity,
    queryFn: async (): Promise<CharacterInfo | null> => {
      const { data, error } = await supabase.from('characters').select('*').eq('character', character!).maybeSingle();
      if (error) throw error;
      return data as CharacterInfo | null;
    },
  });
}

/** Stroke data for several characters (quizzes, word pages). */
export function useCharacters(characters: string[]) {
  return useQuery({
    queryKey: ['characters', characters],
    enabled: characters.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Map<string, CharacterInfo>> => {
      const { data, error } = await supabase.from('characters').select('*').in('character', characters);
      if (error) throw error;
      return new Map((data as CharacterInfo[]).map((c) => [c.character, c]));
    },
  });
}

/** Simplified characters introduced at an HSK level, simplest first. */
export function useCharacterList(level: number) {
  return useQuery({
    queryKey: ['character-list', level],
    staleTime: Infinity,
    queryFn: async (): Promise<CharacterSummary[]> => {
      const { data, error } = await supabase
        .from('characters')
        .select(SUMMARY)
        .eq('hsk_level', level)
        .eq('traditional_only', false)
        .order('stroke_count')
        .order('character')
        .limit(2000);
      if (error) throw error;
      return data as CharacterSummary[];
    },
  });
}

/** Summaries (no strokes) for a set of characters, e.g. look-alike groups. */
export function useCharacterSummaries(characters: string[]) {
  return useQuery({
    queryKey: ['character-summaries', characters],
    enabled: characters.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Map<string, CharacterSummary>> => {
      const { data, error } = await supabase.from('characters').select(SUMMARY).in('character', characters);
      if (error) throw error;
      return new Map((data as CharacterSummary[]).map((c) => [c.character, c]));
    },
  });
}

/** HSK words that use a character (easiest and most common first). */
export function useWordsWithCharacter(character: string | undefined) {
  return useQuery({
    queryKey: ['words-with', character],
    enabled: !!character,
    staleTime: Infinity,
    queryFn: async (): Promise<WordSummary[]> => {
      const { data, error } = await supabase
        .from('words')
        .select('simplified, traditional, pinyin, meanings, hsk_level')
        .or(`simplified.like.*${character}*,traditional.like.*${character}*`)
        .order('hsk_level', { nullsFirst: false })
        .order('frequency', { nullsFirst: false })
        .limit(12);
      if (error) throw error;
      return data.map((w) => ({ ...w, source: 'hsk' as const }));
    },
  });
}

/** Characters of the words in the learner's review (what they've learned). */
export function useLearnedCharacters() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['learned-characters', userId],
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('review_cards').select('word').eq('kind', 'word').eq('direction', 'read');
      if (error) throw error;
      return [...new Set(data.flatMap((r) => [...(r.word as string)]))];
    },
  });
}

/** Whether writing this character is in the learner's review, and a toggle. */
export function useWritingCard(character: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const invalidateReview = useInvalidateReview();
  const key = ['writing-card', userId, character];
  const status = useQuery({
    queryKey: key,
    enabled: !!userId && !!character,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('review_cards')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'character')
        .eq('character', character!);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const toggle = useMutation({
    mutationFn: async (add: boolean) => {
      const { error } = await supabase.rpc(add ? 'add_writing_card' : 'remove_writing_card', { p_character: character });
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
