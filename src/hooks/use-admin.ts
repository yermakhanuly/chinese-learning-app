import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useProfile } from '@/hooks/use-profile';
import type { EditKind } from '@/lib/content-rows';
import { supabase } from '@/lib/supabase';

/** Admin dashboard data (web). Every query is also checked by the database (RLS / is_admin()). */

export function useIsAdmin() {
  const { data, isPending } = useProfile();
  return { admin: !!data?.is_admin, loading: isPending };
}

async function adminFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const res = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(res?.error ?? "Couldn't reach the server.");
  }
  return data as T;
}

export type Overview = {
  learners: number;
  active_7d: number;
  premium: number;
  subscribers: number;
  open_reports: number;
  errors_24h: number;
  open_drafts: number;
  tutor_tokens_today: number;
  tutor_tokens_30d: number;
};

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await supabase.rpc('admin_overview');
      if (error) throw error;
      return data as Overview;
    },
  });
}

export type LearnerRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_active: string | null;
  total_xp: number;
  premium: boolean;
  premium_until: string | null;
  subscription_status: string | null;
  is_admin: boolean;
  tutor_input_30d: number;
  tutor_output_30d: number;
};

export function useAdminLearners(search: string) {
  return useQuery({
    queryKey: ['admin', 'learners', search],
    queryFn: async (): Promise<LearnerRow[]> => {
      const { data, error } = await supabase.rpc('admin_learners', { p_search: search, p_limit: 100, p_offset: 0 });
      if (error) throw error;
      return data as LearnerRow[];
    },
  });
}

export function useSetPremium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ user, until }: { user: string; until: string | null }) => {
      const { error } = await supabase.rpc('admin_set_premium', { p_user: user, p_until: until });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// --- Content ----------------------------------------------------------------------------------------

export const KINDS: { value: EditKind; label: string; table: string; key: string; title: string }[] = [
  { value: 'lesson', label: 'Lessons', table: 'lessons', key: 'id', title: 'title' },
  { value: 'unit', label: 'Units', table: 'units', key: 'id', title: 'title' },
  { value: 'grammar', label: 'Grammar', table: 'grammar_points', key: 'id', title: 'title' },
  { value: 'reading', label: 'Reading', table: 'reading_texts', key: 'id', title: 'title' },
  { value: 'scenario', label: 'Role-plays', table: 'tutor_scenarios', key: 'id', title: 'title' },
  { value: 'word', label: 'Words', table: 'words', key: 'simplified', title: 'pinyin' },
];
export const kindInfo = (kind: EditKind) => KINDS.find((k) => k.value === kind)!;

export type ContentItem = { id: string; title: string; edited_at: string | null };

export function useContentList(kind: EditKind, search: string) {
  return useQuery({
    queryKey: ['admin', 'content', kind, search],
    queryFn: async (): Promise<ContentItem[]> => {
      const k = kindInfo(kind);
      let q = supabase.from(k.table).select(`${k.key}, ${k.title}, edited_at`).limit(200);
      // Letters, digits, Chinese and - only (the filter syntax uses , ( ) and .).
      const term = search.trim().replace(/[^\p{L}\p{N}-]/gu, '');
      if (kind === 'word') {
        // ~11,000 words: search only.
        if (!term) return [];
        const latin = term.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        q = latin ? q.ilike('pinyin_plain', `${latin}%`).order('frequency') : q.eq('simplified', term);
      } else {
        q = q.order(k.key);
        if (term) q = q.or(`${k.key}.ilike.*${term}*,${k.title}.ilike.*${term}*`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Record<string, string | null>[]).map((r) => ({
        id: r[k.key]!,
        title: r[k.title] ?? '',
        edited_at: r.edited_at,
      }));
    },
  });
}

export function useLiveItem(kind: EditKind, id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'live', kind, id],
    enabled: !!id,
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const k = kindInfo(kind);
      const { data, error } = await supabase.from(k.table).select('*').eq(k.key, id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type Draft = {
  id: string;
  kind: EditKind;
  ref_id: string;
  is_new: boolean;
  data: unknown;
  status: 'draft' | 'published' | 'discarded';
  problems: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
  checked_at: string | null;
  published_at: string | null;
};

export function useDrafts(status: 'draft' | 'published' = 'draft') {
  return useQuery({
    queryKey: ['admin', 'drafts', status],
    queryFn: async (): Promise<Draft[]> => {
      const { data, error } = await supabase
        .from('content_drafts')
        .select('*')
        .eq('status', status)
        .order(status === 'draft' ? 'updated_at' : 'published_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Draft[];
    },
  });
}

/** The open draft for an item, if there is one. */
export function useOpenDraft(kind: EditKind, id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'draft', kind, id],
    enabled: !!id,
    queryFn: async (): Promise<Draft | null> => {
      const { data, error } = await supabase
        .from('content_drafts')
        .select('*')
        .eq('kind', kind)
        .eq('ref_id', id!)
        .eq('status', 'draft')
        .maybeSingle();
      if (error) throw error;
      return data as Draft | null;
    },
  });
}

export function useSaveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id?: string; kind: EditKind; ref_id: string; is_new: boolean; data: unknown; note?: string }): Promise<Draft> => {
      if (d.id) {
        const { data, error } = await supabase
          .from('content_drafts')
          .update({ data: d.data, note: d.note ?? null, updated_at: new Date().toISOString() })
          .eq('id', d.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as Draft;
      }
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('content_drafts')
        .insert({ kind: d.kind, ref_id: d.ref_id, is_new: d.is_new, data: d.data, note: d.note ?? null, created_by: user.user?.id })
        .select('*')
        .single();
      if (error) throw new Error(error.code === '23505' ? 'This item already has an open draft.' : error.message);
      return data as Draft;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useDiscardDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('content_drafts').update({ status: 'discarded' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export type CheckResult = { problems: string[]; row: Record<string, unknown>; published?: boolean };

export function useCheckDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => adminFn<CheckResult>({ action: 'check', draft_id: draftId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'draft'] }),
  });
}

export function usePublishDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, acceptProblems }: { draftId: string; acceptProblems?: boolean }) =>
      adminFn<CheckResult>({ action: 'publish', draft_id: draftId, accept_problems: !!acceptProblems }),
    // Learners' cached content is refreshed on their next visit (queries refetch on focus).
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useMakeAudio() {
  return useMutation({
    mutationFn: (v: { texts: string[]; voice?: 'female' | 'male'; replace?: boolean }) =>
      adminFn<{ made: string[]; skipped: string[] }>({ action: 'audio', ...v }),
  });
}

export function useUploadAudio() {
  return useMutation({
    mutationFn: (v: { text: string; mp3: string }) => adminFn<{ key: string }>({ action: 'upload_audio', ...v }),
  });
}

// --- Reports and errors -----------------------------------------------------------------------------

export type Report = {
  id: number;
  user_id: string | null;
  kind: string;
  ref: string | null;
  category: string;
  message: string;
  context: Record<string, unknown>;
  status: 'open' | 'resolved' | 'dismissed';
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

export function useReports(status: Report['status']) {
  return useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: async (): Promise<Report[]> => {
      const { data, error } = await supabase.from('reports').select('*').eq('status', status).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as Report[];
    },
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: number; status: Report['status']; note?: string }) => {
      const { error } = await supabase
        .from('reports')
        .update({ status, admin_note: note ?? null, resolved_at: status === 'open' ? null : new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export type ClientError = { id: number; user_id: string | null; source: string; message: string; stack: string | null; context: Record<string, unknown>; created_at: string };

export function useClientErrors() {
  return useQuery({
    queryKey: ['admin', 'errors'],
    queryFn: async (): Promise<ClientError[]> => {
      const { data, error } = await supabase.from('client_errors').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as ClientError[];
    },
  });
}
