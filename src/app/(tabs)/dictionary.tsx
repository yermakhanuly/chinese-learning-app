import { ComingSoon } from '@/components/card';
import { Screen } from '@/components/screen';

export default function DictionaryScreen() {
  return (
    <Screen title="Dictionary" subtitle="11,000+ HSK words and 125,000 dictionary entries">
      <ComingSoon
        phase={2}
        items={[
          'Search by characters, pinyin (with or without tones) or English',
          'Pinyin with tone marks, audio and example sentences',
          'Save words and browse by HSK level or topic',
        ]}
      />
    </Screen>
  );
}
