import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { env } from "../config/env";
import { VideoMetadata } from "../types/media";
import { ClipFitPlan } from "../utils/broll-fit";
import { CropStrategy, PadBackground } from "../types/crop";
import { ComposeWithLayoutsOpts, LayoutMode } from "../types/layout";
import {
  buildLayoutFilterGraph,
  buildPrebakedOverlayFilterGraph,
  clampTransitionSec,
  halfHeight,
} from "../utils/layout-graph";
import { wrapSrtToAss } from "../utils/subtitle-formatter";
import path from "path";

const execFileAsync = promisify(execFile);

export async function probeVideo(
  localVideoPath: string,
): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    localVideoPath,
  ]);

  const probe = JSON.parse(stdout);
  const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = probe.streams?.find((s: any) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("No video stream found");
  }

  const [num, den] = (videoStream.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den ? num / den : 0;

  return {
    durationSeconds: parseFloat(probe.format?.duration ?? "0"),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    fps,
  };
}

export async function extractAudio(
  localVideoPath: string,
  workDir: string,
): Promise<string> {
  const localAudioPath = path.join(workDir, "audio.wav");

  await execFileAsync(env.FFMPEG_PATH, [
    "-nostdin",
    "-y",
    "-i",
    localVideoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    localAudioPath,
  ]);

  return localAudioPath;
}

/**
 * Fit a local clip to exactly plan.targetDuration seconds.
 * Strips audio (B-roll under talking head shouldn't keep stock audio).
 */
export async function fitClipToDuration(
  inputPath: string,
  outputPath: string,
  plan: ClipFitPlan,
): Promise<string> {
  const commonOut = [
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  if (plan.strategy === "none") {
    await execFileAsync(env.FFMPEG_PATH, [
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-t",
      String(plan.targetDuration),
      ...commonOut,
    ]);
    return outputPath;
  }

  if (plan.strategy === "trim") {
    await execFileAsync(env.FFMPEG_PATH, [
      "-nostdin",
      "-y",
      "-ss",
      String(plan.trimStart),
      "-i",
      inputPath,
      "-t",
      String(plan.targetDuration),
      ...commonOut,
    ]);
    return outputPath;
  }

  await execFileAsync(env.FFMPEG_PATH, [
    "-nostdin",
    "-y",
    "-stream_loop",
    String(plan.loopCount),
    "-i",
    inputPath,
    "-t",
    String(plan.targetDuration),
    ...commonOut,
  ]);
  return outputPath;
}

const ENCODE_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-threads",
  "2",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
] as const;

export type FitPrimaryToVerticalOpts = {
  width: number;
  height: number;
  strategy: CropStrategy;
  padBackground?: PadBackground | null;
};

/**
 * Fit primary video into a vertical frame (e.g. 1080×1920) using center crop or pad.
 * Re-encodes video (H.264) and audio (AAC) so the output is mux-ready.
 */
export async function fitPrimaryToVertical(
  inputPath: string,
  outputPath: string,
  opts: FitPrimaryToVerticalOpts,
): Promise<string> {
  const { width, height, strategy, padBackground } = opts;

  if (strategy === "pad") {
    const bg = padBackground ?? "blur";
    if (bg === "blur") {
      await execFileAsync(env.FFMPEG_PATH, [
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-filter_complex",
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=20[bg];` +
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];` +
          `[bg][fg]overlay=(W-w)/2:(H-h)/2`,
        ...ENCODE_ARGS,
        outputPath,
      ]);
      return outputPath;
    }

    const color = bg === "white" ? "white" : "black";
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${color}`;
    await execFileAsync(env.FFMPEG_PATH, [
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-vf",
      vf,
      ...ENCODE_ARGS,
      outputPath,
    ]);
    return outputPath;
  }

  // center crop
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  await execFileAsync(env.FFMPEG_PATH, [
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-vf",
    vf,
    ...ENCODE_ARGS,
    outputPath,
  ]);

  return outputPath;
}

/** Prefer fitPrimaryToVertical with strategy "center". */
export async function cropToVertical(
  inputPath: string,
  outputPath: string,
  opts: { width: number; height: number },
): Promise<string> {
  return fitPrimaryToVertical(inputPath, outputPath, {
    ...opts,
    strategy: "center",
  });
}

/**
 * Pre-bake an individual B-roll segment into an isolated, lossless QuickTime Animation (.mov)
 * clip with alpha transparency.
 *
 * Each pre-bake only opens 2 input streams and executes in ~0.4s, using < 150 MB of RAM.
 */
export async function prebakeSegment(opts: {
  primaryPath: string;
  clipPath: string;
  startTime: number;
  endTime: number;
  layout: LayoutMode;
  transitionMs: number;
  outputPath: string;
  width: number;
  height: number;
}): Promise<void> {
  const dur = Math.max(0.1, opts.endTime - opts.startTime);
  const Hh = halfHeight(opts.height);
  const t = clampTransitionSec(opts.transitionMs / 1000, dur);
  const fadeOutSt = Math.max(0, dur - t);

  if (opts.layout === "top-half-overlay") {
    await execFileAsync(env.FFMPEG_PATH, [
      "-nostdin",
      "-y",
      "-t",
      String(dur),
      "-i",
      opts.clipPath,
      "-filter_complex",
      `[0:v]scale=${opts.width}:${Hh}:force_original_aspect_ratio=increase,crop=${opts.width}:${Hh},` +
        `format=yuva420p,fade=t=in:st=0:d=${t}:alpha=1,fade=t=out:st=${fadeOutSt}:d=${t}:alpha=1[out]`,
      "-map",
      "[out]",
      "-c:v",
      "qtrle",
      opts.outputPath,
    ]);
    return;
  }

  // half-and-half layout: top half = B-roll, bottom half = speaker (extracted via fast -ss seek)
  await execFileAsync(env.FFMPEG_PATH, [
    "-nostdin",
    "-y",
    "-ss",
    String(opts.startTime),
    "-t",
    String(dur),
    "-i",
    opts.primaryPath,
    "-t",
    String(dur),
    "-i",
    opts.clipPath,
    "-filter_complex",
    `[0:v]scale=${opts.width}:${Hh}:force_original_aspect_ratio=increase,crop=${opts.width}:${Hh}[spk];` +
      `[1:v]scale=${opts.width}:${Hh}:force_original_aspect_ratio=increase,crop=${opts.width}:${Hh}[br];` +
      `[br][spk]vstack=inputs=2,format=yuva420p,fade=t=in:st=0:d=${t}:alpha=1,fade=t=out:st=${fadeOutSt}:d=${t}:alpha=1[out]`,
    "-map",
    "[out]",
    "-c:v",
    "qtrle",
    opts.outputPath,
  ]);
}

/**
 * Composite timed B-roll layouts onto a full-timeline primary (9:16).
 *
 * Uses a Two-Phase Pre-Bake Architecture:
 * 1. Pre-bakes each split segment into an isolated temporary .mov file with alpha channel.
 * 2. Runs a clean, linear overlay pass onto the main timeline.
 *
 * Keeps primary audio when present; B-roll audio is ignored.
 */
export async function composeWithLayouts(
  opts: ComposeWithLayoutsOpts,
): Promise<string> {
  const { primaryPath, outputPath, width, height, segments, transitionMs } =
    opts;

  if (segments.length === 0) {
    await execFileAsync(env.FFMPEG_PATH, [
      "-nostdin",
      "-y",
      "-i",
      primaryPath,
      ...ENCODE_ARGS,
      outputPath,
    ]);
    return outputPath;
  }

  const workDir = path.dirname(outputPath);
  const prebakedPaths: string[] = [];

  try {
    // Phase 1: Pre-bake each layout segment independently (each uses < 150 MB RAM)
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const prebakedPath = path.join(workDir, `pb-seg-${i}.mov`);
      await prebakeSegment({
        primaryPath,
        clipPath: seg.clipPath,
        startTime: seg.startTime,
        endTime: seg.endTime,
        layout: seg.layout,
        transitionMs,
        outputPath: prebakedPath,
        width,
        height,
      });
      prebakedPaths.push(prebakedPath);
    }

    // Phase 2: Simple linear overlay pass (primary video read strictly once, linearly)
    const overlaySegments = segments.map((seg, i) => ({
      inputIndex: i + 1,
      startTime: seg.startTime,
      endTime: seg.endTime,
    }));

    const { filterComplex, outputLabel } = buildPrebakedOverlayFilterGraph({
      segments: overlaySegments,
    });

    const args: string[] = ["-nostdin", "-y", "-i", primaryPath];
    for (const pbPath of prebakedPaths) {
      args.push("-i", pbPath);
    }

    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      outputLabel,
      "-map",
      "0:a?",
      ...ENCODE_ARGS,
      outputPath,
    );

    await execFileAsync(env.FFMPEG_PATH, args);
    return outputPath;
  } finally {
    // Clean up temporary prebaked segment files
    for (const pbPath of prebakedPaths) {
      await fs.unlink(pbPath).catch(() => {});
    }
  }
}

/** Escape a local path for use inside an FFmpeg filtergraph argument. */
function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export type BurnSubtitlesStyle = {
  fontName: string;
  fontSize: number;
  marginV: number;
  marginL: number;
  marginR: number;
};

let subtitlesFilterSupported: boolean | null = null;

/**
 * Fail fast when FFmpeg was built without libass (no `subtitles` filter).
 */
export async function assertSubtitlesFilterSupport(): Promise<void> {
  if (subtitlesFilterSupported === true) return;
  if (subtitlesFilterSupported === false) {
    throw missingSubtitlesFilterError();
  }

  const { stdout } = await execFileAsync(env.FFMPEG_PATH, [
    "-hide_banner",
    "-filters",
  ]);
  // Filter list lines look like: " .. subtitles  V->V ..." or " ... subtitles V->V ..."
  subtitlesFilterSupported = /^\s*\S+\s+subtitles\s+/m.test(stdout);

  if (!subtitlesFilterSupported) {
    throw missingSubtitlesFilterError();
  }
}

function missingSubtitlesFilterError(): Error {
  return new Error(
    `FFmpeg at "${env.FFMPEG_PATH}" lacks the subtitles filter (requires libass). ` +
      `Install an FFmpeg build with libass enabled, or set FFMPEG_PATH to a full binary.`,
  );
}

/**
 * Burn SRT captions into a video with Instagram-safe placement and mobile-readable styling.
 * Re-encodes video; copies audio when present.
 */
export async function burnSubtitles(
  inputPath: string,
  srtPath: string,
  outputPath: string,
  style: BurnSubtitlesStyle,
): Promise<string> {
  await assertSubtitlesFilterSupport();

  const srtDir = path.dirname(path.resolve(srtPath));
  const inputAbs = path.resolve(inputPath);
  const outputAbs = path.resolve(outputPath);
  const assPath = path.join(srtDir, "burn.ass");
  const assName = path.basename(assPath);

  const srtContent = await fs.readFile(path.resolve(srtPath), "utf8");
  const assContent = wrapSrtToAss(srtContent, {
    fontName: style.fontName,
    fontSize: style.fontSize,
    marginV: style.marginV,
    marginL: style.marginL,
    marginR: style.marginR,
    playResX: env.CROP_WIDTH,
    playResY: env.CROP_HEIGHT,
  });
  await fs.writeFile(assPath, assContent, "utf8");

  // fontsdir required for ffmpeg-static; style/margins live in ASS PlayRes
  const fontsDir = escapeFilterPath(env.SUBTITLE_FONTS_DIR);
  const vf =
    `subtitles='${escapeFilterPath(assName)}'` +
    `:fontsdir='${fontsDir}'`;

  await execFileAsync(
    env.FFMPEG_PATH,
    [
      "-nostdin",
      "-y",
      "-i",
      inputAbs,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "copy",
      outputAbs,
    ],
    { cwd: srtDir },
  );

  return outputPath;
}
