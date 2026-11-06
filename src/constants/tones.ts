/**
 * Tone trainer content. Relative imports only (read by scripts/generate-audio.ts).
 * Syllable clips are generated with exact tones (Azure SSML phonemes); pair words are real words.
 */
export type ToneNumber = 1 | 2 | 3 | 4;

export const TONES: { tone: ToneNumber; name: string; mark: string; how: string; contour: number[] }[] = [
  { tone: 1, name: 'First tone', mark: 'ā', how: 'High and level, like holding a note.', contour: [5, 5] },
  { tone: 2, name: 'Second tone', mark: 'á', how: 'Rising from the middle, like asking "huh?"', contour: [3, 5] },
  { tone: 3, name: 'Third tone', mark: 'ǎ', how: 'Low, dipping down (and up again only at the end of a phrase).', contour: [2, 1, 4] },
  { tone: 4, name: 'Fourth tone', mark: 'à', how: 'Falling sharply from high to low, like a firm "no!"', contour: [5, 1] },
];

/** Syllables drilled in all four tones (pinyin without tone marks), with a character per tone. */
export const TONE_SYLLABLES: { syllable: string; marked: [string, string, string, string]; chars: [string, string, string, string] }[] = [
  { syllable: 'ma', marked: ['mā', 'má', 'mǎ', 'mà'], chars: ['妈', '麻', '马', '骂'] },
  { syllable: 'ba', marked: ['bā', 'bá', 'bǎ', 'bà'], chars: ['八', '拔', '把', '爸'] },
  { syllable: 'yi', marked: ['yī', 'yí', 'yǐ', 'yì'], chars: ['一', '姨', '以', '意'] },
  { syllable: 'wu', marked: ['wū', 'wú', 'wǔ', 'wù'], chars: ['屋', '无', '五', '物'] },
  { syllable: 'tang', marked: ['tāng', 'táng', 'tǎng', 'tàng'], chars: ['汤', '糖', '躺', '烫'] },
  { syllable: 'shi', marked: ['shī', 'shí', 'shǐ', 'shì'], chars: ['诗', '十', '使', '是'] },
  { syllable: 'qi', marked: ['qī', 'qí', 'qǐ', 'qì'], chars: ['七', '骑', '起', '气'] },
  { syllable: 'guo', marked: ['guō', 'guó', 'guǒ', 'guò'], chars: ['锅', '国', '果', '过'] },
  { syllable: 'xiang', marked: ['xiāng', 'xiáng', 'xiǎng', 'xiàng'], chars: ['香', '详', '想', '向'] },
  { syllable: 'fen', marked: ['fēn', 'fén', 'fěn', 'fèn'], chars: ['分', '坟', '粉', '份'] },
];

/** Two-syllable words for every tone pair ("0" = neutral second syllable). */
export const TONE_PAIRS: { pair: string; words: string[] }[] = [
  { pair: '1-1', words: ['飞机', '咖啡'] },
  { pair: '1-2', words: ['中国', '欢迎'] },
  { pair: '1-3', words: ['铅笔', '身体'] },
  { pair: '1-4', words: ['商店', '天气'] },
  { pair: '1-0', words: ['妈妈', '他们'] },
  { pair: '2-1', words: ['昨天', '明天'] },
  { pair: '2-2', words: ['学习', '银行'] },
  { pair: '2-3', words: ['啤酒', '苹果'] },
  { pair: '2-4', words: ['学校', '同事'] },
  { pair: '2-0', words: ['朋友', '学生'] },
  { pair: '3-1', words: ['老师', '北京'] },
  { pair: '3-2', words: ['起床', '旅游'] },
  { pair: '3-3', words: ['你好', '可以'] },
  { pair: '3-4', words: ['考试', '米饭'] },
  { pair: '3-0', words: ['姐姐', '我们'] },
  { pair: '4-1', words: ['面包', '汽车'] },
  { pair: '4-2', words: ['大学', '问题'] },
  { pair: '4-3', words: ['电脑', '跳舞'] },
  { pair: '4-4', words: ['睡觉', '再见'] },
  { pair: '4-0', words: ['爸爸', '谢谢'] },
];

/** Tone changes, each with examples (written tones → spoken tones). */
export const TONE_CHANGES: { title: string; rule: string; examples: { zh: string; written: string; spoken: string }[] }[] = [
  {
    title: 'Third tone + third tone',
    rule: 'When two third tones meet, the first is said as a second tone. The pinyin keeps the written tones.',
    examples: [
      { zh: '你好', written: 'nǐ hǎo', spoken: 'ní hǎo' },
      { zh: '可以', written: 'kě yǐ', spoken: 'ké yǐ' },
      { zh: '很好', written: 'hěn hǎo', spoken: 'hén hǎo' },
    ],
  },
  {
    title: 'Half third tone',
    rule: 'A third tone before any other tone only goes low and does not rise again.',
    examples: [
      { zh: '老师', written: 'lǎo shī', spoken: 'lǎo (low) shī' },
      { zh: '米饭', written: 'mǐ fàn', spoken: 'mǐ (low) fàn' },
    ],
  },
  {
    title: '不 bù',
    rule: '不 is fourth tone, but becomes second tone before another fourth tone.',
    examples: [
      { zh: '不是', written: 'bù shì', spoken: 'bú shì' },
      { zh: '不对', written: 'bù duì', spoken: 'bú duì' },
      { zh: '不好', written: 'bù hǎo', spoken: 'bù hǎo' },
    ],
  },
  {
    title: '一 yī',
    rule: '一 is first tone on its own and in numbers; before a fourth tone it becomes second tone, before other tones fourth tone.',
    examples: [
      { zh: '一个', written: 'yī gè', spoken: 'yí gè' },
      { zh: '一起', written: 'yī qǐ', spoken: 'yì qǐ' },
      { zh: '一天', written: 'yī tiān', spoken: 'yì tiān' },
    ],
  },
];
