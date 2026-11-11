import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdminPage } from '@/components/admin/admin-parts';
import { LinkRow, StatTile } from '@/components/progress/progress-parts';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAdminOverview } from '@/hooks/use-admin';

/** Admin dashboard home (web, admins only). */
export default function AdminScreen() {
  return (
    <AdminPage title="Admin">
      <Overview />
      <View style={styles.links}>
        <LinkRow label="Learners" detail="Premium, usage" onPress={() => router.push('/admin-learners')} />
        <LinkRow label="Content" detail="Edit, review, publish" onPress={() => router.push('/admin-content')} />
        <LinkRow label="Problem reports" onPress={() => router.push('/admin-reports')} />
        <LinkRow label="Errors" detail="App and server" onPress={() => router.push('/admin-errors')} />
      </View>
    </AdminPage>
  );
}

function Overview() {
  const { data, isPending, isError } = useAdminOverview();
  if (isPending) return <ActivityIndicator />;
  if (isError) return <ThemedText themeColor="danger">Couldn&apos;t load the overview.</ThemedText>;
  const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));
  return (
    <View style={styles.tiles}>
      <StatTile value={String(data.learners)} label="learners" detail={`${data.active_7d} active this week`} />
      <StatTile value={String(data.premium)} label="Premium" detail={`${data.subscribers} paying`} />
      <StatTile value={String(data.open_reports)} label="open reports" />
      <StatTile value={String(data.errors_24h)} label="errors (24 h)" />
      <StatTile value={String(data.open_drafts)} label="open drafts" />
      <StatTile value={k(data.tutor_tokens_today)} label="AI tokens today" detail={`${k(data.tutor_tokens_30d)} in 30 days`} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  links: { gap: Spacing.two },
});
