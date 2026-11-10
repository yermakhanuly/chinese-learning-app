import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useProgressSummary, useSyncTimeZone } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { getItem, setItem } from '@/lib/storage';
import { useAuth } from '@/providers/auth';

type Seen = { level: number; goalDay: string | null; badges: string[]; streak: number };

const MILESTONES = [7, 30, 50, 100, 200, 365];
const CALM_SCREENS = ['/', '/learn', '/review', '/dictionary', '/profile', '/progress'];

function read(key: string): Seen | null {
  try {
    return JSON.parse(getItem(key) ?? 'null') as Seen | null;
  } catch {
    return null;
  }
}

/**
 * Shows a celebration when the daily goal, a new level, a badge or a streak milestone is reached.
 * What was already celebrated is remembered on this device; the first time, everything that's already
 * earned is recorded quietly (no burst of old celebrations).
 */
export function Celebrations() {
  const { session } = useAuth();
  useSyncTimeZone();
  const p = useProgressSummary();
  const theme = useTheme();
  const key = `celebrations:${session?.user.id ?? ''}`;
  const [seen, setSeen] = useState<{ key: string; value: Seen | null }>(() => ({ key, value: read(key) }));
  // Signed in as someone else: load their record.
  if (seen.key !== key) setSeen({ key, value: read(key) });

  const current: Seen | null = p.ready
    ? {
        level: p.level.level,
        goalDay: p.streak.todayMet ? p.today : null,
        badges: p.badges.filter((b) => b.earned).map((b) => b.id),
        streak: p.streak.current,
      }
    : null;
  // First time on this device: record what's already earned without celebrating it.
  if (current && !seen.value) setSeen({ key, value: current });
  const baseline = seen.value;
  useEffect(() => {
    if (baseline && !getItem(key)) setItem(key, JSON.stringify(baseline));
  }, [baseline, key]);

  const items: { icon: string; title: string; detail: string }[] = [];
  if (p.ready && current && baseline) {
    if (current.goalDay && baseline.goalDay !== current.goalDay) items.push({ icon: '🎯', title: 'Daily goal reached!', detail: `${p.goal} XP today. 太棒了！` });
    if (current.level > baseline.level) items.push({ icon: '⭐', title: `Level ${current.level}!`, detail: 'You reached a new level.' });
    const milestone = MILESTONES.find((m) => current.streak >= m && baseline.streak < m);
    if (milestone) items.push({ icon: '🔥', title: `${milestone}-day streak!`, detail: 'Keep it going.' });
    for (const b of p.badges) {
      if (b.earned && !baseline.badges.includes(b.id)) items.push({ icon: b.icon, title: `Badge: ${b.title}`, detail: b.description });
    }
  }

  const dismiss = () => {
    if (!current || !baseline) return;
    const next: Seen = {
      level: Math.max(current.level, baseline.level),
      goalDay: current.goalDay ?? baseline.goalDay,
      badges: [...new Set([...baseline.badges, ...current.badges])],
      streak: current.streak,
    };
    setItem(key, JSON.stringify(next));
    setSeen({ key, value: next });
  };

  // Wait until the learner is back on a main screen: never interrupt a lesson, review or test.
  const pathname = usePathname();
  if (!items.length || !CALM_SCREENS.includes(pathname)) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View role="dialog" aria-label="Celebration" style={[styles.box, { backgroundColor: theme.background, borderColor: theme.tint }]}>
          {items.map((i) => (
            <View key={i.title} style={styles.item}>
              <ThemedText style={styles.icon}>{i.icon}</ThemedText>
              <ThemedText type="subtitle" style={styles.center}>
                {i.title}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {i.detail}
              </ThemedText>
            </View>
          ))}
          <Button label="Continue" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  box: { width: '100%', maxWidth: 380, borderWidth: 2, borderRadius: Radius.large, padding: Spacing.four, gap: Spacing.three },
  item: { alignItems: 'center', gap: Spacing.one },
  icon: { fontSize: 48, lineHeight: 60 },
  center: { textAlign: 'center' },
});
