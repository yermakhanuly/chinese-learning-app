import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { audioKey } from '@/lib/audio-key';
import { bytesToBase64 } from '@/lib/base64';
import { supabase } from '@/lib/supabase';

export type Clip = { key: string; text: string; kind: 'word' | 'sentence' | 'syllable'; hsk_level: number | null };

/** The model voice's pitch curve for a text (recorded clips only). */
export function useModelPitch(text: string | undefined) {
  return useQuery({
    queryKey: ['model-pitch', text],
    enabled: !!text,
    staleTime: Infinity,
    queryFn: async (): Promise<[number, number | null][] | null> => {
      const { data, error } = await supabase.from('audio_clips').select('pitch').eq('key', audioKey(text!)).maybeSingle();
      if (error) throw error;
      return (data?.pitch as [number, number | null][] | undefined) ?? null;
    },
  });
}

/** Texts with recorded audio, by kind and HSK level (for listening and speaking practice). */
export function useClips(kind: 'word' | 'sentence', level: number) {
  return useQuery({
    queryKey: ['clips', kind, level],
    staleTime: Infinity,
    queryFn: async (): Promise<Clip[]> => {
      const { data, error } = await supabase
        .from('audio_clips')
        .select('key, text, kind, hsk_level')
        .eq('kind', kind)
        .eq('hsk_level', level)
        .limit(1000);
      if (error) throw error;
      return data as Clip[];
    },
  });
}

export type SyllableScore = {
  char: string;
  pinyin: string | null;
  tone: number | null;
  accuracy: number;
  error: string;
  start: number | null;
  end: number | null;
};

export type PronunciationResult = {
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  heard: string;
  syllables: SyllableScore[];
  left: number;
};

/** Sends a recording to the pronounce Edge Function (Azure pronunciation assessment). */
export function useScorePronunciation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, wav }: { text: string; wav: Uint8Array }): Promise<PronunciationResult> => {
      const { data, error } = await supabase.functions.invoke('pronounce', { body: { text, audio: bytesToBase64(wav) } });
      if (error) {
        // The function's own message (limit reached, no speech heard…) is in the response body.
        const context = (error as { context?: Response }).context;
        const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
        throw new Error(body?.error ?? "Couldn't check your pronunciation. Check your connection.");
      }
      return data as PronunciationResult;
    },
    // Each check earns XP.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress'] }),
  });
}

export type WordPinyin = { simplified: string; pinyin: string; pinyin_numeric: string; meanings: string[]; hsk_level: number | null };

/** Pinyin and meanings for a list of words. */
export function useWordsInfo(words: string[]) {
  return useQuery({
    queryKey: ['words-info', words],
    enabled: words.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Map<string, WordPinyin>> => {
      const { data, error } = await supabase
        .from('words')
        .select('simplified, pinyin, pinyin_numeric, meanings, hsk_level')
        .in('simplified', words);
      if (error) throw error;
      return new Map((data as WordPinyin[]).map((w) => [w.simplified, w]));
    },
  });
}

/** English translations for sentences (lesson-only sentences have none). */
export function useSentenceTranslations(texts: string[]) {
  return useQuery({
    queryKey: ['sentence-english', texts],
    enabled: texts.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<{ simplified: string; english: string }[]> => {
      const { data, error } = await supabase.from('sentences').select('simplified, english').in('simplified', texts);
      if (error) throw error;
      const seen = new Set<string>();
      return data.filter((s) => !seen.has(s.simplified) && seen.add(s.simplified));
    },
  });
}
