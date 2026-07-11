import fs from "fs/promises";
import os from "os";
import path from "path";
import { IngestionResult } from "../types/media";
import { BUCKETS, downloadVideo, uploadLocalFile } from "./minio.service";
import { extractAudio, probeVideo } from "./media.service";

export async function createJobWorkDir(jobId: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "vid-process", jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupWorkDir(workDir: string): Promise<void> {
  await fs.rm(workDir, { recursive: true, force: true });
}

export async function ingestMedia(
  jobId: string,
  objectName: string,
  workDir: string,
): Promise<IngestionResult> {
  const localVideoPath = await downloadVideo(objectName, workDir);
  const metadata = await probeVideo(localVideoPath);

  if (!metadata.audioCodec) {
    throw new Error("Video has no audio track");
  }

  const localAudioPath = await extractAudio(localVideoPath, workDir);

  const audioObjectKey = `${jobId}/audio.wav`;
  const metadataObjectKey = `${jobId}/metadata.json`;
  const localMetaPath = path.join(workDir, "metadata.json");

  await fs.writeFile(localMetaPath, JSON.stringify(metadata, null, 2));

  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    audioObjectKey,
    localAudioPath,
    "audio/wav",
  );
  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    metadataObjectKey,
    localMetaPath,
    "application/json",
  );

  return {
    audioObjectKey,
    metadataObjectKey,
    metadata,
    localAudioPath,
  };
}
