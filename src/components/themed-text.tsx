import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'label' | 'small' | 'smallBold' | 'link' | 'code' | 'hanzi';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return (
    <Text
      role={type === 'title' || type === 'subtitle' || type === 'heading' ? 'heading' : undefined}
      style={[{ color: theme[themeColor ?? (type === 'link' ? 'tint' : 'text')] }, styles[type], style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: 600 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  subtitle: { fontSize: 22, lineHeight: 28, fontWeight: 600 },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: 600 },
  /** Same look as heading, but not announced as one (buttons, options). */
  label: { fontSize: 17, lineHeight: 24, fontWeight: 600 },
  link: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  /** Chinese characters: larger, with room for tall glyphs. */
  hanzi: { fontSize: 32, lineHeight: 44, fontWeight: 500 },
});
