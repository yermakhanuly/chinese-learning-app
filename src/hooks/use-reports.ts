import { useMutation } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ReportKind = 'lesson' | 'word' | 'grammar' | 'reading' | 'tutor' | 'audio' | 'other';
export type ReportCategory = 'wrong' | 'unclear' | 'audio' | 'bug' | 'other';

/** Sends a problem report (signed-in learners, at most 20 a day). */
export function useSubmitReport() {
  return useMutation({
    mutationFn: async (r: { kind: ReportKind; ref: string; category: ReportCategory; message: string; context: Record<string, string> }) => {
      const { error } = await supabase.rpc('submit_report', {
        p_kind: r.kind,
        p_ref: r.ref,
        p_category: r.category,
        p_message: r.message,
        p_context: r.context,
      });
      if (error) {
        throw new Error(
          error.message.includes('limit') ? "You've sent a lot of reports today. Thank you! Try again tomorrow." : "Couldn't send the report. Check your connection.",
        );
      }
    },
  });
}
