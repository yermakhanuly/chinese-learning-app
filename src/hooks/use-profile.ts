import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { DailyGoal, ExplanationLanguage, LearningGoal, NewCardsPerDay, Script, SelfLevel } from '@/constants/profile-options';
import { AVATAR_BUCKET, avatarPath, base64ToBytes } from '@/lib/avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  learning_goal: LearningGoal | null;
  self_level: SelfLevel | null;
  daily_goal_minutes: DailyGoal;
  script: Script;
  explanation_language: ExplanationLanguage;
  onboarded_at: string | null;
  tutorial_completed_at: string | null;
  /** Where the learner's path starts (placement test result). */
  start_lesson_id: string | null;
  placed_at: string | null;
  /** New review cards introduced per day (Phase 4). */
  new_cards_per_day: NewCardsPerDay;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id'>>;

const COLUMNS =
  'id, display_name, avatar_url, learning_goal, self_level, daily_goal_minutes, script, explanation_language, onboarded_at, tutorial_completed_at, start_lesson_id, placed_at, new_cards_per_day';

/** The signed-in learner's profile. Refetched when the app/tab regains focus, so edits sync across devices. */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

/**
 * Saves profile fields. By default the update is optimistic (the UI changes instantly, rolls back
 * on error). Pass `{ optimistic: false }` when the change moves the user to another screen (finishing
 * onboarding): the UI then waits for the server, so a reload mid-save can't lose it.
 */
export function useUpdateProfile({ optimistic = true }: { optimistic?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  const key = ['profile', userId];

  return useMutation({
    mutationFn: async (changes: ProfileUpdate) => {
      if (!userId) throw new Error('Not signed in');
      const { data, error } = await supabase.from('profiles').update(changes).eq('id', userId).select(COLUMNS).single();
      if (error) throw error;
      return data as Profile;
    },
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key });
      if (!optimistic) return { previous: undefined };
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, ...changes });
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (profile) => queryClient.setQueryData(key, profile),
  });
}

/** Pick a photo, shrink it to 256 px, upload it, and point the profile at it. Returns false if cancelled. */
export function useChangeAvatar() {
  const { session } = useAuth();
  const update = useUpdateProfile();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const userId = session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (picked.canceled) return false;

      const image = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 256 }).renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!saved.base64) throw new Error('Could not read the photo.');

      const path = avatarPath(userId);
      const bucket = supabase.storage.from(AVATAR_BUCKET);
      const { error } = await bucket.upload(path, base64ToBytes(saved.base64), { contentType: 'image/jpeg' });
      if (error) throw error;
      await update.mutateAsync({ avatar_url: path });
      await removeAvatarFiles(userId, path);
      return true;
    },
  });
}

/** Deletes the learner's stored avatar files (all, or all except `keep`). */
export async function removeAvatarFiles(userId: string, keep?: string): Promise<void> {
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { data } = await bucket.list(userId);
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await bucket.remove(old);
}

/** Permanently deletes the account: avatar files, then the user (profile rows cascade), then signs out locally. */
export async function deleteAccount(userId: string): Promise<void> {
  await removeAvatarFiles(userId);
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
