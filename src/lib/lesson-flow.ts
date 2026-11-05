/**
 * Pure lesson-player logic (no React): stable shuffles, grading, and the step queue.
 * Mistakes are asked again at the end of the lesson; the score counts first tries only.
 */
import { isCorrectBuild, type Step } from './lessons.ts';

/** Deterministic shuffle: the same seed always gives the same order (stable across re-renders). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function isExercise(step: Step): boolean {
  return step.type === 'choice' || step.type === 'fill' || step.type === 'build';
}

/** The learner's answer: an option index (choice/fill) or the tiles in order (build). */
export type Answer = number | string[];

export function grade(step: Step, answer: Answer): boolean {
  switch (step.type) {
    case 'choice':
    case 'fill':
      return answer === step.answer;
    case 'build':
      return Array.isArray(answer) && isCorrectBuild(step, answer);
    default:
      return true;
  }
}

/** The correct answer as text, for "Correct answer: …" feedback. */
export function correctAnswerText(step: Step): string {
  switch (step.type) {
    case 'choice':
      return step.options[step.answer];
    case 'fill':
      return step.before + step.options[step.answer] + step.after;
    case 'build':
      return step.answer.join(step.direction === 'en-zh' ? '' : ' ');
    default:
      return '';
  }
}

export type FlowState = {
  /** Step indexes still to do, current first. */
  queue: number[];
  /** Exercises answered wrong at least once (asked again once at the end). */
  missed: number[];
  /** Exercises answered right on the first try. */
  firstTryCorrect: number;
  done: number;
};

export function startFlow(steps: Step[]): FlowState {
  return { queue: steps.map((_, i) => i), missed: [], firstTryCorrect: 0, done: 0 };
}

/** Moves past the current step. `correct` is ignored for word/grammar steps. */
export function advance(state: FlowState, steps: Step[], correct: boolean): FlowState {
  const [current, ...rest] = state.queue;
  if (current === undefined) return state;
  const step = steps[current];
  if (!isExercise(step)) return { ...state, queue: rest, done: state.done + 1 };
  const firstTry = !state.missed.includes(current);
  if (correct) {
    return {
      ...state,
      queue: rest,
      done: state.done + 1,
      firstTryCorrect: state.firstTryCorrect + (firstTry ? 1 : 0),
    };
  }
  // Wrong: ask it again at the end, but only once (so a lesson always finishes).
  return {
    ...state,
    queue: firstTry ? [...rest, current] : rest,
    missed: firstTry ? [...state.missed, current] : state.missed,
    done: state.done + 1,
  };
}

/** Share of exercises answered right first time, 0–100. */
export function score(state: FlowState, steps: Step[]): number {
  const total = steps.filter(isExercise).length;
  return total ? Math.round((state.firstTryCorrect / total) * 100) : 100;
}

/** 0–1 for the progress bar: retries add to the total so the bar never runs backwards. */
export function progressFraction(state: FlowState, steps: Step[]): number {
  const total = steps.length + state.missed.length;
  return total ? state.done / total : 1;
}
