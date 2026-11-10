import { nextLesson, useCourse, useProgress } from '@/hooks/use-course';
import { useGrammarList, useGrammarMistakes, useReadingList, useReadingProgress } from '@/hooks/use-grammar';
import { useHskLevelCounts } from '@/hooks/use-hsk-level-counts';
import { useProfile } from '@/hooks/use-profile';
import { useProgressStats } from '@/hooks/use-progress';
import { useReviewSummary } from '@/hooks/use-review';
import { useConversations, useIsPremium } from '@/hooks/use-tutor';
import { weekStart, localDate } from '@/lib/progress';
import { recommendations, type Recommendation } from '@/lib/tutor';

const SELF_LEVEL: Record<string, number> = { beginner: 1, elementary: 2, intermediate: 2, advanced: 2 };

/** "What to study next": worked out from the learner's own data (no AI). Null until it has loaded. */
export function useStudyRecommendations(): Recommendation[] | null {
  const profile = useProfile().data;
  const review = useReviewSummary().data;
  const stats = useProgressStats().data;
  const grammarList = useGrammarList().data;
  const grammarMistakes = useGrammarMistakes().data;
  const readings = useReadingList().data;
  const readingProgress = useReadingProgress().data;
  const counts = useHskLevelCounts().data;
  const course = useCourse(1).data;
  const progress = useProgress().data;
  const conversations = useConversations().data;
  const { premium } = useIsPremium();

  if (!profile || !review || !stats || !grammarList || !readings || !readingProgress || !counts || !course) return null;

  // The course covers HSK 1–2: move to 2 once most HSK 1 words are learned.
  const words1 = stats.words_by_level['1'] ?? 0;
  const total1 = counts.find((c) => c.level === 1)?.count ?? 0;
  const level = Math.max(SELF_LEVEL[profile.self_level ?? 'beginner'] ?? 1, total1 && words1 / total1 >= 0.8 ? 2 : 1);
  const lesson = nextLesson(course, progress, profile.start_lesson_id);
  const levelReadings = readings.filter((r) => r.hsk_level === level);
  const since = weekStart(localDate());

  return recommendations({
    level,
    dueReviews: review.due + review.new,
    weakWords: review.weak,
    grammarMistakes: grammarMistakes?.length ?? 0,
    nextLesson: lesson ? { id: lesson.id, title: lesson.title } : null,
    grammarPractised: stats.grammar_by_level[String(level)]?.points ?? 0,
    grammarTotal: grammarList.filter((g) => g.hsk_level === level).length,
    readingsDone: levelReadings.filter((r) => readingProgress.has(r.id)).length,
    readingsTotal: levelReadings.length,
    wordsLearned: stats.words_by_level[String(level)] ?? 0,
    wordsTotal: counts.find((c) => c.level === level)?.count ?? 0,
    mockBest: stats.mock_best[`hsk${level}`] ?? null,
    conversationsThisWeek: (conversations ?? []).filter((c) => localDate(new Date(c.updated_at)) >= since).length,
    premium,
  });
}
