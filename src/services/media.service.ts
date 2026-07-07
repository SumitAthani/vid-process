import { execFile } from "child_process";
import { promisify } from "util";
import { VideoMetadata } from "../types/media";
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
