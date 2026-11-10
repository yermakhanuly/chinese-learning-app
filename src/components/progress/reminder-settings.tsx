import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { reminders } from '@/lib/reminders';
import { useDisplayPreferences } from '@/providers/display-preferences';

const TIMES = ['08:00', '12:00', '18:00', '20:00', '21:00'] as const;

/** Profile: progress links and the daily study reminder (iPhone notification; a banner on the web). */
export function ProgressSettings() {
  const { reminderTime, update } = useDisplayPreferences();
  const [message, setMessage] = useState<string | null>(null);

  async function set(time: string | null) {
    setMessage(null);
    if (!time) {
      await reminders.cancel();
      update({ reminderTime: null });
      return;
    }
    const [h, m] = time.split(':').map(Number);
    const result = await reminders.schedule(h, m);
    if (result === 'scheduled') update({ reminderTime: time });
    else setMessage('Notifications are turned off for this app. Allow them in the iPhone Settings app, then try again.');
  }

  return (
    <Card title="Progress & reminders">
      <Button label="Progress dashboard" variant="secondary" onPress={() => router.push('/progress')} />
      <Button label="Weekly leaderboard" variant="secondary" onPress={() => router.push('/leaderboard')} />
      {reminders.supported ? (
        <>
          <ThemedText type="smallBold">Daily study reminder</ThemedText>
          <SegmentedControl
            label="Reminder time"
            options={[{ value: 'off', label: 'Off' }, ...TIMES.map((t) => ({ value: t, label: t }))]}
            value={reminderTime ?? 'off'}
            onChange={(v) => void set(v === 'off' ? null : v)}
          />
          <ThemedText type="small" themeColor={message ? 'danger' : 'textSecondary'} role="status">
            {message ?? (reminderTime ? `A notification reminds you every day at ${reminderTime}.` : 'No reminder.')}
          </ThemedText>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Reminders: on the web, Home shows a reminder when you haven&apos;t studied today. On iPhone you can get a daily
          notification.
        </ThemedText>
      )}
    </Card>
  );
}
