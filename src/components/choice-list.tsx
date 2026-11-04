import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import type { Option } from '@/constants/profile-options';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props<T extends string | number> = {
  label: string;
  options: Option<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** "grid" puts short options side by side. */
  layout?: 'list' | 'grid';
};

/** Large tappable single-choice cards (radio group semantics). */
export function ChoiceList<T extends string | number>({ label, options, value, onChange, layout = 'list' }: Props<T>) {
  const theme = useTheme();
  return (
    <View role="radiogroup" aria-label={label} style={layout === 'grid' ? styles.grid : styles.list}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.option,
              layout === 'grid' && styles.gridOption,
              {
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: selected ? theme.tint : theme.border,
              },
              pressed && styles.pressed,
            ]}>
            <View style={styles.text}>
              <ThemedText type={layout === 'grid' ? 'smallBold' : 'label'} style={layout === 'grid' && styles.gridLabel}>
                {opt.label}
              </ThemedText>
              {opt.description ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {opt.description}
                </ThemedText>
              ) : null}
            </View>
            {selected && layout === 'list' ? (
              <SymbolView
                name={{ ios: 'checkmark.circle.fill', web: 'check_circle' }}
                size={22}
                tintColor={theme.tint}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    minHeight: 56,
  },
  gridOption: {
    flexGrow: 1,
    flexBasis: 100,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.small + 2,
  },
  gridLabel: { textAlign: 'center' },
  text: { flex: 1, gap: Spacing.half },
  pressed: { opacity: 0.75 },
});
