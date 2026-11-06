/**
 * Stable file name for a text's recorded audio (used by the generation script and the app, so
 * the app can find a clip without asking the database). Two 32-bit FNV-1a hashes → 16 hex chars.
 * Relative `.ts` imports only (imported by Node scripts).
 */
export function audioKey(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 0x1000) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Syllable clips for the tone trainer are keyed like "tone:ma3". */
export const syllableText = (syllable: string, tone: number) => `tone:${syllable}${tone}`;
