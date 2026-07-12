import {
  LayoutGraphOpts,
  LayoutGraphResult,
} from "../types/layout";

/** Even half-height for yuv420p (H/2, floored to even). */
export function halfHeight(height: number): number {
  return Math.floor(height / 2) & ~1;
}

function clampTransitionSec(transitionSec: number, windowDur: number): number {
  if (windowDur <= 0) return 0;
  return Math.min(Math.max(0, transitionSec), windowDur / 2);
}

/**
 * Build a single filter_complex that keeps full-screen primary as base and
 * overlays timed top-half-overlay / half-and-half pads with alpha fades.
 */
export function buildLayoutFilterGraph(
  opts: LayoutGraphOpts,
): LayoutGraphResult {
  const { width, height, segments } = opts;
  const Hh = halfHeight(height);

  if (segments.length === 0) {
    return { filterComplex: "", outputLabel: "[0:v]" };
  }

  const filters: string[] = [];
  let currentLabel = "[0:v]";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const start = seg.startTime;
    const end = seg.endTime;
    const dur = end - start;
    const t = clampTransitionSec(opts.transitionSec, dur);
    const fadeOutSt = Math.max(0, dur - t);
    const outPad = `v${i}`;
    // Commas in enable= expressions must be escaped for filter_complex
    const enable = `between(t\\,${start}\\,${end})`;

    if (seg.layout === "top-half-overlay") {
      filters.push(
        `[${seg.inputIndex}:v]` +
          `scale=${width}:${Hh}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${Hh},` +
          `format=yuva420p,` +
          `fade=t=in:st=0:d=${t}:alpha=1,` +
          `fade=t=out:st=${fadeOutSt}:d=${t}:alpha=1,` +
          `setpts=PTS-STARTPTS+${start}/TB` +
          `[br${i}]`,
      );
      filters.push(
        `${currentLabel}[br${i}]overlay=0:0:eof_action=pass:enable='${enable}'[${outPad}]`,
      );
    } else {
      // half-and-half: independent scale+crop into stacked halves, then timed overlay
      filters.push(
        `[0:v]` +
          `trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
          `scale=${width}:${Hh}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${Hh}` +
          `[spk${i}]`,
      );
      filters.push(
        `[${seg.inputIndex}:v]` +
          `scale=${width}:${Hh}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${Hh}` +
          `[brraw${i}]`,
      );
      filters.push(
        `[brraw${i}][spk${i}]vstack=inputs=2,` +
          `format=yuva420p,` +
          `fade=t=in:st=0:d=${t}:alpha=1,` +
          `fade=t=out:st=${fadeOutSt}:d=${t}:alpha=1,` +
          `setpts=PTS-STARTPTS+${start}/TB` +
          `[split${i}]`,
      );
      filters.push(
        `${currentLabel}[split${i}]overlay=0:0:eof_action=pass:enable='${enable}'[${outPad}]`,
      );
    }

    currentLabel = `[${outPad}]`;
  }

  return {
    filterComplex: filters.join(";"),
    outputLabel: currentLabel,
  };
}
