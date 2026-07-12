import { env } from "../config/env";

export type TimedSegment = {
  startTime: number;
  endTime: number;
  minDuration: number;
};

export type EnforceMinOnScreenOpts = {
  minSec?: number;
  maxSec?: number;
  /** If true, shrink windows longer than maxSec toward their center. Default: false */
  shrinkLongWindows?: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundMs(n: number): number {
  // Avoid float drift like 2.499999999
  return Math.round(n * 1000) / 1000;
}

export function enforceMinOnScreenDuration<T extends TimedSegment>(
  segments: T[],
  videoDuration: number,
  opts?: EnforceMinOnScreenOpts,
): T[] {
  const minSec = opts?.minSec ?? env.BROLL_MIN_ON_SCREEN_SEC;
  const maxSec = opts?.maxSec ?? env.BROLL_MAX_ON_SCREEN_SEC;
  const shrinkLongWindows = opts?.shrinkLongWindows ?? false;

  if (!(videoDuration > 0)) {
    return segments;
  }

  return segments.map((seg) => {
    let start = Math.max(0, seg.startTime);
    let end = Math.min(videoDuration, Math.max(seg.endTime, start));

    // Degenerate / inverted window: place a min-length window near the hint
    if (end <= start) {
      const idealStart = clamp(start, 0, Math.max(0, videoDuration - minSec));
      start = idealStart;
      end = Math.min(videoDuration, start + minSec);
    }

    let duration = end - start;

    // Expand short windows: end first, then start
    if (duration < minSec) {
      const expandEnd = Math.min(videoDuration - end, minSec - duration);
      end += expandEnd;
      duration = end - start;

      if (duration < minSec) {
        const expandStart = Math.min(start, minSec - duration);
        start -= expandStart;
        duration = end - start;
      }
    }

    // Optional: shrink long windows toward center
    if (shrinkLongWindows && duration > maxSec) {
      const center = (start + end) / 2;
      start = clamp(center - maxSec / 2, 0, videoDuration);
      end = Math.min(videoDuration, start + maxSec);
      // If clamped against the end, pull start back
      if (end - start < maxSec) {
        start = Math.max(0, end - maxSec);
      }
      duration = end - start;
    }

    start = roundMs(start);
    end = roundMs(end);
    duration = roundMs(end - start);

    // minDuration must fit inside the final on-screen window
    const minDuration = roundMs(
      clamp(
        seg.minDuration,
        Math.min(minSec, duration),
        Math.min(maxSec, duration),
      ),
    );

    return {
      ...seg,
      startTime: start,
      endTime: end,
      minDuration,
    };
  });
}
