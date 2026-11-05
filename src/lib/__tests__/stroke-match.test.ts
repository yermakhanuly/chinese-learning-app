import { etymologyText, charactersOfWords, partsOf } from '../characters';
import { matchStroke, toCharPoint, toPadPoint, toPoints, type Point } from '../stroke-match';
// Medians from Make Me a Hanzi (Arphic Public License).
import MEDIANS from './fixtures/medians.json';

const M = MEDIANS as Record<string, number[][][]>;

/** A hand-drawn version of a median: resampled, with a little wobble and offset. */
function scribble(median: number[][], { wobble = 15, shift = { x: 20, y: -15 } } = {}): Point[] {
  const pts = toPoints(median);
  const out: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
      const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
      const w = Math.sin(out.length) * wobble;
      out.push({ x: x + shift.x + w, y: y + shift.y - w });
    }
  }
  out.push({ x: pts[pts.length - 1].x + shift.x, y: pts[pts.length - 1].y + shift.y });
  return out;
}

describe('matchStroke', () => {
  it('accepts every stroke of a character drawn in order', () => {
    for (const ch of ['十', '人', '口', '好']) {
      M[ch].forEach((median, i) => {
        expect({ ch, i, ...matchStroke(scribble(median), M[ch], i) }).toMatchObject({ isMatch: true });
      });
    }
  });

  it('rejects strokes in the wrong order', () => {
    // 十: the vertical stroke first.
    expect(matchStroke(scribble(M['十'][1]), M['十'], 0).isMatch).toBe(false);
    // 口: the bottom stroke instead of the first (left) one.
    expect(matchStroke(scribble(M['口'][2]), M['口'], 0).isMatch).toBe(false);
  });

  it('flags a stroke drawn backwards', () => {
    const reversed = scribble([...M['十'][0]].reverse());
    expect(matchStroke(reversed, M['十'], 0)).toEqual({ isMatch: false, backwards: true });
  });

  it('rejects scribbles, dots and far-away lines', () => {
    const dot = [{ x: 500, y: 400 }];
    expect(matchStroke(dot, M['十'], 0).isMatch).toBe(false);
    const zigzag = Array.from({ length: 20 }, (_, i) => ({ x: 100 + i * 40, y: i % 2 ? 100 : 800 }));
    expect(matchStroke(zigzag, M['十'], 0).isMatch).toBe(false);
    expect(matchStroke(scribble(M['十'][0], { shift: { x: 0, y: -400 }, wobble: 0 }), M['十'], 0).isMatch).toBe(false);
  });

  it('is stricter when the outline is shown', () => {
    const sloppy = scribble(M['人'][0], { shift: { x: 150, y: -150 }, wobble: 0 });
    expect(matchStroke(sloppy, M['人'], 0).isMatch).toBe(true);
    expect(matchStroke(sloppy, M['人'], 0, { outlineVisible: true }).isMatch).toBe(false);
  });

  it('converts between pad and character coordinates', () => {
    const p = toCharPoint(150, 75, 300);
    expect(p).toEqual({ x: 512, y: 644 });
    expect(toPadPoint(p, 300)).toEqual({ px: 150, py: 75 });
  });
});

describe('character helpers', () => {
  it('lists the parts of a decomposition', () => {
    expect(partsOf('⿰女子')).toEqual(['女', '子']);
    expect(partsOf('⿱⿰木木？', '森')).toEqual(['木']);
    expect(partsOf(null)).toEqual([]);
  });

  it('explains the origin', () => {
    expect(etymologyText({ type: 'ideographic', hint: 'A woman 女 with a son 子' })).toBe('An idea: A woman 女 with a son 子.');
    expect(etymologyText({ type: 'pictophonetic', semantic: '口', hint: 'mouth', phonetic: '马' })).toBe(
      '口 (mouth) gives the meaning, 马 gives the sound.',
    );
    expect(etymologyText(null)).toBeNull();
  });

  it('finds the characters of HSK words and their lowest level', () => {
    const chars = charactersOfWords([
      { simplified: '学生', traditional: '學生', hsk_level: 1 },
      { simplified: '学习', traditional: '學習', hsk_level: 2 },
      { simplified: 'A型', traditional: 'A型', hsk_level: 5 },
    ]);
    expect(chars.get('学')).toEqual({ level: 1, traditionalOnly: false });
    expect(chars.get('习')).toEqual({ level: 2, traditionalOnly: false });
    expect(chars.get('學')).toEqual({ level: 1, traditionalOnly: true });
    expect(chars.has('A')).toBe(false);
  });
});
