import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AdminPage, Badge, when } from '@/components/admin/admin-parts';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LinkRow } from '@/components/progress/progress-parts';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { KINDS, kindInfo, useContentList, useDrafts } from '@/hooks/use-admin';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';
import { ID_PATTERNS, type EditKind } from '@/lib/content-rows';

const isKind = (k: string | undefined): k is EditKind => KINDS.some((x) => x.value === k);

/** Content: pick a kind, find an item, open it in the editor; open drafts waiting for review. */
export default function AdminContentScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const hydrated = useHydrated();
  const kind: EditKind = hydrated && isKind(params.kind) ? params.kind : 'lesson';
  return (
    <AdminPage title="Content">
      <OpenDrafts />
      <KindPicker kind={kind} />
      <Items key={kind} kind={kind} />
    </AdminPage>
  );
}

function OpenDrafts() {
  const { data } = useDrafts('draft');
  if (!data?.length) return null;
  return (
    <Card title={`Drafts waiting for review (${data.length})`}>
      <View role="list" style={styles.gapSmall}>
        {data.map((d) => (
          <View key={d.id} role="listitem">
            <LinkRow
              label={`${kindInfo(d.kind).label}: ${d.ref_id}${d.is_new ? ' (new)' : ''}`}
              detail={`${d.problems.length ? `${d.problems.length} problems · ` : d.checked_at ? 'checked · ' : ''}${when(d.updated_at)}`}
              onPress={() => router.push({ pathname: '/admin-edit', params: { kind: d.kind, id: d.ref_id } })}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

function KindPicker({ kind }: { kind: EditKind }) {
  const theme = useTheme();
  return (
    <View role="tablist" style={styles.kinds}>
      {KINDS.map((k) => (
        <Pressable
          key={k.value}
          role="tab"
          aria-selected={k.value === kind}
          onPress={() => router.setParams({ kind: k.value })}
          style={[styles.kind, { borderColor: k.value === kind ? theme.tint : theme.border, backgroundColor: k.value === kind ? theme.backgroundSelected : theme.background }]}>
          <ThemedText type="smallBold" themeColor={k.value === kind ? 'tint' : 'text'}>
            {k.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function Items({ kind }: { kind: EditKind }) {
  const [search, setSearch] = useState('');
  const { data, isPending, isError } = useContentList(kind, search);
  return (
    <>
      {kind !== 'word' ? <NewItem kind={kind} /> : null}
      <TextField
        label={kind === 'word' ? 'Find a word (characters or pinyin)' : 'Filter by id or title'}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {isPending ? (
        <ActivityIndicator />
      ) : isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load the list.</ThemedText>
      ) : !data.length ? (
        <ThemedText themeColor="textSecondary">{kind === 'word' && !search.trim() ? 'Type a word to find it.' : 'Nothing found.'}</ThemedText>
      ) : (
        <View role="list" style={styles.gapSmall}>
          {data.map((item) => (
            <View key={item.id} role="listitem" style={styles.row}>
              <View style={styles.flex}>
                <LinkRow
                  label={`${item.id} · ${item.title}`}
                  onPress={() => router.push({ pathname: '/admin-edit', params: { kind, id: item.id } })}
                />
              </View>
              {item.edited_at ? <Badge label="edited" tone="warning" /> : null}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

function NewItem({ kind }: { kind: Exclude<EditKind, 'word'> }) {
  const [id, setId] = useState('');
  const rule = ID_PATTERNS[kind];
  const valid = rule.pattern.test(id.trim());
  return (
    <Card title={`New ${kindInfo(kind).label.toLowerCase().replace(/s$/, '')}`}>
      <TextField label="Id" value={id} onChangeText={setId} autoCapitalize="none" placeholder={rule.example} hint={`Like ${rule.example}`} />
      <Button
        label="Create draft"
        variant="secondary"
        disabled={!valid}
        onPress={() => router.push({ pathname: '/admin-edit', params: { kind, id: id.trim(), new: '1' } })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  gapSmall: { gap: Spacing.two },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  kind: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
