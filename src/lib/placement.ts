/**
 * Placement test rules (pure, unit-tested). Units are checked in course order:
 * two questions per unit; 2/2 right → next unit; 1/2 → one more question decides (2 of 3);
 * otherwise the learner starts at that unit. `result` is the unit index to start at
 * (units.length = knows every unit).
 */
export type PlacementState = {
  unit: number;
  /** Questions asked in the current unit. */
  asked: number;
  /** Right answers in the current unit. */
  right: number;
  /** Questions answered in total. */
  answered: number;
  result: number | null;
};

export function placementStep(s: PlacementState, correct: boolean, unitCount: number): PlacementState {
  const asked = s.asked + 1;
  const right = s.right + (correct ? 1 : 0);
  const answered = s.answered + 1;
  const wrong = asked - right;
  const passed = right >= 2;
  const failed = wrong >= 2;
  if (passed) {
    const unit = s.unit + 1;
    return unit >= unitCount
      ? { unit: s.unit, asked, right, answered, result: unitCount }
      : { unit, asked: 0, right: 0, answered, result: null };
  }
  if (failed) return { unit: s.unit, asked, right, answered, result: s.unit };
  return { ...s, asked, right, answered };
}
