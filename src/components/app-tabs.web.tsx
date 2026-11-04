import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { type ComponentRef, type Ref } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, WideBreakpoint } from '@/constants/theme';
import { TABS, type TabDef } from '@/constants/tabs';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web: bottom tab bar on phones, left sidebar from tablet width up.
 */
export default function AppTabs() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WideBreakpoint;

  // Tabs scans its direct children for <TabList>/<TabTrigger>, so the list is built by a plain
  // function call (not a wrapper component) to keep it visible to that scan.
  return (
    <Tabs style={[styles.root, { flexDirection: wide ? 'row' : 'column', backgroundColor: theme.background }]}>
      {wide ? tabList(wide, theme) : null}
      <TabSlot style={styles.slot} />
      {!wide ? tabList(wide, theme) : null}
    </Tabs>
  );
}

function tabList(wide: boolean, theme: ReturnType<typeof useTheme>) {
  return (
    <TabList
      role="tablist"
      style={[
        wide ? styles.sidebar : styles.bottomBar,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      {wide ? (
        <View style={styles.brand}>
          <ThemedText type="subtitle" themeColor="tint">
            汉语
          </ThemedText>
          <ThemedText type="smallBold">HSK Chinese</ThemedText>
        </View>
      ) : null}
      {TABS.map((tab) => (
        <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
          <TabButton tab={tab} wide={wide} />
        </TabTrigger>
      ))}
    </TabList>
  );
}

type TabButtonProps = TabTriggerSlotProps & { tab: TabDef; wide: boolean };

// React 19: TabTrigger's `asChild` passes `ref` as a normal prop. expo-router types it against the
// View component rather than its instance, hence the cast.
function TabButton({ tab, wide, isFocused, ref, ...props }: TabButtonProps) {
  const theme = useTheme();
  const color = isFocused ? theme.tint : theme.textSecondary;
  return (
    <Pressable
      ref={ref as unknown as Ref<ComponentRef<typeof Pressable>>}
      {...props}
      role="tab"
      aria-selected={!!isFocused}
      aria-label={tab.label}
      style={({ pressed }) => [
        wide ? styles.sideItem : styles.bottomItem,
        wide && isFocused && { backgroundColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={{ ios: tab.sf.default, web: tab.web }} size={wide ? 22 : 24} tintColor={color} />
      <ThemedText type={wide ? 'default' : 'small'} style={{ color, fontWeight: isFocused ? '600' : '400' }}>
        {tab.label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, height: '100%' },
  slot: { flex: 1 },
  sidebar: {
    width: 232,
    justifyContent: 'flex-start',
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
  },
  brand: { paddingHorizontal: Spacing.two, paddingBottom: Spacing.four, gap: Spacing.half },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
  },
  bottomBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.two,
    paddingTop: Spacing.one,
  },
  bottomItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.one, gap: Spacing.half, minHeight: 48 },
  pressed: { opacity: 0.7 },
});
