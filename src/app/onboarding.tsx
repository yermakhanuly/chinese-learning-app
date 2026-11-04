import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceList } from '@/components/choice-list';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { TutorialSlides } from '@/components/tutorial-slides';
import {
  DAILY_GOALS,
  EXPLANATION_LANGUAGES,
  LEARNING_GOALS,
  SCRIPTS,
  SELF_LEVELS,
  type DailyGoal,
  type ExplanationLanguage,
  type LearningGoal,
  type Script,
  type SelfLevel,
} from '@/constants/profile-options';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { friendlyAuthError } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabase';

const STEPS = ['name', 'goal', 'level', 'daily', 'script', 'language', 'tutorial'] as const;
type Step = (typeof STEPS)[number];

const TITLES: Record<Step, { title: string; subtitle: string }> = {
  name: { title: 'Welcome! 欢迎', subtitle: 'What should we call you?' },
  goal: { title: 'Why Chinese?', subtitle: 'Pick your main goal. Lessons will lean towards it.' },
  level: { title: 'Your level', subtitle: 'How much Chinese do you know? A placement test comes with the lessons.' },
  daily: { title: 'Daily goal', subtitle: 'How long do you want to study each day? You can change this later.' },
  script: { title: 'Characters', subtitle: 'Which writing system do you want to learn?' },
  language: { title: 'Explanations', subtitle: 'Language used for meanings and grammar notes.' },
  tutorial: { title: 'Quick tour', subtitle: 'Four things to know before you start.' },
};

export default function OnboardingScreen() {
  const theme = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile({ optimistic: false });

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [goal, setGoal] = useState<LearningGoal | null>(profile?.learning_goal ?? null);
  const [level, setLevel] = useState<SelfLevel | null>(profile?.self_level ?? null);
  const [daily, setDaily] = useState<DailyGoal>(profile?.daily_goal_minutes ?? 10);
  const [script, setScript] = useState<Script>(profile?.script ?? 'simplified');
  const [language, setLanguage] = useState<ExplanationLanguage>(profile?.explanation_language ?? 'en');
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const canContinue =
    (step === 'name' && name.trim().length > 0) ||
    (step === 'goal' && goal !== null) ||
    (step === 'level' && level !== null) ||
    step === 'daily' ||
    step === 'script' ||
    step === 'language';

  function next() {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  async function finish() {
    setError(null);
    const now = new Date().toISOString();
    try {
      // Saving onboarded_at flips the app to the tabs (see the guard in _layout.tsx).
      await update.mutateAsync({
        display_name: name.trim(),
        learning_goal: goal,
        self_level: level,
        daily_goal_minutes: daily,
        script,
        explanation_language: language,
        tutorial_completed_at: now,
        onboarded_at: now,
      });
    } catch (e) {
      setError(friendlyAuthError(e));
    }
  }

  const { title, subtitle } = TITLES[step];

  return (
    <Screen
      title={title}
      subtitle={subtitle}
      topAction={
        <View style={styles.top}>
          <View
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={stepIndex + 1}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[styles.fill, { backgroundColor: theme.tint, width: `${((stepIndex + 1) / STEPS.length) * 100}%` }]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Step {stepIndex + 1} of {STEPS.length}
          </ThemedText>
        </View>
      }>
      {step === 'name' ? (
        <TextField label="Your name" value={name} onChangeText={setName} maxLength={50} autoComplete="name" onSubmitEditing={() => canContinue && next()} />
      ) : null}
      {step === 'goal' ? <ChoiceList label="Learning goal" options={LEARNING_GOALS} value={goal} onChange={setGoal} /> : null}
      {step === 'level' ? <ChoiceList label="Chinese level" options={SELF_LEVELS} value={level} onChange={setLevel} /> : null}
      {step === 'daily' ? (
        <ChoiceList label="Daily goal" options={DAILY_GOALS} value={daily} onChange={setDaily} layout="grid" />
      ) : null}
      {step === 'script' ? <ChoiceList label="Writing system" options={SCRIPTS} value={script} onChange={setScript} /> : null}
      {step === 'language' ? (
        <>
          <ChoiceList label="Explanation language" options={EXPLANATION_LANGUAGES} value={language} onChange={setLanguage} />
          <ThemedText type="small" themeColor="textSecondary">
            More languages will be added together with the lesson content.
          </ThemedText>
        </>
      ) : null}
      {step === 'tutorial' ? <TutorialSlides onDone={finish} busy={update.isPending} /> : null}

      {error ? (
        <ThemedText themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : null}

      {step !== 'tutorial' ? (
        <View style={styles.buttons}>
          {stepIndex > 0 ? (
            <Button label="Back" variant="secondary" onPress={() => setStepIndex(stepIndex - 1)} style={styles.flex} />
          ) : null}
          <Button label="Continue" onPress={next} disabled={!canContinue} style={styles.flex} />
        </View>
      ) : (
        <Button label="Skip tour" variant="ghost" onPress={finish} loading={update.isPending} />
      )}

      {stepIndex === 0 ? (
        <Button label="Not you? Log out" variant="ghost" onPress={() => supabase.auth.signOut({ scope: 'local' })} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: Spacing.one },
  track: { height: 6, borderRadius: Radius.small, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.small },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
