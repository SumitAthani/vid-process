export type FitStrategy = "none" | "trim" | "loop";

export type ClipFitPlan =
  | { strategy: "none"; targetDuration: number }
  | { strategy: "trim"; targetDuration: number; trimStart: number }
  | { strategy: "loop"; targetDuration: number; loopCount: number };

const DURATION_EPS = 0.05; // 50ms tolerance

function roundMs(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Decide how to make a source clip match an on-screen window.
 * - longer → trim from start
 * - equal  → none
 * - shorter → loop then trim to exact target
 */
export function planClipFit(
  sourceDuration: number,
  windowDuration: number,
): ClipFitPlan {
  if (!(sourceDuration > 0) || !(windowDuration > 0)) {
    throw new Error(
      `Invalid durations: source=${sourceDuration}, window=${windowDuration}`,
    );
  }

  const targetDuration = roundMs(windowDuration);

  if (Math.abs(sourceDuration - targetDuration) <= DURATION_EPS) {
    return { strategy: "none", targetDuration };
  }

  if (sourceDuration > targetDuration) {
    return { strategy: "trim", targetDuration, trimStart: 0 };
  }

  // stream_loop N means play (N + 1) times
  const plays = Math.ceil(targetDuration / sourceDuration);
  const loopCount = Math.max(0, plays - 1);

  return { strategy: "loop", targetDuration, loopCount };
}
