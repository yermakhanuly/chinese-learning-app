import { ComingSoon } from '@/components/card';
import { Screen } from '@/components/screen';

export default function ReviewScreen() {
  return (
    <Screen title="Review" subtitle="Flashcards and spaced repetition">
      <ComingSoon
        phase={4}
        items={[
          'Daily review queue, scheduled by how well you remember',
          'Flashcard decks, including your own cards',
          'Audio and reverse cards',
          'Weak words and a mistake notebook',
        ]}
      />
    </Screen>
  );
}
