import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Card } from '@/components/card';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSavedWords, useToggleSaved } from '@/hooks/use-dictionary';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';
import { HANZI_SIZES, useDisplayPreferences, type HanziSize } from '@/providers/display-preferences';

/** Bookmark toggle. Guests are sent to log in (saved words live in their account). */
export function SaveButton({ word }: { word: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const saved = useSavedWords();
  const toggle = useToggleSaved();
  const isSaved = !!saved.data?.some((r) => r.word === word);

  return (
    <Pressable
      role="button"
      aria-label={isSaved ? 'Remove from saved words' : 'Save word'}
      aria-pressed={isSaved}
      onPress={() => {
        if (!session) router.push('/sign-in');
        else toggle.mutate({ word, save: !isSaved });
      }}
      style={({ pressed }) => [
        styles.save,
        {
          backgroundColor: isSaved ? theme.tint : theme.backgroundElement,
          borderColor: isSaved ? theme.tint : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={{ ios: isSaved ? 'bookmark.fill' : 'bookmark', web: isSaved ? 'bookmark' : 'bookmark_border' }}
        size={18}
        tintColor={isSaved ? theme.onTint : theme.tint}
      />
      <ThemedText type="smallBold" style={{ color: isSaved ? theme.onTint : theme.tint }}>
        {isSaved ? 'Saved' : 'Save'}
      </ThemedText>
    </Pressable>
  );
}

type SearchFieldProps = Omit<TextInputProps, 'style'> & {
  value: string;
  onClear: () => void;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

/** The dictionary search box: characters, pinyin (any tone style) or English. */
export function SearchField({ value, onClear, ref, ...rest }: SearchFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.search,
        { backgroundColor: theme.backgroundElement, borderColor: focused ? theme.tint : theme.border },
        focused && styles.searchFocused,
      ]}>
      <SymbolView name={{ ios: 'magnifyingglass', web: 'search' }} size={20} tintColor={theme.textSecondary} />
      <TextInput
        ref={ref}
        value={value}
        role="searchbox"
        aria-label="Search the dictionary"
        placeholder="汉字, pinyin or English"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="search"
        clearButtonMode="never"
        enterKeyHint="search"
        style={[styles.input, { color: theme.text }]}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
      {value ? (
        <Pressable role="button" aria-label="Clear search" onPress={onClear} hitSlop={10}>
          <SymbolView name={{ ios: 'xmark.circle.fill', web: 'cancel' }} size={20} tintColor={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pinyin on/off, Hanzi size and tone colors: saved on this device. */
export function ReadingSettings() {
  const { showPinyin, hanziSize, toneColors, update } = useDisplayPreferences();
  return (
    <Card title="Reading">
      <Field label="Pinyin">
        <SegmentedControl
          label="Pinyin"
          options={[
            { value: 'show', label: 'Show' },
            { value: 'hide', label: 'Hide' },
          ]}
          value={showPinyin ? 'show' : 'hide'}
          onChange={(v) => update({ showPinyin: v === 'show' })}
        />
      </Field>
      <Field label="Character size">
        <SegmentedControl<HanziSize>
          label="Character size"
          options={HANZI_SIZES}
          value={hanziSize}
          onChange={(v) => update({ hanziSize: v })}
        />
      </Field>
      <Field label="Tone colors">
        <SegmentedControl
          label="Tone colors"
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={toneColors ? 'on' : 'off'}
          onChange={(v) => update({ toneColors: v === 'on' })}
        />
      </Field>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      {children}
    </View>
  );
}

/** Compact pinyin switch for page headers. */
export function PinyinToggle() {
  const theme = useTheme();
  const { showPinyin, update } = useDisplayPreferences();
  return (
    <Pressable
      role="switch"
      aria-label="Show pinyin"
      aria-checked={showPinyin}
      onPress={() => update({ showPinyin: !showPinyin })}
      hitSlop={8}
      style={({ pressed }) => [
        styles.toggle,
        {
          borderColor: showPinyin ? theme.tint : theme.border,
          backgroundColor: showPinyin ? theme.tint : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: showPinyin ? theme.onTint : theme.textSecondary }}>
        拼音
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
  },
  pressed: { opacity: 0.7 },
  field: { gap: Spacing.two },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  searchFocused: { borderWidth: 2, marginVertical: -1 },
  input: { flex: 1, fontSize: 18, paddingVertical: Spacing.two, outlineStyle: 'none' } as object,
  toggle: {
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
  },
});
