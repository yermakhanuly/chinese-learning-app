/**
 * Handwriting stroke checking. Adapted from Hanzi Writer's stroke matcher
 * (github.com/chanind/hanzi-writer, MIT License, © David Chanin).
 *
 * Coordinates are Make Me a Hanzi's: a 1024 box with the y axis pointing up (top edge y = 900).
 * A stroke is described by its median: points from where the brush starts to where it ends.
 */
export type Point = { x: number; y: number };

const AVERAGE_DISTANCE_THRESHOLD = 350;
const START_AND_END_DIST_THRESHOLD = 250;
const FRECHET_THRESHOLD = 0.4;
const MIN_LEN_THRESHOLD = 0.35;
const COSINE_SIMILARITY_THRESHOLD = 0;
const SHAPE_FIT_ROTATIONS = [Math.PI / 16, Math.PI / 32, 0, -Math.PI / 32, -Math.PI / 16];

const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const magnitude = (p: Point) => Math.sqrt(p.x * p.x + p.y * p.y);
const distance = (a: Point, b: Point) => magnitude(subtract(a, b));
const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const cosineSimilarity = (a: Point, b: Point) => (a.x * b.x + a.y * b.y) / (magnitude(a) * magnitude(b));

export function toPoints(median: number[][]): Point[] {
  return median.map(([x, y]) => ({ x, y }));
}

export function curveLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += distance(points[i - 1], points[i]);
  return len;
}

function stripDuplicates(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

/** Resamples a curve to `count` evenly spaced points. */
function outlineCurve(curve: Point[], count = 30): Point[] {
  const total = curveLength(curve);
  const step = total / (count - 1);
  const out: Point[] = [curve[0]];
  let traveled = 0;
  let i = 1;
  let prev = curve[0];
  for (let n = 1; n < count - 1; n++) {
    const target = n * step;
    while (i < curve.length) {
      const seg = distance(prev, curve[i]);
      if (traveled + seg >= target && seg > 0) {
        const t = (target - traveled) / seg;
        const p = { x: prev.x + (curve[i].x - prev.x) * t, y: prev.y + (curve[i].y - prev.y) * t };
        traveled = target;
        prev = p;
        out.push(p);
        break;
      }
      traveled += seg;
      prev = curve[i];
      i++;
    }
  }
  out.push(curve[curve.length - 1]);
  return out;
}

/** Adds points so no segment is longer than `maxLen`. */
function subdivideCurve(curve: Point[], maxLen = 0.05): Point[] {
  const out = [curve[0]];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    const parts = Math.ceil(distance(a, b) / maxLen);
    for (let k = 1; k <= parts; k++) out.push({ x: a.x + ((b.x - a.x) * k) / parts, y: a.y + ((b.y - a.y) * k) / parts });
  }
  return out;
}

/** Same number of points, centered on the origin, scaled so start/end sit about 1 unit away. */
function normalizeCurve(curve: Point[]): Point[] {
  const outlined = outlineCurve(curve);
  const mean = { x: average(outlined.map((p) => p.x)), y: average(outlined.map((p) => p.y)) };
  const translated = outlined.map((p) => subtract(p, mean));
  const first = translated[0];
  const last = translated[translated.length - 1];
  const scale = Math.sqrt(average([first.x ** 2 + first.y ** 2, last.x ** 2 + last.y ** 2])) || 1;
  return subdivideCurve(translated.map((p) => ({ x: p.x / scale, y: p.y / scale })));
}

function rotate(curve: Point[], theta: number): Point[] {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return curve.map((p) => ({ x: cos * p.x - sin * p.y, y: sin * p.x + cos * p.y }));
}

/** Discrete Fréchet distance between two curves. */
function frechetDist(a: Point[], b: Point[]): number {
  const prev = new Float64Array(b.length);
  const cur = new Float64Array(b.length);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const d = distance(a[i], b[j]);
      if (i === 0 && j === 0) cur[j] = d;
      else if (i === 0) cur[j] = Math.max(cur[j - 1], d);
      else if (j === 0) cur[j] = Math.max(prev[0], d);
      else cur[j] = Math.max(Math.min(prev[j], prev[j - 1], cur[j - 1]), d);
    }
    prev.set(cur);
  }
  return cur[b.length - 1];
}

const edgeVectors = (points: Point[]) => points.slice(1).map((p, i) => subtract(p, points[i]));

function averageDistance(points: Point[], median: Point[]): number {
  return average(points.map((p) => Math.min(...median.map((m) => distance(m, p)))));
}

function startAndEndMatch(points: Point[], median: Point[], leniency: number): boolean {
  const start = distance(median[0], points[0]);
  const end = distance(median[median.length - 1], points[points.length - 1]);
  return start <= START_AND_END_DIST_THRESHOLD * leniency && end <= START_AND_END_DIST_THRESHOLD * leniency;
}

function directionMatches(points: Point[], median: Point[]): boolean {
  const strokeVectors = edgeVectors(median);
  const sims = edgeVectors(points)
    .filter((v) => magnitude(v) > 0)
    .map((v) => Math.max(...strokeVectors.map((s) => cosineSimilarity(s, v))));
  return sims.length > 0 && average(sims) > COSINE_SIMILARITY_THRESHOLD;
}

function lengthMatches(points: Point[], median: Point[], leniency: number): boolean {
  return (leniency * (curveLength(points) + 25)) / (curveLength(median) + 25) >= MIN_LEN_THRESHOLD;
}

function shapeMatches(points: Point[], median: Point[], leniency: number): boolean {
  const user = normalizeCurve(points);
  const stroke = normalizeCurve(median);
  const best = Math.min(...SHAPE_FIT_ROTATIONS.map((t) => frechetDist(stroke, rotate(user, t))));
  return best <= FRECHET_THRESHOLD * leniency;
}

type MatchData = { isMatch: boolean; avgDist: number; backwards: boolean };

function matchData(
  points: Point[],
  median: Point[],
  opts: { leniency: number; outlineVisible: boolean; firstStroke: boolean; checkBackwards: boolean },
): MatchData {
  const avgDist = averageDistance(points, median);
  const distMod = opts.outlineVisible || !opts.firstStroke ? 0.5 : 1;
  if (avgDist > AVERAGE_DISTANCE_THRESHOLD * distMod * opts.leniency) return { isMatch: false, avgDist, backwards: false };
  const isMatch =
    startAndEndMatch(points, median, opts.leniency) &&
    directionMatches(points, median) &&
    shapeMatches(points, median, opts.leniency) &&
    lengthMatches(points, median, opts.leniency);
  if (!isMatch && opts.checkBackwards) {
    const reversed = matchData([...points].reverse(), median, { ...opts, checkBackwards: false });
    if (reversed.isMatch) return { isMatch: false, avgDist, backwards: true };
  }
  return { isMatch, avgDist, backwards: false };
}

export type StrokeResult = {
  /** The drawn line is the expected stroke. */
  isMatch: boolean;
  /** It is the expected stroke, drawn from the wrong end. */
  backwards: boolean;
};

/**
 * Checks the learner's line against stroke `index` of a character (its `medians`).
 * A line that fits a later stroke better is rejected, so strokes must come in order.
 */
export function matchStroke(
  drawn: Point[],
  medians: number[][][],
  index: number,
  { outlineVisible = false, leniency = 1 }: { outlineVisible?: boolean; leniency?: number } = {},
): StrokeResult {
  const points = stripDuplicates(drawn);
  if (points.length < 2 || index >= medians.length) return { isMatch: false, backwards: false };
  const opts = { leniency, outlineVisible, firstStroke: index === 0, checkBackwards: true };
  const target = toPoints(medians[index]);
  const result = matchData(points, target, opts);
  if (!result.isMatch) return { isMatch: false, backwards: result.backwards };

  // If a later stroke fits better, be stricter with this one.
  let closest = result.avgDist;
  for (const later of medians.slice(index + 1)) {
    const m = matchData(points, toPoints(later), { ...opts, checkBackwards: false });
    if (m.isMatch && m.avgDist < closest) closest = m.avgDist;
  }
  if (closest < result.avgDist) {
    const adjust = (0.6 * (closest + result.avgDist)) / (2 * result.avgDist);
    const strict = matchData(points, target, { ...opts, leniency: leniency * adjust });
    return { isMatch: strict.isMatch, backwards: strict.backwards };
  }
  return { isMatch: true, backwards: false };
}

/** SVG path along a median (for animating a stroke being drawn). */
export function medianPath(median: number[][]): string {
  return median.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

export function medianLength(median: number[][]): number {
  return curveLength(toPoints(median));
}

/** Screen position inside a square pad of `size` px → character coordinates. */
export function toCharPoint(px: number, py: number, size: number): Point {
  return { x: (px / size) * 1024, y: 900 - (py / size) * 1024 };
}

/** Character coordinates → screen position inside a square pad of `size` px. */
export function toPadPoint(p: Point, size: number): { px: number; py: number } {
  return { px: (p.x / 1024) * size, py: ((900 - p.y) / 1024) * size };
}
