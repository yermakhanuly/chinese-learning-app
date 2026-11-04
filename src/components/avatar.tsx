import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { avatarDisplayUrl, initialsOf } from '@/lib/avatar';
import { supabaseUrl } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

type Props = { avatarUrl: string | null | undefined; name: string | null | undefined; email?: string | null; size?: number };

export function Avatar({ avatarUrl, name, email, size = 72 }: Props) {
  const theme = useTheme();
  const uri = avatarDisplayUrl(avatarUrl, supabaseUrl);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[shape, { backgroundColor: theme.backgroundSelected }]} accessibilityIgnoresInvertColors alt="Profile photo" />;
  }
  return (
    <View style={[shape, styles.initials, { backgroundColor: theme.tint }]} aria-label="Profile photo placeholder">
      <ThemedText style={{ color: theme.onTint, fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: '600' }}>
        {initialsOf(name, email)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: 'center', justifyContent: 'center' },
});
