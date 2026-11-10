import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ReadingSettings } from '@/components/dictionary-controls';
import { Card } from '@/components/card';
import { ChoiceList } from '@/components/choice-list';
import { ProgressSettings } from '@/components/progress/reminder-settings';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import {
  DAILY_XP_GOALS,
  EXPLANATION_LANGUAGES,
  LEARNING_GOALS,
  NEW_CARDS_PER_DAY,
  SCRIPTS,
  SELF_LEVELS,
  type Option,
} from '@/constants/profile-options';
import { Spacing } from '@/constants/theme';
import { deleteAccount, useChangeAvatar, useProfile, useUpdateProfile, type Profile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { friendlyAuthError } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useThemePreference, type ThemePreference } from '@/providers/theme-preference';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Grid chips show labels only. */
const short = <T,>(options: Option<T>[]) => options.map(({ value, label }) => ({ value, label }));

export default function ProfileScreen() {
  const { session } = useAuth();
  const profile = useProfile();

  return (
    <Screen title="Profile" subtitle={session ? 'Your account and preferences' : 'Settings and preferences'}>
      {!session ? (
        <SignedOutCard />
      ) : profile.data ? (
        <>
          <AccountHeader profile={profile.data} email={session.user.email ?? null} />
          <LearningSettings profile={profile.data} />
          <ProgressSettings />
        </>
      ) : profile.isError ? (
        <Card>
          <ThemedText themeColor="danger">Could not load your profile.</ThemedText>
          <Button label="Retry" variant="secondary" onPress={() => profile.refetch()} />
        </Card>
      ) : (
        <ActivityIndicator aria-label="Loading profile" />
      )}
      <AppearanceCard />
      <ReadingSettings />
      {session ? (
        <>
          <Card title="Help">
            <Button label="Replay the tutorial" variant="secondary" onPress={() => router.push('/tutorial')} />
          </Card>
          <AccountActions userId={session.user.id} />
        </>
      ) : null}
      <Card title="Credits">
        <ThemedText type="small" themeColor="textSecondary">
          Dictionary data: CC-CEDICT (CC BY-SA 4.0), MDBG. HSK word lists: complete-hsk-vocabulary by Yanis
          Zafirópulos (MIT). Example sentences: Tatoeba (CC BY 2.0 FR), tatoeba.org. Character strokes: Make Me a Hanzi (Arphic Public License);
          character details: Make Me a Hanzi (LGPL). Handwriting checking adapted from Hanzi Writer (MIT). Review scheduling: ts-fsrs (MIT).
        </ThemedText>
      </Card>
    </Screen>
  );
}

function SignedOutCard() {
  return (
    <Card title="Your account">
      <ThemedText themeColor="textSecondary">
        Create a free account to save your progress and continue on iPhone or the web.
      </ThemedText>
      <Link href="/sign-up" asChild>
        <Button label="Create account" onPress={() => {}} />
      </Link>
      <Link href="/sign-in" asChild>
        <Button label="Log in" variant="secondary" onPress={() => {}} />
      </Link>
    </Card>
  );
}

function AccountHeader({ profile, email }: { profile: Profile; email: string | null }) {
  const update = useUpdateProfile();
  const changeAvatar = useChangeAvatar();
  const [name, setName] = useState(profile.display_name ?? '');
  const [saved, setSaved] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === profile.display_name) return setName(profile.display_name ?? '');
    await update.mutateAsync({ display_name: trimmed });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <View style={styles.header}>
        <Pressable
          role="button"
          aria-label="Change profile photo"
          onPress={() => changeAvatar.mutate()}
          disabled={changeAvatar.isPending}
          style={({ pressed }) => pressed && styles.pressed}>
          <Avatar avatarUrl={profile.avatar_url} name={profile.display_name} email={email} />
          {changeAvatar.isPending ? <ActivityIndicator style={StyleSheet.absoluteFill} /> : null}
        </Pressable>
        <View style={styles.headerText}>
          <ThemedText type="subtitle" numberOfLines={1}>
            {profile.display_name || 'Learner'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {email}
          </ThemedText>
          <ThemedText type="link" role="button" onPress={() => changeAvatar.mutate()}>
            Change photo
          </ThemedText>
        </View>
      </View>
      {changeAvatar.isError ? (
        <ThemedText themeColor="danger" role="alert">
          {friendlyAuthError(changeAvatar.error)}
        </ThemedText>
      ) : null}
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        onBlur={saveName}
        onSubmitEditing={saveName}
        maxLength={50}
        hint={saved ? 'Saved ✓' : undefined}
      />
    </Card>
  );
}

function LearningSettings({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <Card title="Learning">
      <Field label="Goal">
        <ChoiceList
          label="Learning goal"
          layout="grid"
          options={short(LEARNING_GOALS)}
          value={profile.learning_goal}
          onChange={(learning_goal) => update.mutate({ learning_goal })}
        />
      </Field>
      <Field label="Level">
        <ChoiceList
          label="Chinese level"
          layout="grid"
          options={short(SELF_LEVELS)}
          value={profile.self_level}
          onChange={(self_level) => update.mutate({ self_level })}
        />
      </Field>
      <Field label="Daily goal">
        <ChoiceList
          label="Daily goal"
          layout="grid"
          options={short(DAILY_XP_GOALS)}
          value={profile.daily_goal_xp}
          onChange={(daily_goal_xp) => update.mutate({ daily_goal_xp })}
        />
      </Field>
      <Field label="New review cards per day">
        <ChoiceList
          label="New review cards per day"
          layout="grid"
          options={short(NEW_CARDS_PER_DAY)}
          value={profile.new_cards_per_day}
          onChange={(new_cards_per_day) => update.mutate({ new_cards_per_day })}
        />
      </Field>
      <Field label="Characters">
        <SegmentedControl
          label="Writing system"
          options={short(SCRIPTS)}
          value={profile.script}
          onChange={(script) => update.mutate({ script })}
        />
      </Field>
      <Field label="Explanation language">
        <SegmentedControl
          label="Explanation language"
          options={EXPLANATION_LANGUAGES}
          value={profile.explanation_language}
          onChange={(explanation_language) => update.mutate({ explanation_language })}
        />
      </Field>
      {update.isError ? (
        <ThemedText themeColor="danger" role="alert">
          Could not save: {friendlyAuthError(update.error)}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useThemePreference();
  return (
    <Card title="Appearance">
      <Field label="Theme">
        <SegmentedControl label="Theme" options={THEME_OPTIONS} value={preference} onChange={setPreference} />
      </Field>
    </Card>
  );
}

function AccountActions({ userId }: { userId: string }) {
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(userId);
    } catch (e) {
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  }

  return (
    <Card title="Account">
      <Button label="Log out" variant="secondary" onPress={() => supabase.auth.signOut({ scope: 'local' })} />
      {!confirming ? (
        <Button label="Delete account" variant="danger" onPress={() => setConfirming(true)} />
      ) : (
        <View style={[styles.confirm, { borderColor: theme.danger }]}>
          <ThemedText type="heading">Delete your account?</ThemedText>
          <ThemedText themeColor="textSecondary">
            This permanently deletes your profile, progress and photo. It cannot be undone.
          </ThemedText>
          <Button label="Yes, delete permanently" variant="danger" loading={busy} onPress={confirmDelete} />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setConfirming(false)} />
        </View>
      )}
      {error ? (
        <ThemedText themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerText: { flex: 1, gap: Spacing.half },
  field: { gap: Spacing.two },
  confirm: { gap: Spacing.two, borderWidth: 1, borderRadius: 12, padding: Spacing.three },
  pressed: { opacity: 0.7 },
});
