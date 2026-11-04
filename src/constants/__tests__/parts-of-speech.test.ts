import { partsOfSpeech } from '../parts-of-speech';

describe('partsOfSpeech', () => {
  it('maps tags to learner labels without duplicates or noise', () => {
    expect(partsOfSpeech(['v', 'vn', 'g', 'nr'])).toEqual(['verb', 'noun']);
    expect(partsOfSpeech(['q', 'qv'])).toEqual(['measure word']);
    expect(partsOfSpeech([])).toEqual([]);
  });
});
