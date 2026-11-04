import { NativeTabs } from 'expo-router/native-tabs';

import { TABS } from '@/constants/tabs';
import { useTheme } from '@/hooks/use-theme';

/** iPhone: system tab bar. */
export default function AppTabs() {
  const theme = useTheme();
  return (
    <NativeTabs tintColor={theme.tint} backgroundColor={theme.background}>
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
