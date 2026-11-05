import { placementStep, type PlacementState } from '../placement';

const start: PlacementState = { unit: 0, asked: 0, right: 0, answered: 0, result: null };
const run = (answers: boolean[], units = 3) => answers.reduce((s, a) => placementStep(s, a, units), start);

describe('placementStep', () => {
  it('starts at unit 1 when the first words are unknown', () => {
    expect(run([false, false]).result).toBe(0);
  });
  it('moves on after 2 right, decides on a third question after a split', () => {
    expect(run([true, true])).toMatchObject({ unit: 1, result: null });
    expect(run([true, false, true])).toMatchObject({ unit: 1, result: null });
    expect(run([true, false, false]).result).toBe(0);
  });
  it('places into the first unit the learner does not know', () => {
    expect(run([true, true, true, true, false, false]).result).toBe(2);
  });
  it('reports every unit known when all are passed', () => {
    const s = run([true, true, true, true, true, true]);
    expect(s.result).toBe(3);
    expect(s.answered).toBe(6);
  });
});
