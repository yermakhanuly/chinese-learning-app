/** Choices offered during onboarding and on the Profile screen. Values match DB check constraints. */

export type LearningGoal = 'travel' | 'business' | 'hsk_exam' | 'study_abroad' | 'casual';
export type SelfLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced';
export type DailyGoal = 5 | 10 | 15 | 20 | 30;
export type Script = 'simplified' | 'traditional';
export type ExplanationLanguage = 'en';
export type NewCardsPerDay = 5 | 10 | 20 | 30 | 50;

export type Option<T> = { value: T; label: string; description?: string };

export const LEARNING_GOALS: Option<LearningGoal>[] = [
  { value: 'travel', label: 'Travel', description: 'Get around, order food, talk to people' },
  { value: 'business', label: 'Business', description: 'Meetings, email, workplace Chinese' },
  { value: 'hsk_exam', label: 'HSK exam', description: 'Prepare for an HSK certificate' },
  { value: 'study_abroad', label: 'Study abroad', description: 'University life in China or Taiwan' },
  { value: 'casual', label: 'Just for fun', description: 'Culture, media, friends and family' },
];

export const SELF_LEVELS: Option<SelfLevel>[] = [
  { value: 'beginner', label: 'Complete beginner', description: 'I know little or no Chinese' },
  { value: 'elementary', label: 'Elementary', description: 'Basic phrases, around HSK 1–2' },
  { value: 'intermediate', label: 'Intermediate', description: 'Everyday conversations, around HSK 3–4' },
  { value: 'advanced', label: 'Advanced', description: 'Complex topics, HSK 5 and above' },
];

export const DAILY_GOALS: Option<DailyGoal>[] = [
  { value: 5, label: '5 min', description: 'Casual' },
  { value: 10, label: '10 min', description: 'Regular' },
  { value: 15, label: '15 min', description: 'Serious' },
  { value: 20, label: '20 min', description: 'Intense' },
  { value: 30, label: '30 min', description: 'Committed' },
];

export const SCRIPTS: Option<Script>[] = [
  { value: 'simplified', label: 'Simplified', description: '简体 · Mainland China, Singapore' },
  { value: 'traditional', label: 'Traditional', description: '繁體 · Taiwan, Hong Kong' },
];

export const NEW_CARDS_PER_DAY: Option<NewCardsPerDay>[] = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 50, label: '50' },
];

export const EXPLANATION_LANGUAGES: Option<ExplanationLanguage>[] = [{ value: 'en', label: 'English' }];

export function labelFor<T>(options: Option<T>[], value: T | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? 'Not set';
}
