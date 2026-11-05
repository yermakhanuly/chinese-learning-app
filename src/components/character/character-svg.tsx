/**
 * Drawing Chinese characters from Make Me a Hanzi stroke data with react-native-svg (iPhone + web):
 * a practice grid, the stroke-order animation, and the writing pad.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Polyline } from 'react-native-svg';

import { Button } from '@/components/button';
import { useScrollLock } from '@/components/scroll-lock';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchStroke, medianLength, medianPath, toCharPoint, type Point } from '@/lib/stroke-match';

export type StrokeData = { strokes: string[]; medians: number[][][] };

/** Make Me a Hanzi's y axis points up, with the top edge at y = 900. */
const FLIP = 'matrix(1 0 0 -1 0 900)';

/** 米字格: the square practice grid with center lines and diagonals. */
function Grid({ size }: { size: number }) {
  const theme = useTheme();
  const c = theme.border;
  return (
    <>
      <Line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke={c} strokeWidth={1} strokeDasharray="6 6" />
      <Line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke={c} strokeWidth={1} strokeDasharray="6 6" />
      <Line x1={0} y1={0} x2={size} y2={size} stroke={c} strokeWidth={1} strokeDasharray="6 6" />
      <Line x1={size} y1={0} x2={0} y2={size} stroke={c} strokeWidth={1} strokeDasharray="6 6" />
    </>
  );
}

function Frame({ size, label, children }: { size: number; label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      role="img"
      aria-label={label}
      style={[styles.frame, { width: size, height: size, borderColor: theme.border, backgroundColor: theme.background }]}>
      {children}
    </View>
  );
}

/** Animated pieces of one stroke: the brush moving along the median, clipped to the stroke shape. */
function PartialStroke({ path, median, progress, color }: { path: string; median: number[][]; progress: number; color: string }) {
  const id = `clip${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const len = medianLength(median) + 64;
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Path d={path} />
        </ClipPath>
      </Defs>
      <Path
        d={medianPath(median)}
        clipPath={`url(#${id})`}
        fill="none"
        stroke={color}
        strokeWidth={160}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={[len, len]}
        strokeDashoffset={len * (1 - progress)}
      />
    </>
  );
}

/**
 * Animated stroke order. Plays once when shown; Replay starts over; Step shows one more stroke.
 */
export function StrokeOrder({ character, data, size = 240 }: { character: string; data: StrokeData; size?: number }) {
  const theme = useTheme();
  const total = data.strokes.length;
  // Strokes fully drawn, and how far the next one is (0–1).
  const [shown, setShown] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frame = useRef<number | null>(null);

  // Playing until the last stroke is drawn.
  const animating = playing && shown < total;

  useEffect(() => {
    if (!animating) return;
    const duration = 250 + medianLength(data.medians[shown]) * 0.7;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setProgress(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else {
        frame.current = null;
        setTimeout(() => {
          setProgress(0);
          setShown((s) => s + 1);
        }, 120);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [animating, shown, data.medians]);

  const replay = () => {
    setShown(0);
    setProgress(0);
    setPlaying(true);
  };
  const step = () => {
    setPlaying(false);
    setProgress(0);
    setShown((s) => (s >= total ? 1 : s + 1));
  };

  return (
    <View style={styles.center}>
      <Frame size={size} label={`Stroke order of ${character}: ${total} strokes`}>
        <Svg width={size} height={size}>
          <Grid size={size} />
        </Svg>
        <Svg width={size} height={size} viewBox="0 0 1024 1024" style={StyleSheet.absoluteFill}>
          <G transform={FLIP}>
            {data.strokes.map((d, i) => (
              <Path key={`o${i}`} d={d} fill={theme.backgroundSelected} />
            ))}
            {data.strokes.slice(0, shown).map((d, i) => (
              <Path key={`s${i}`} d={d} fill={theme.text} />
            ))}
            {animating ? (
              <PartialStroke key={shown} path={data.strokes[shown]} median={data.medians[shown]} progress={progress} color={theme.tint} />
            ) : null}
          </G>
        </Svg>
      </Frame>
      <ThemedText type="small" themeColor="textSecondary" aria-live="polite">
        Stroke {Math.min(shown + (animating ? 1 : 0), total)} of {total}
      </ThemedText>
      <View style={styles.row}>
        <Button label="Replay" variant="secondary" onPress={replay} style={styles.flex} />
        <Button label="Next stroke" variant="secondary" onPress={step} style={styles.flex} />
      </View>
    </View>
  );
}

export type WritingMode = 'trace' | 'write' | 'memory';
export type WritingResult = { strokes: number; misses: number; hinted: boolean };

const HINT_AFTER_MISSES = 3;

/**
 * Write a character stroke by stroke (finger, mouse or stylus). Each stroke is checked for shape,
 * direction and order; a wrong one is rejected. After 3 misses on a stroke, it flashes as a hint.
 *   trace:  all strokes shown as a light outline
 *   write:  only the grid (finished strokes stay)
 *   memory: like write; the caller hides the character itself
 */
export function WritingPad({
  character,
  data,
  mode,
  size = 280,
  onComplete,
}: {
  character: string;
  data: StrokeData;
  mode: WritingMode;
  size?: number;
  onComplete?: (result: WritingResult) => void;
}) {
  const theme = useTheme();
  const total = data.strokes.length;
  const [done, setDone] = useState(0);
  const [ink, setInk] = useState<{ px: number; py: number }[]>([]);
  const points = useRef<Point[]>([]);
  const [missesHere, setMissesHere] = useState(0);
  const [misses, setMisses] = useState(0);
  const [hinted, setHinted] = useState(false);
  const [hint, setHint] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState(`Draw stroke 1 of ${total}.`);
  const finished = done >= total;
  const lockScroll = useScrollLock();

  // Hide a flashed hint / red ink after a moment.
  useEffect(() => {
    if (hint === null) return;
    const t = setTimeout(() => setHint(null), 1200);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => {
    if (!wrong) return;
    const t = setTimeout(() => {
      setWrong(false);
      setInk([]);
    }, 500);
    return () => clearTimeout(t);
  }, [wrong]);

  function showHint() {
    if (finished) return;
    setHint(done);
    setHinted(true);
    setMessage(`Hint: this is stroke ${done + 1}. Now draw it.`);
  }

  function finishStroke() {
    lockScroll(false);
    const drawn = points.current;
    points.current = [];
    if (finished || drawn.length < 2) {
      setInk([]);
      return;
    }
    const result = matchStroke(drawn, data.medians, done, { outlineVisible: mode === 'trace' });
    if (result.isMatch) {
      const next = done + 1;
      setDone(next);
      setInk([]);
      setMissesHere(0);
      if (next >= total) {
        setMessage(misses ? `Done! ${misses} ${misses === 1 ? 'miss' : 'misses'}.` : 'Done! Perfect.');
        onComplete?.({ strokes: total, misses, hinted });
      } else {
        setMessage(`Good. Draw stroke ${next + 1} of ${total}.`);
      }
      return;
    }
    const here = missesHere + 1;
    setMissesHere(here);
    setMisses((m) => m + 1);
    setWrong(true);
    if (here >= HINT_AFTER_MISSES) {
      setHint(done);
      setHinted(true);
      setMessage(`Here is stroke ${done + 1}. Try again.`);
    } else {
      setMessage(result.backwards ? 'Right stroke, wrong direction. Try again.' : `Not stroke ${done + 1}. Try again.`);
    }
  }

  function restart() {
    setDone(0);
    setInk([]);
    setMissesHere(0);
    setMisses(0);
    setHinted(false);
    setHint(null);
    setMessage(`Draw stroke 1 of ${total}.`);
  }

  const inkColor = wrong ? theme.danger : theme.tint;
  const add = (x: number, y: number) => {
    const px = Math.max(0, Math.min(size, x));
    const py = Math.max(0, Math.min(size, y));
    points.current.push(toCharPoint(px, py, size));
    setInk((prev) => [...prev, { px, py }]);
  };

  return (
    <View style={styles.center}>
      <Frame size={size} label={`Writing pad for ${character}. ${message}`}>
        <Svg width={size} height={size}>
          <Grid size={size} />
        </Svg>
        <Svg width={size} height={size} viewBox="0 0 1024 1024" style={StyleSheet.absoluteFill}>
          <G transform={FLIP}>
            {mode === 'trace' || finished
              ? data.strokes.map((d, i) => <Path key={`o${i}`} d={d} fill={theme.backgroundSelected} />)
              : null}
            {data.strokes.slice(0, done).map((d, i) => (
              <Path key={`s${i}`} d={d} fill={finished ? theme.success : theme.text} />
            ))}
            {hint !== null && hint < total ? <Path d={data.strokes[hint]} fill={theme.tint} opacity={0.55} /> : null}
          </G>
        </Svg>
        {ink.length > 1 ? (
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            <Polyline
              points={ink.map((p) => `${p.px},${p.py}`).join(' ')}
              fill="none"
              stroke={inkColor}
              strokeWidth={Math.max(6, size / 28)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
        {/* The touch surface: no children, so locations are relative to the pad. */}
        <View
          testID="writing-surface"
          style={[StyleSheet.absoluteFill, styles.surface]}
          onStartShouldSetResponder={() => !finished}
          onMoveShouldSetResponder={() => !finished}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            lockScroll(true);
            points.current = [];
            setInk([]);
            add(e.nativeEvent.locationX, e.nativeEvent.locationY);
          }}
          onResponderMove={(e) => add(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          onResponderRelease={finishStroke}
          onResponderTerminate={finishStroke}
        />
      </Frame>
      <ThemedText role="status" themeColor={wrong ? 'danger' : finished ? 'success' : 'textSecondary'} style={styles.message}>
        {message}
      </ThemedText>
      <View style={styles.row}>
        <Button label="Hint" variant="secondary" disabled={finished} onPress={showHint} style={styles.flex} />
        <Button label="Start over" variant="ghost" onPress={restart} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Spacing.two },
  frame: { borderWidth: 1, borderRadius: Radius.small, overflow: 'hidden' },
  surface: { touchAction: 'none', cursor: 'crosshair' } as object,
  row: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  flex: { flex: 1 },
  message: { textAlign: 'center', minHeight: 24 },
});
