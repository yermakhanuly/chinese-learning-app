import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdminPage, Badge, when } from '@/components/admin/admin-parts';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useClientErrors, type ClientError } from '@/hooks/use-admin';

/** The latest errors from the app (learners' devices) and the Edge Functions. */
export default function AdminErrorsScreen() {
  const { data, isPending, isError } = useClientErrors();
  return (
    <AdminPage title="Errors">
      <ThemedText themeColor="textSecondary">
        The newest 100. Crashes and unexpected errors are sent automatically (at most 30 an hour per learner).
      </ThemedText>
      {isPending ? (
        <ActivityIndicator />
      ) : isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load errors.</ThemedText>
      ) : !data.length ? (
        <ThemedText themeColor="success">No errors. 🎉</ThemedText>
      ) : (
        <View role="list" style={styles.list}>
          {data.map((e) => (
            <ErrorCard key={e.id} e={e} />
          ))}
        </View>
      )}
    </AdminPage>
  );
}

function ErrorCard({ e }: { e: ClientError }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View role="listitem" style={styles.gap}>
        <View style={styles.row}>
          <Badge label={e.source} tone={e.source === 'function' ? 'warning' : 'tint'} />
          <ThemedText type="small" themeColor="textSecondary">
            {when(e.created_at)}
            {e.user_id ? ` · learner ${e.user_id.slice(0, 8)}` : ''}
            {Object.keys(e.context).length ? ` · ${Object.entries(e.context).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}` : ''}
          </ThemedText>
        </View>
        <ThemedText>{e.message}</ThemedText>
        {e.stack ? (
          <>
            <ThemedText type="link" role="button" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
              {open ? 'Hide details' : 'Details'}
            </ThemedText>
            {open ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.stack}>
                {e.stack}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  gap: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  stack: { fontFamily: 'monospace' },
});
