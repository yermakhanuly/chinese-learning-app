import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { PinyinToggle } from '@/components/dictionary-controls';
import { GrammarPage } from '@/components/grammar/grammar-page';
import { Screen } from '@/components/screen';
import { useHydrated } from '@/hooks/use-hydrated';

/** /grammar-point?id=g1-shi — one point of the grammar library. */
export default function GrammarPointScreen() {
  const hydrated = useHydrated();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Grammar', headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>{hydrated ? <GrammarPage key={id} id={id} /> : <ActivityIndicator />}</Screen>
    </>
  );
}
