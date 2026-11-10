import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useProfile } from '@/hooks/use-profile';
import { useInvalidateProgress } from '@/hooks/use-progress';
import { bytesToBase64 } from '@/lib/base64';
import type { Token } from '@/lib/sentences';
import { playRecording } from '@/lib/speech';
import { supabase, supabaseUrl } from '@/lib/supabase';
import type {
  AiQuizQuestion,
  Conversation,
  ConversationFeedback,
  ExampleSentence,
  Phrase,
  SentenceBreakdown,
  SentenceCheck,
  TutorMessage,
  TutorMode,
} from '@/lib/tutor';
import { useAuth } from '@/providers/auth';

/** Premium (the AI tutor) is on while profiles.premium_until is in the future. */
export function useIsPremium() {
  const { data: profile, isPending } = useProfile();
  const until = profile?.premium_until ? new Date(profile.premium_until) : null;
  return { premium: !!until && until > new Date(), until, loading: isPending };
}

/** Calls the tutor Edge Function; errors carry the function's own message. */
export async function tutor<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tutor', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const res = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(res?.error ?? "Couldn't reach the AI tutor. Check your connection.");
  }
  return data as T;
}

export type ScenarioRow = {
  id: string;
  hsk_level: number;
  position: number;
  title: string;
  emoji: string;
  setting: string;
  ai_role: string;
  learner_role: string;
  voice: 'female' | 'male';
  goals: string[];
  opening: Phrase;
  phrases: Phrase[];
  readings: Record<string, Token[]>;
};

export function useScenarios() {
  return useQuery({
    queryKey: ['tutor', 'scenarios'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<ScenarioRow[]> => {
      const { data, error } = await supabase.from('tutor_scenarios').select('*').order('position');
      if (error) throw error;
      return data as ScenarioRow[];
    },
  });
}

const CONVERSATION_FIELDS = 'id, mode, scenario_id, topic, title, level, created_at, updated_at, finished_at, feedback';

export function useConversations() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tutor', 'conversations', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from('tutor_conversations')
        .select(CONVERSATION_FIELDS)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

export function useConversation(id: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tutor', 'conversation', id],
    enabled: !!session && !!id,
    queryFn: async (): Promise<{ conversation: Conversation; messages: TutorMessage[] } | null> => {
      const [c, m] = await Promise.all([
        supabase.from('tutor_conversations').select(CONVERSATION_FIELDS).eq('id', id!).maybeSingle(),
        supabase.from('tutor_messages').select('id, role, text, data, created_at').eq('conversation_id', id!).order('id'),
      ]);
      if (c.error) throw c.error;
      if (m.error) throw m.error;
      return c.data ? { conversation: c.data as Conversation, messages: m.data as TutorMessage[] } : null;
    },
  });
}

/** The learner's messages the tutor corrected, newest first (for the mistake notebook). */
export function useConversationMistakes() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tutor', 'mistakes', session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<(TutorMessage & { conversation_id: string })[]> => {
      const { data, error } = await supabase
        .from('tutor_messages')
        .select('id, role, text, data, created_at, conversation_id')
        .eq('role', 'user')
        .eq('data->correction->>ok', 'false')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as (TutorMessage & { conversation_id: string })[];
    },
  });
}

function useTutorCache() {
  const queryClient = useQueryClient();
  const invalidateProgress = useInvalidateProgress();
  return {
    /** Adds new messages to a cached conversation (and refreshes lists + XP). */
    append(id: string, messages: TutorMessage[]) {
      queryClient.setQueryData<{ conversation: Conversation; messages: TutorMessage[] } | null>(
        ['tutor', 'conversation', id],
        (old) => (old ? { ...old, messages: [...old.messages, ...messages.filter((m) => !old.messages.some((o) => o.id === m.id))] } : old),
      );
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'mistakes'] });
      void invalidateProgress();
    },
    put(conversation: Conversation, messages: TutorMessage[]) {
      queryClient.setQueryData(['tutor', 'conversation', conversation.id], { conversation, messages });
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'conversations'] });
    },
    refresh(id: string) {
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'conversation', id] });
      void queryClient.invalidateQueries({ queryKey: ['tutor', 'conversations'] });
    },
  };
}

export function useStartConversation() {
  const cache = useTutorCache();
  return useMutation({
    mutationFn: (body: { mode: TutorMode; scenario_id?: string; topic?: string }) =>
      tutor<{ conversation: Conversation; messages: TutorMessage[] }>({ action: 'start', ...body }),
    onSuccess: ({ conversation, messages }) => cache.put(conversation, messages),
  });
}

export function useSendMessage(id: string) {
  const cache = useTutorCache();
  return useMutation({
    mutationFn: (text: string) => tutor<{ messages: TutorMessage[] }>({ action: 'send', conversation_id: id, text }),
    onSuccess: ({ messages }) => cache.append(id, messages),
  });
}

/** Sends a recording; the tutor's reply is read aloud when it arrives. */
export function useVoiceMessage(id: string) {
  const cache = useTutorCache();
  return useMutation({
    mutationFn: (wav: Uint8Array) =>
      tutor<{ messages: TutorMessage[]; heard: string; audio_path: string }>({
        action: 'voice',
        conversation_id: id,
        audio: bytesToBase64(wav),
      }),
    onSuccess: ({ messages, audio_path }) => {
      cache.append(id, messages);
      const reply = messages[messages.length - 1];
      if (reply) void playRecording(`${supabaseUrl}${audio_path}`, `tutor-${reply.id}`);
    },
  });
}

export function useFinishConversation(id: string) {
  const cache = useTutorCache();
  return useMutation({
    mutationFn: () => tutor<{ feedback: ConversationFeedback }>({ action: 'finish', conversation_id: id }),
    onSuccess: () => cache.refresh(id),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tutor_conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tutor'] }),
  });
}

/** Reads a tutor line aloud in a natural voice (made once, then cached by the server). */
export function useSpeakTutor() {
  return useMutation({
    mutationFn: async ({ text, voice, id }: { text: string; voice?: 'female' | 'male'; id: string }) => {
      const { audio_path } = await tutor<{ audio_path: string }>({ action: 'speak', text, voice });
      await playRecording(`${supabaseUrl}${audio_path}`, id);
    },
  });
}

export function useCheckSentence() {
  return useMutation({ mutationFn: (text: string) => tutor<SentenceCheck>({ action: 'check', text }) });
}

export function useExplainSentence() {
  return useMutation({ mutationFn: (text: string) => tutor<SentenceBreakdown>({ action: 'explain', text }) });
}

export function useAiExamples() {
  return useMutation({
    mutationFn: async (word: string) => (await tutor<{ examples: ExampleSentence[] }>({ action: 'examples', word })).examples,
  });
}

export function useAiQuiz() {
  return useMutation({
    mutationFn: async () => (await tutor<{ questions: AiQuizQuestion[] }>({ action: 'quiz' })).questions,
  });
}
