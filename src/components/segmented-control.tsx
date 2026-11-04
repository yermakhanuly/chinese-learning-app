import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Accessible single-choice control (radio group semantics for screen readers). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  const theme = useTheme();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      style={[styles.group, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: theme.background },
              pressed && styles.pressed,
            ]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderRadius: Radius.small, padding: Spacing.half },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small - 2,
    minHeight: 36,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
