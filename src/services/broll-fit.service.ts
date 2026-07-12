import path from "path";
import { planClipFit } from "../utils/broll-fit";
import {
  cleanupWorkDir,
  createJobWorkDir,
} from "./media-ingestion.service";
import { fitClipToDuration, probeVideo } from "./media.service";
import { BUCKETS, minioClient, uploadLocalFile } from "./minio.service";

export async function fitDownloadedClipToWindow(opts: {
  jobId: string;
  index: number;
  rawObjectKey: string;
  videoId: number;
  windowStart: number;
  windowEnd: number;
}): Promise<{
  objectKey: string;
  sourceDuration: number;
  fittedDuration: number;
  fitStrategy: "none" | "trim" | "loop";
}> {
  const windowDuration = opts.windowEnd - opts.windowStart;
  const workDir = await createJobWorkDir(`${opts.jobId}-broll-${opts.index}`);

  try {
    const rawLocal = path.join(workDir, "raw.mp4");
    await minioClient.fGetObject(
      BUCKETS.INTERMEDIATE_ASSETS,
      opts.rawObjectKey,
      rawLocal,
    );

    const meta = await probeVideo(rawLocal);
    const plan = planClipFit(meta.durationSeconds, windowDuration);

    const fittedLocal = path.join(workDir, "fitted.mp4");
    await fitClipToDuration(rawLocal, fittedLocal, plan);

    const fittedKey = `${opts.jobId}/broll/${opts.index}-${opts.videoId}-fitted.mp4`;
    await uploadLocalFile(
      BUCKETS.INTERMEDIATE_ASSETS,
      fittedKey,
      fittedLocal,
      "video/mp4",
    );

    return {
      objectKey: fittedKey,
      sourceDuration: meta.durationSeconds,
      fittedDuration: plan.targetDuration,
      fitStrategy: plan.strategy,
    };
  } finally {
    await cleanupWorkDir(workDir);
  }
}
