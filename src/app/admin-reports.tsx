import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdminPage, Badge, when } from '@/components/admin/admin-parts';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useReports, useResolveReport, type Report } from '@/hooks/use-admin';

/** Where a report points to: the page learners saw, and the editor for that item. */
function links(r: Report): { view?: Href; edit?: Href } {
  if (!r.ref) return {};
  switch (r.kind) {
    case 'lesson':
      return { view: { pathname: '/lesson', params: { id: r.ref } }, edit: { pathname: '/admin-edit', params: { kind: 'lesson', id: r.ref } } };
    case 'word':
    case 'audio':
      return { view: { pathname: '/word', params: { w: r.ref } }, edit: { pathname: '/admin-edit', params: { kind: 'word', id: r.ref } } };
    case 'grammar':
      return { view: { pathname: '/grammar-point', params: { id: r.ref } }, edit: { pathname: '/admin-edit', params: { kind: 'grammar', id: r.ref } } };
    case 'reading':
      return { view: { pathname: '/reading-text', params: { id: r.ref } }, edit: { pathname: '/admin-edit', params: { kind: 'reading', id: r.ref } } };
    default:
      return {};
  }
}

/** Problem reports from learners: read, fix, resolve. */
export default function AdminReportsScreen() {
  const [status, setStatus] = useState<Report['status']>('open');
  const { data, isPending, isError } = useReports(status);
  return (
    <AdminPage title="Problem reports">
      <SegmentedControl
        label="Show"
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'dismissed', label: 'Dismissed' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {isPending ? (
        <ActivityIndicator />
      ) : isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load reports.</ThemedText>
      ) : !data.length ? (
        <ThemedText themeColor="textSecondary">No {status} reports.</ThemedText>
      ) : (
        <View role="list" style={styles.list}>
          {data.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </View>
      )}
    </AdminPage>
  );
}

function ReportCard({ r }: { r: Report }) {
  const resolve = useResolveReport();
  const [note, setNote] = useState(r.admin_note ?? '');
  const { view, edit } = links(r);
  return (
    <Card>
      <View role="listitem" aria-label={`Report: ${r.message}`} style={styles.gap}>
        <View style={styles.row}>
          <Badge label={r.kind} tone="tint" />
          <Badge label={r.category} />
          {r.ref ? <ThemedText type="smallBold">{r.ref}</ThemedText> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {when(r.created_at)}
          </ThemedText>
        </View>
        <ThemedText>{r.message}</ThemedText>
        {Object.keys(r.context).length ? (
          <ThemedText type="small" themeColor="textSecondary">
            {Object.entries(r.context)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join(' · ')}
          </ThemedText>
        ) : null}
        <View style={styles.row}>
          {view ? <Button label="Open in the app" variant="ghost" onPress={() => router.push(view)} /> : null}
          {edit ? <Button label="Edit" variant="ghost" onPress={() => router.push(edit)} /> : null}
        </View>
        <TextField label="Note" value={note} onChangeText={setNote} maxLength={1000} />
        <View style={styles.row}>
          {r.status !== 'resolved' ? (
            <Button label="Resolved" disabled={resolve.isPending} onPress={() => resolve.mutate({ id: r.id, status: 'resolved', note: note.trim() || undefined })} />
          ) : null}
          {r.status !== 'dismissed' ? (
            <Button label="Dismiss" variant="secondary" disabled={resolve.isPending} onPress={() => resolve.mutate({ id: r.id, status: 'dismissed', note: note.trim() || undefined })} />
          ) : null}
          {r.status !== 'open' ? (
            <Button label="Reopen" variant="ghost" disabled={resolve.isPending} onPress={() => resolve.mutate({ id: r.id, status: 'open', note: note.trim() || undefined })} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  gap: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
});
