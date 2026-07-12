export const LAYOUT_MODES = ["top-half-overlay", "half-and-half"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export type LayoutSegment = {
  clipPath: string;
  startTime: number;
  endTime: number;
  layout: LayoutMode;
};

export type ComposeWithLayoutsOpts = {
  primaryPath: string;
  outputPath: string;
  width: number;
  height: number;
  segments: LayoutSegment[];
  transitionMs: number;
};

/** Segment as referenced inside an FFmpeg multi-input filter graph. */
export type LayoutGraphSegment = {
  /** FFmpeg input index (0 = primary; clips start at 1). */
  inputIndex: number;
  startTime: number;
  endTime: number;
  layout: LayoutMode;
};

export type LayoutGraphOpts = {
  width: number;
  height: number;
  segments: LayoutGraphSegment[];
  transitionSec: number;
};

export type LayoutGraphResult = {
  filterComplex: string;
  /** Pad label including brackets, e.g. `[vout]`. */
  outputLabel: string;
};
