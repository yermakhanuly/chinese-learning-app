import { ComingSoon } from '@/components/card';
import { Screen } from '@/components/screen';

export default function LearnScreen() {
  return (
    <Screen title="Learn" subtitle="HSK lessons, grammar and reading">
      <ComingSoon
        phase={3}
        items={[
          'HSK roadmap: level → unit → 3–10 minute lessons',
          'Exercises: multiple choice, fill-in-the-blank, sentence building, translation',
          'Placement test and a path built around your goal',
        ]}
      />
      <ComingSoon phase={5} items={['Characters: stroke order and handwriting practice']} />
      <ComingSoon phase={6} items={['Tones and pronunciation with feedback']} />
      <ComingSoon phase={7} items={['Grammar library and graded reading']} />
    </Screen>
  );
}
