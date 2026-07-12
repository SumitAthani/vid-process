import { env } from "../config/env";

export function minRequiredHotKeys(durationSeconds: number): number {
  return Math.max(
    1,
    Math.floor((durationSeconds / 60) * env.MIN_REQUIRED_HOTKEYS),
  );
}

export function maxAllowedHotKeys(durationSeconds: number): number {
  return Math.max(
    1,
    Math.ceil((durationSeconds / 60) * env.MAX_ALLOWED_HOTKEYS),
  );
}

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptWindow = {
  index: number;
  start: number;
  end: number;
  text: string;
};

const DEFAULT_MIN = 3;
const DEFAULT_TARGET = 5;
const DEFAULT_MAX = 7;
const MAX_SILENCE_GAP = 1.5; // Flush immediately if there's a long pause

export function buildTranscriptWindows(
  segments: TranscriptSegment[],
  opts?: { minSec?: number; targetSec?: number; maxSec?: number },
): TranscriptWindow[] {
  const minSec = opts?.minSec ?? DEFAULT_MIN;
  const targetSec = opts?.targetSec ?? DEFAULT_TARGET;
  const maxSec = opts?.maxSec ?? DEFAULT_MAX;

  const cleaned = segments
    .map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }))
    .filter((s) => s.text.length > 0 && s.end > s.start);

  if (cleaned.length === 0) return [];

  const windows: TranscriptWindow[] = [];
  let buf: TranscriptSegment[] = [];
  let bufStart = 0;
  let bufEnd = 0;

  const flush = () => {
    if (buf.length === 0) return;
    windows.push({
      index: windows.length,
      start: bufStart,
      end: bufEnd,
      text: buf
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    });
    buf = [];
  };

  for (const seg of cleaned) {
    if (buf.length === 0) {
      buf = [seg];
      bufStart = seg.start;
      bufEnd = seg.end;
      continue;
    }

    const gap = seg.start - bufEnd;
    const durationWithNext = seg.end - bufStart;

    // 1. SILENCE CHECK: If there is a long pause, cut the B-roll here.
    if (gap >= MAX_SILENCE_GAP) {
      flush();
      buf = [seg];
      bufStart = seg.start;
      bufEnd = seg.end;
      continue;
    }

    // 2. MAX OVERRIDE: Prevent exceeding maxSec
    if (durationWithNext > maxSec && bufEnd - bufStart >= minSec) {
      flush();
      buf = [seg];
      bufStart = seg.start;
      bufEnd = seg.end;
      continue;
    }

    buf.push(seg);
    bufEnd = seg.end;

    const currentDuration = bufEnd - bufStart;

    // 3. SEMANTIC CHECK: If we are past minSec, try to split on punctuation
    const endsWithPunctuation = /[.!?]$/.test(seg.text);
    if (currentDuration >= minSec && endsWithPunctuation) {
      flush();
      continue;
    }

    // 4. TARGET CHECK: Hit target, no punctuation found, split anyway
    if (currentDuration >= targetSec) {
      flush();
    }
  }

  flush(); // leftover

  // 5. TRAILING MERGE: Rescue tiny leftover segments
  if (windows.length >= 2) {
    const last = windows[windows.length - 1];
    if (last.end - last.start < minSec) {
      const prev = windows[windows.length - 2];
      prev.end = last.end;
      prev.text = `${prev.text} ${last.text}`.trim();
      windows.pop();
    }
  }

  return windows;
}
