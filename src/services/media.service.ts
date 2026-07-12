import { execFile } from "child_process";
import { promisify } from "util";
import { VideoMetadata } from "../types/media";
import { ClipFitPlan } from "../utils/broll-fit";
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
