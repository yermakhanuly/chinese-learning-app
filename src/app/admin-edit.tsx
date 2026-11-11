import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AdminPage, Badge, CodeField, Problems, when } from '@/components/admin/admin-parts';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Pinyin } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import {
  KINDS,
  kindInfo,
  useCheckDraft,
  useDiscardDraft,
  useLiveItem,
  useMakeAudio,
  useOpenDraft,
  usePublishDraft,
  useSaveDraft,
  useUploadAudio,
  type CheckResult,
  type Draft,
} from '@/hooks/use-admin';
import { useHydrated } from '@/hooks/use-hydrated';
import { bytesToBase64 } from '@/lib/base64';
import { changedFields, draftFromRow, newDraft, pinyinTexts, type EditKind, type WordDraft } from '@/lib/content-rows';
import type { Token } from '@/lib/sentences';

const isKind = (k: string | undefined): k is EditKind => KINDS.some((x) => x.value === k);

const HELP: Record<EditKind, string> = {
  unit: 'Unit title (English + Chinese), theme slug and description. Lessons are edited separately.',
  lesson: 'Same format as content/hsk1/*.json (types in src/lib/lessons.ts), plus unit_id and position. Pinyin is added when you publish.',
  word: 'Meanings (one per line) and measure words. Pinyin and level come from the HSK lists.',
  grammar: 'Same format as content/grammar/*.json (src/lib/grammar.ts): examples, mistakes, exercises with one "why" per option.',
  reading: 'Same format as content/reading/*.json (src/lib/grammar.ts): sentences, speakers, questions with one "why" per option.',
  scenario: 'Same format as content/tutor/scenarios.json (src/lib/tutor.ts): 3 goals, 4–6 phrases, voice female/male.',
};

/** Edit one content item as a draft, check it, review the changes, publish. */
export default function AdminEditScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; new?: string }>();
  const hydrated = useHydrated();
  const ok = hydrated && isKind(params.kind) && !!params.id;
  return (
    <AdminPage title="Edit content">
      {!hydrated ? <ActivityIndicator /> : ok ? <Loader kind={params.kind as EditKind} id={params.id!} isNew={params.new === '1'} /> : <ThemedText>Nothing to edit.</ThemedText>}
    </AdminPage>
  );
}

function Loader({ kind, id, isNew }: { kind: EditKind; id: string; isNew: boolean }) {
  const live = useLiveItem(kind, id);
  const open = useOpenDraft(kind, id);
  if (live.isPending || open.isPending) return <ActivityIndicator />;
  if (live.isError || open.isError) return <ThemedText themeColor="danger">Couldn&apos;t load this item.</ThemedText>;
  if (!live.data && !isNew && !open.data) return <ThemedText themeColor="danger">No {kindInfo(kind).label.toLowerCase()} with id {id}.</ThemedText>;
  if (live.data && isNew && !open.data) return <ThemedText themeColor="danger">{id} already exists: open it from the list instead.</ThemedText>;
  const liveDraft = live.data ? draftFromRow(kind, live.data) : null;
  return (
    <Editor
      key={`${kind}:${id}`}
      kind={kind}
      id={id}
      live={live.data}
      liveDraft={liveDraft}
      draft={open.data}
      start={open.data?.data ?? liveDraft ?? newDraft(kind, id)}
    />
  );
}

function Editor({
  kind,
  id,
  live,
  liveDraft,
  draft,
  start,
}: {
  kind: EditKind;
  id: string;
  live: Record<string, unknown> | null;
  liveDraft: unknown;
  draft: Draft | null;
  start: unknown;
}) {
  const [text, setText] = useState(() => JSON.stringify(start, null, 2));
  const [note, setNote] = useState(draft?.note ?? '');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The draft being edited: the open one, or the one this page created (kept across refetches).
  const [draftId, setDraftId] = useState<string | undefined>(draft?.id);
  const save = useSaveDraft();
  const check = useCheckDraft();
  const publish = usePublishDraft();
  const discard = useDiscardDraft();
  const busy = save.isPending || check.isPending || publish.isPending || discard.isPending;

  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(text) as unknown, error: null };
    } catch (e) {
      return { value: null, error: `Not valid JSON: ${(e as Error).message}` };
    }
  }, [text]);
  const changed = parsed.value ? changedFields(liveDraft, parsed.value) : [];
  const error = save.error ?? check.error ?? publish.error ?? discard.error;

  async function saved(): Promise<Draft | null> {
    if (parsed.error) return null;
    const d = await save.mutateAsync({ id: draftId, kind, ref_id: id, is_new: !live, data: parsed.value, note: note.trim() || undefined });
    setDraftId(d.id);
    return d;
  }

  async function run(what: 'save' | 'check' | 'publish', acceptProblems = false) {
    setMessage(null);
    const d = await saved().catch(() => null);
    if (!d) return;
    if (what === 'save') return setMessage('Draft saved.');
    if (what === 'check') {
      const r = await check.mutateAsync(d.id).catch(() => null);
      if (r) setResult(r);
      return;
    }
    const r = await publish.mutateAsync({ draftId: d.id, acceptProblems }).catch(() => null);
    if (!r) return;
    setResult(r);
    if (r.published) {
      setDraftId(undefined);
      setMessage('Published. Learners see it the next time they open it.');
      router.setParams({ new: undefined });
    }
  }

  const published = result?.published;
  return (
    <>
      <View style={styles.row}>
        <ThemedText type="subtitle" style={styles.flex}>
          {kindInfo(kind).label}: {id}
        </ThemedText>
        {!live ? <Badge label="new" tone="tint" /> : null}
        {live?.edited_at ? <Badge label={`edited ${when(live.edited_at as string)}`} tone="warning" /> : null}
        {draft ? <Badge label={`draft · ${when(draft.updated_at)}`} tone="textSecondary" /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {HELP[kind]}
      </ThemedText>

      {kind === 'word' && parsed.value ? (
        <WordForm value={parsed.value as WordDraft} onChange={(v) => setText(JSON.stringify(v, null, 2))} />
      ) : (
        <CodeField label="Content (JSON)" value={text} onChangeText={setText} error={parsed.error} />
      )}
      <TextField label="Note for the review (optional)" value={note} onChangeText={setNote} maxLength={500} />

      <Card title="Review">
        <ThemedText>
          {!live ? 'A new item.' : changed.length ? `Changed: ${changed.join(', ')}` : 'No changes from the live version yet.'}
        </ThemedText>
        {result ? <Problems problems={result.problems} /> : draft?.problems.length ? <Problems problems={draft.problems} /> : null}
        {result?.row.readings ? <PinyinPreview readings={result.row.readings as Record<string, Token[]>} /> : null}
      </Card>

      {message ? (
        <ThemedText role="status" themeColor="success">
          {message}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText role="alert" themeColor="danger">
          {error.message}
        </ThemedText>
      ) : null}

      <View style={styles.row}>
        <Button label="Save draft" variant="secondary" disabled={busy || !!parsed.error} onPress={() => run('save')} />
        <Button label="Check" variant="secondary" loading={check.isPending} disabled={busy || !!parsed.error} onPress={() => run('check')} />
        <Button label="Publish" loading={publish.isPending} disabled={busy || !!parsed.error} onPress={() => run('publish')} />
        {result && !result.published && result.problems.length ? (
          <Button label="Publish anyway" variant="danger" disabled={busy} onPress={() => run('publish', true)} />
        ) : null}
        {draftId && !published ? (
          <Button
            label="Discard draft"
            variant="ghost"
            disabled={busy}
            onPress={() => discard.mutate(draftId, { onSuccess: () => router.replace({ pathname: '/admin-content', params: { kind } }) })}
          />
        ) : null}
      </View>

      {live || published ? <Audio kind={kind} data={parsed.value} /> : null}
    </>
  );
}

function WordForm({ value, onChange }: { value: WordDraft; onChange: (v: WordDraft) => void }) {
  const [meanings, setMeanings] = useState(value.meanings.join('\n'));
  const [classifiers, setClassifiers] = useState(value.classifiers.join(', '));
  const update = (m: string, c: string) => {
    setMeanings(m);
    setClassifiers(c);
    onChange({
      ...value,
      meanings: m.split('\n').map((s) => s.trim()).filter(Boolean),
      classifiers: c.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
    });
  };
  return (
    <>
      <CodeField label="Meanings (one per line)" value={meanings} onChangeText={(m) => update(m, classifiers)} minHeight={140} />
      <TextField label="Measure words (comma-separated)" value={classifiers} onChangeText={(c) => update(meanings, c)} />
    </>
  );
}

function PinyinPreview({ readings }: { readings: Record<string, Token[]> }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(readings);
  return (
    <View style={styles.gapSmall}>
      <ThemedText type="link" role="button" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {open ? 'Hide pinyin' : `Show pinyin for ${entries.length} texts`}
      </ThemedText>
      {open
        ? entries.map(([zh, tokens]) => (
            <View key={zh} style={styles.gapTiny}>
              <ThemedText lang="zh">{zh}</ThemedText>
              <Pinyin text={tokens.map((t) => t.p ?? '').filter(Boolean).join(' ')} size={13} />
            </View>
          ))
        : null}
    </View>
  );
}

/** Natural-voice clips for the item's texts (missing ones, or all again), or an uploaded recording. */
function Audio({ kind, data }: { kind: EditKind; data: unknown }) {
  const make = useMakeAudio();
  const upload = useUploadAudio();
  const [done, setDone] = useState<string | null>(null);
  const [uploadText, setUploadText] = useState('');
  if (!data) return null;
  const texts = kind === 'word' ? [(data as WordDraft).simplified] : [...new Set(pinyinTexts(kind, data))];
  if (!texts.length) return null;
  const voice = kind === 'scenario' ? ((data as { voice?: 'female' | 'male' }).voice ?? 'female') : 'female';

  async function generate(replace: boolean) {
    setDone(null);
    let made = 0;
    let skipped = 0;
    for (let i = 0; i < texts.length; i += 40) {
      const r = await make.mutateAsync({ texts: texts.slice(i, i + 40), voice, replace }).catch(() => null);
      if (!r) return;
      made += r.made.length;
      skipped += r.skipped.length;
    }
    setDone(`Made ${made} clips${skipped ? `, ${skipped} already had one` : ''}.`);
  }

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mpeg,.mp3';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const mp3 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
      upload.mutate({ text: uploadText.trim(), mp3 }, { onSuccess: () => setDone(`Uploaded the recording for ${uploadText.trim()}.`) });
    };
    input.click();
  }

  return (
    <Card title="Audio">
      <ThemedText themeColor="textSecondary">
        {texts.length} Chinese {texts.length === 1 ? 'text' : 'texts'} in this item. Publish first, then make the clips (Azure, natural voice).
      </ThemedText>
      <View style={styles.row}>
        <Button label="Make missing clips" variant="secondary" loading={make.isPending} onPress={() => generate(false)} />
        <Button label="Remake all clips" variant="ghost" disabled={make.isPending} onPress={() => generate(true)} />
      </View>
      <TextField label="Replace one clip with your own MP3: the exact Chinese text" value={uploadText} onChangeText={setUploadText} />
      <Button label="Choose MP3…" variant="secondary" disabled={!uploadText.trim() || upload.isPending} loading={upload.isPending} onPress={pickFile} />
      {done ? (
        <ThemedText role="status" themeColor="success">
          {done}
        </ThemedText>
      ) : null}
      {make.error ?? upload.error ? (
        <ThemedText role="alert" themeColor="danger">
          {(make.error ?? upload.error)!.message}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  flex: { flexGrow: 1, flexShrink: 1 },
  gapSmall: { gap: Spacing.two },
  gapTiny: { gap: Spacing.half },
});
