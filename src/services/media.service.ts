import { execFile } from "child_process";
import { promisify } from "util";
import { VideoMetadata } from "../types/media";
import { ClipFitPlan } from "../utils/broll-fit";
import { CropStrategy, PadBackground } from "../types/crop";
import { ComposeWithLayoutsOpts } from "../types/layout";
import { buildLayoutFilterGraph } from "../utils/layout-graph";
import path from "path";

const execFileAsync = promisify(execFile);

export async function probeVideo(
  localVideoPath: string,
): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
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

  await execFileAsync("ffmpeg", [
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
    await execFileAsync("ffmpeg", [
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
    await execFileAsync("ffmpeg", [
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

  await execFileAsync("ffmpeg", [
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
      await execFileAsync("ffmpeg", [
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
    await execFileAsync("ffmpeg", [
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
  await execFileAsync("ffmpeg", [
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
 * Composite timed B-roll layouts onto a full-timeline primary (9:16).
 * Keeps primary audio when present; B-roll audio is ignored.
 */
export async function composeWithLayouts(
  opts: ComposeWithLayoutsOpts,
): Promise<string> {
  const { primaryPath, outputPath, width, height, segments, transitionMs } =
    opts;

  const transitionSec = transitionMs / 1000;

  if (segments.length === 0) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      primaryPath,
      ...ENCODE_ARGS,
      outputPath,
    ]);
    return outputPath;
  }

  const graphSegments = segments.map((seg, i) => ({
    inputIndex: i + 1,
    startTime: seg.startTime,
    endTime: seg.endTime,
    layout: seg.layout,
  }));

  const { filterComplex, outputLabel } = buildLayoutFilterGraph({
    width,
    height,
    segments: graphSegments,
    transitionSec,
  });

  const args: string[] = ["-y", "-i", primaryPath];
  for (const seg of segments) {
    args.push("-i", seg.clipPath);
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

  await execFileAsync("ffmpeg", args);
  return outputPath;
}
