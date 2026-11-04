import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { searchParams } from '@/lib/search';
import type { Token } from '@/lib/sentences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

/** A dictionary hit: an HSK word or a CC-CEDICT entry outside the HSK lists. */
export type WordSummary = {
  source: 'hsk' | 'dictionary';
  simplified: string;
  traditional: string;
  pinyin: string;
  meanings: string[];
  hsk_level: number | null;
};

export type Sentence = {
  id: number;
  simplified: string;
  traditional: string;
  english: string;
  english_id: number;
  tokens: Token[];
};

export type WordForm = { traditional: string; pinyin: string; meanings: string[]; classifiers: string[] };

export type WordDetail = {
  simplified: string;
  traditional: string;
  pinyin: string;
  meanings: string[];
  hsk_level: number | null;
  hsk_2021_level: number | null;
  frequency: number | null;
  pos: string[];
  classifiers: string[];
  /** Other readings of the same characters (multi-reading words like 行 xíng / háng). */
  otherForms: WordForm[];
  sentences: Sentence[];
  topics: { slug: string; name: string }[];
  source: 'hsk' | 'dictionary';
};

export type Topic = { slug: string; name: string; hanzi: string; word_count: number };

const PAGE = 50;
const WORD_COLUMNS = 'simplified, traditional, pinyin, meanings, hsk_level';

export function useDictionarySearch(input: string) {
  const params = searchParams(input);
  return useQuery({
    queryKey: ['search', params],
    enabled: !!params,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WordSummary[]> => {
      const { data, error } = await supabase.rpc('search_dictionary', { ...params!, max_results: 40 });
      if (error) throw error;
      return data as WordSummary[];
    },
  });
}

export function useWord(word: string | undefined) {
  return useQuery({
    queryKey: ['word', word],
    enabled: !!word,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<WordDetail | null> => {
      const { data: hsk, error } = await supabase
        .from('words')
        .select(
          'id, simplified, traditional, pinyin, meanings, hsk_level, hsk_2021_level, frequency, pos, classifiers, forms, ' +
            'word_sentences(position, sentences(id, simplified, traditional, english, english_id, tokens)), ' +
            'word_topics(topics(slug, name, position))',
        )
        .eq('simplified', word!)
        .maybeSingle();
      if (error) throw error;
      if (hsk) {
        const row = hsk as unknown as HskRow;
        return {
          source: 'hsk',
          simplified: row.simplified,
          traditional: row.traditional,
          pinyin: row.pinyin,
          meanings: row.meanings,
          hsk_level: row.hsk_level,
          hsk_2021_level: row.hsk_2021_level,
          frequency: row.frequency,
          pos: row.pos,
          classifiers: row.classifiers,
          otherForms: mergeForms(row.forms.filter((f) => f.pinyin !== row.pinyin || f.traditional !== row.traditional)),
          sentences: [...row.word_sentences].sort((a, b) => a.position - b.position).map((ws) => ws.sentences),
          topics: row.word_topics
            .map((wt) => wt.topics)
            .sort((a, b) => a.position - b.position)
            .map(({ slug, name }) => ({ slug, name })),
        };
      }
      // Not an HSK word: show every CC-CEDICT reading of these characters.
      const { data: entries, error: dictError } = await supabase
        .from('dictionary_entries')
        .select('simplified, traditional, pinyin, definitions')
        // Quoted, so commas or brackets in a hand-typed URL can't change the filter.
        .or(`simplified.eq."${quoteless(word!)}",traditional.eq."${quoteless(word!)}"`)
        .order('id')
        .limit(20);
      if (dictError) throw dictError;
      if (!entries?.length) return null;
      // Lowercase readings first; surnames and place names after.
      const sorted = [...entries].sort((a, b) => Number(/^[A-Z]/.test(a.pinyin)) - Number(/^[A-Z]/.test(b.pinyin)));
      const [first, ...rest] = sorted;
      return {
        source: 'dictionary',
        simplified: first.simplified,
        traditional: first.traditional,
        pinyin: first.pinyin,
        meanings: first.definitions,
        hsk_level: null,
        hsk_2021_level: null,
        frequency: null,
        pos: [],
        classifiers: [],
        otherForms: rest.map((e) => ({
          traditional: e.traditional,
          pinyin: e.pinyin,
          meanings: e.definitions,
          classifiers: [],
        })),
        sentences: [],
        topics: [],
      };
    },
  });
}

function quoteless(text: string): string {
  return text.replace(/["\\]/g, '');
}

type HskRow = {
  simplified: string;
  traditional: string;
  pinyin: string;
  meanings: string[];
  hsk_level: number | null;
  hsk_2021_level: number | null;
  frequency: number | null;
  pos: string[];
  classifiers: string[];
  forms: { traditional: string; pinyin: string; meanings: string[]; classifiers: string[] }[];
  word_sentences: { position: number; sentences: Sentence }[];
  word_topics: { topics: { slug: string; name: string; position: number } }[];
};

/** The source repeats a reading for each traditional variant; show each pinyin once. */
function mergeForms(forms: WordForm[]): WordForm[] {
  const byPinyin = new Map<string, WordForm>();
  for (const f of forms) {
    const existing = byPinyin.get(f.pinyin);
    if (existing) existing.meanings = [...new Set([...existing.meanings, ...f.meanings])];
    else byPinyin.set(f.pinyin, { ...f, meanings: [...f.meanings] });
  }
  return [...byPinyin.values()];
}

export type WordListFilter = { level?: number; topic?: string };

/** HSK words for browsing, most common first, 50 at a time. */
export function useWordList({ level, topic }: WordListFilter) {
  return useInfiniteQuery({
    queryKey: ['word-list', level ?? null, topic ?? null],
    initialPageParam: 0,
    staleTime: 60 * 60 * 1000,
    getNextPageParam: (last: WordSummary[], pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
    queryFn: async ({ pageParam }): Promise<WordSummary[]> => {
      let query = supabase
        .from('words')
        .select(topic ? `${WORD_COLUMNS}, word_topics!inner(topic_slug)` : WORD_COLUMNS)
        .not('hsk_level', 'is', null);
      if (level) query = query.eq('hsk_level', level);
      if (topic) query = query.eq('word_topics.topic_slug', topic);
      const { data, error } = await query
        .order('hsk_level')
        .order('frequency', { ascending: true, nullsFirst: false })
        .order('id')
        .range(pageParam, pageParam + PAGE - 1);
      if (error) throw error;
      return (data as unknown as WordSummary[]).map((w) => ({ ...w, source: 'hsk' as const }));
    },
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ['topics'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Topic[]> => {
      const { data, error } = await supabase
        .from('topic_word_counts')
        .select('slug, name, hanzi, word_count')
        .order('position');
      if (error) throw error;
      return data as Topic[];
    },
  });
}

// ---------------------------------------------------------------------------
// Saved words

type SavedRow = { word: string; created_at: string };

export function useSavedWords() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['saved-words', userId],
    enabled: !!userId,
    queryFn: async (): Promise<SavedRow[]> => {
      const { data, error } = await supabase
        .from('saved_words')
        .select('word, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Details for the saved words (HSK words and other dictionary entries), newest first. */
export function useSavedWordDetails() {
  const saved = useSavedWords();
  const words = saved.data?.map((r) => r.word) ?? [];
  const details = useQuery({
    queryKey: ['saved-word-details', words],
    enabled: words.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<WordSummary[]> => {
      const { data: hsk, error } = await supabase.from('words').select(WORD_COLUMNS).in('simplified', words);
      if (error) throw error;
      const found = new Map<string, WordSummary>(hsk.map((w) => [w.simplified, { ...w, source: 'hsk' }]));
      const missing = words.filter((w) => !found.has(w));
      if (missing.length) {
        const { data: dict, error: dictError } = await supabase
          .from('dictionary_entries')
          .select('simplified, traditional, pinyin, definitions')
          .in('simplified', missing)
          .order('id');
        if (dictError) throw dictError;
        for (const e of dict) {
          if (found.has(e.simplified)) continue;
          found.set(e.simplified, {
            source: 'dictionary',
            simplified: e.simplified,
            traditional: e.traditional,
            pinyin: e.pinyin,
            meanings: e.definitions,
            hsk_level: null,
          });
        }
      }
      return words.map((w) => found.get(w)).filter((w): w is WordSummary => !!w);
    },
  });
  return { saved, details };
}

export function useToggleSaved() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  const key = ['saved-words', userId];

  return useMutation({
    mutationFn: async ({ word, save }: { word: string; save: boolean }) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = save
        ? await supabase
            .from('saved_words')
            .upsert({ user_id: userId, word }, { onConflict: 'user_id,word', ignoreDuplicates: true })
        : await supabase.from('saved_words').delete().eq('user_id', userId).eq('word', word);
      if (error) throw error;
    },
    // Instant feedback; rolled back if the server refuses.
    onMutate: async ({ word, save }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SavedRow[]>(key);
      const rest = (previous ?? []).filter((r) => r.word !== word);
      queryClient.setQueryData<SavedRow[]>(
        key,
        save ? [{ word, created_at: new Date().toISOString() }, ...rest] : rest,
      );
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
