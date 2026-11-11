import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdminPage, Badge, when } from '@/components/admin/admin-parts';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAdminLearners, useSetPremium, type LearnerRow } from '@/hooks/use-admin';

/** Learners: search, activity, Premium, AI usage (admins only). */
export default function AdminLearnersScreen() {
  const [search, setSearch] = useState('');
  const { data, isPending, isError } = useAdminLearners(search.trim());
  return (
    <AdminPage title="Learners">
      <TextField label="Search by email or name" value={search} onChangeText={setSearch} autoCapitalize="none" />
      {isPending ? (
        <ActivityIndicator />
      ) : isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load learners.</ThemedText>
      ) : !data.length ? (
        <ThemedText themeColor="textSecondary">No learners found.</ThemedText>
      ) : (
        <View role="list" style={styles.list}>
          {data.map((l) => (
            <Learner key={l.id} l={l} />
          ))}
        </View>
      )}
    </AdminPage>
  );
}

function Learner({ l }: { l: LearnerRow }) {
  const set = useSetPremium();
  const days = (n: number) => new Date(Date.now() + n * 86400e3).toISOString();
  const manual = !!l.premium_until && new Date(l.premium_until) > new Date();
  return (
    <Card>
      <View role="listitem" aria-label={l.email} style={styles.gap}>
        <View style={styles.row}>
          <ThemedText type="label" style={styles.flex}>
            {l.display_name ?? '(no name)'} · {l.email}
          </ThemedText>
          {l.is_admin ? <Badge label="admin" tone="tint" /> : null}
          {l.premium ? <Badge label={l.subscription_status ? `Premium · ${l.subscription_status}` : 'Premium'} tone="success" /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Joined {when(l.created_at)} · last active {when(l.last_active)} · {l.total_xp} XP · AI tokens (30 days):{' '}
          {l.tutor_input_30d.toLocaleString()} in / {l.tutor_output_30d.toLocaleString()} out
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Manual Premium: {manual ? `until ${new Date(l.premium_until!).toLocaleDateString()}` : 'off'}
        </ThemedText>
        <View style={styles.row}>
          <Button label="Premium 30 days" variant="secondary" disabled={set.isPending} onPress={() => set.mutate({ user: l.id, until: days(30) })} />
          <Button label="Premium forever" variant="secondary" disabled={set.isPending} onPress={() => set.mutate({ user: l.id, until: '2099-01-01T00:00:00Z' })} />
          {manual ? <Button label="Turn manual Premium off" variant="ghost" disabled={set.isPending} onPress={() => set.mutate({ user: l.id, until: null })} /> : null}
        </View>
        {set.isError ? (
          <ThemedText role="alert" themeColor="danger">
            {set.error.message}
          </ThemedText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  gap: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  flex: { flexGrow: 1, flexShrink: 1 },
});
