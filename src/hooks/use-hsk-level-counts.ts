import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const HSK_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

export function hskLevelLabel(level: number): string {
  return level === 7 ? 'HSK 7–9' : `HSK ${level}`;
}

/** Number of words per 2026 HSK level, straight from the database. */
export function useHskLevelCounts() {
  return useQuery({
    queryKey: ['hsk-level-counts'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.all(
        HSK_LEVELS.map(async (level) => {
          const { count, error } = await supabase
            .from('words')
            .select('id', { count: 'exact', head: true })
            .eq('hsk_level', level);
          if (error) throw error;
          return { level, count: count ?? 0 };
        }),
      );
      return results;
    },
  });
}
