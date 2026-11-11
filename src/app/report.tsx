import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceList } from '@/components/choice-list';
import { CloseButton, closeModal } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useHydrated } from '@/hooks/use-hydrated';
import { useSubmitReport, type ReportCategory, type ReportKind } from '@/hooks/use-reports';
import { useAuth } from '@/providers/auth';

const KINDS: ReportKind[] = ['lesson', 'word', 'grammar', 'reading', 'tutor', 'audio', 'other'];

const CATEGORIES: { value: ReportCategory; label: string; description: string }[] = [
  { value: 'wrong', label: 'Something is wrong', description: 'A wrong answer, translation, pinyin or character' },
  { value: 'unclear', label: 'Hard to understand', description: 'An explanation or question that is confusing' },
  { value: 'audio', label: 'Audio problem', description: 'Wrong, cut-off or missing sound' },
  { value: 'bug', label: "The app doesn't work", description: 'A button, screen or save that fails' },
  { value: 'other', label: 'Something else', description: 'Ideas and anything else' },
];

/** /report?kind=lesson&ref=hsk1-u01-l1&label=… — tell us about a problem. */
export default function ReportScreen() {
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ kind?: string; ref?: string; label?: string }>();
  return (
    <Screen title="Report a problem" modal topAction={<CloseButton />}>
      {hydrated ? (
        <Form
          kind={KINDS.includes(params.kind as ReportKind) ? (params.kind as ReportKind) : 'other'}
          refId={params.ref?.slice(0, 120) ?? ''}
          label={params.label?.slice(0, 120)}
        />
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}

function Form({ kind, refId, label }: { kind: ReportKind; refId: string; label?: string }) {
  const { session } = useAuth();
  const submit = useSubmitReport();
  const [category, setCategory] = useState<ReportCategory>(kind === 'audio' ? 'audio' : 'wrong');
  const [message, setMessage] = useState('');

  if (!session) {
    return (
      <Card title="Log in to send a report">
        <Button label="Log in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }
  if (submit.isSuccess) {
    return (
      <Card title="Thank you!">
        <ThemedText themeColor="textSecondary">We&apos;ll look at it and fix it in the app.</ThemedText>
        <Button label="Done" onPress={closeModal} />
      </Card>
    );
  }
  return (
    <>
      {label ? (
        <ThemedText themeColor="textSecondary">
          About: <ThemedText type="smallBold">{label}</ThemedText>
        </ThemedText>
      ) : null}
      <ChoiceList label="What's the problem?" options={CATEGORIES} value={category} onChange={setCategory} />
      <TextField
        label="Tell us more"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={1000}
        placeholder="What did you expect, and what happened?"
      />
      {submit.isError ? (
        <ThemedText role="alert" themeColor="danger">
          {submit.error.message}
        </ThemedText>
      ) : null}
      <Button
        label="Send report"
        loading={submit.isPending}
        disabled={!message.trim()}
        onPress={() =>
          submit.mutate({
            kind,
            ref: refId,
            category,
            message: message.trim(),
            context: { platform: process.env.EXPO_OS ?? 'unknown', version: Constants.expoConfig?.version ?? '?', ...(label ? { about: label } : {}) },
          })
        }
      />
    </>
  );
}
