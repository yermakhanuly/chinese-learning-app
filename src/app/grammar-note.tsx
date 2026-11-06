import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { CloseButton } from '@/components/close-button';
import { GrammarPage } from '@/components/grammar/grammar-page';
import { Screen } from '@/components/screen';
import { useHydrated } from '@/hooks/use-hydrated';

/** /grammar-note?id=g1-shi — a grammar point opened from a lesson, as a modal over it. */
export default function GrammarNoteScreen() {
  const hydrated = useHydrated();
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Screen modal topAction={<CloseButton />}>
      {hydrated ? <GrammarPage key={id} id={id} inModal /> : <ActivityIndicator />}
    </Screen>
  );
}
