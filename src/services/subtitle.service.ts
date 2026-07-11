import path from "path";
import {
  SHORT_FORM_DEFAULTS,
  SubtitleCue,
  mergeShortCues,
  serializeSrt,
  serializeVtt,
  splitTextIntoLines,
} from "../utils/subtitle-formatter";
import { updateJobKeys } from "./job.service";
import { uploadLocalFile, BUCKETS } from "./minio.service";
import fsPromises from "fs/promises";

export async function saveSubtitleArtifacts(
  jobId: string,
  workDir: string,
  subtitleCues: SubtitleCue[],
) {
  const subtitlesSrtKey = `${jobId}/subtitles.srt`;
  const subtitlesVttKey = `${jobId}/subtitles.vtt`;

  let srtSubTitles = serializeSrt(subtitleCues);
  let vttSubTitles = serializeVtt(subtitleCues);

  const srtPath = path.join(workDir, "subtitles.srt");
  const vttPath = path.join(workDir, "subtitles.vtt");

  await fsPromises.writeFile(srtPath, srtSubTitles);
  await fsPromises.writeFile(vttPath, vttSubTitles);

  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    subtitlesSrtKey,
    srtPath,
    "application/x-subrip",
  );

  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    subtitlesVttKey,
    vttPath,
    "text/vtt",
  );

  await updateJobKeys(jobId, {
    subtitlesSrtKey,
    subtitlesVttKey,
  });
  return { subtitlesSrtKey, subtitlesVttKey };
}

export function buildSubtitleCues(
  segments: Array<{ start: number; end: number; text: string }>,
  options?: Partial<typeof SHORT_FORM_DEFAULTS>,
): SubtitleCue[] {
  const opts = { ...SHORT_FORM_DEFAULTS, ...options };

  const countWords = (text: string) =>
    text.trim().split(/\s+/).filter(Boolean).length;

  const cues: SubtitleCue[] = [];

  for (const segment of segments) {
    let remainingText = segment.text.trim();
    const totalWords = countWords(remainingText);

    if (totalWords === 0) continue;

    const secondsPerWord = (segment.end - segment.start) / totalWords;
    let cursor = segment.start;

    while (remainingText) {
      const { lines, remainder } = splitTextIntoLines(
        remainingText,
        opts.maxCharsPerLine,
        opts.maxLines,
      );

      if (lines.length === 0) break;

      const wordsInCue = countWords(lines.join(" "));
      const cueDuration = wordsInCue * secondsPerWord;

      cues.push({
        lines,
        start: cursor,
        end: cursor + cueDuration,
      });

      cursor += cueDuration;
      remainingText = remainder;
    }
  }

  return mergeShortCues(
    cues,
    opts.maxCharsPerLine,
    opts.maxLines,
    opts.minCueDurationSec,
  );
}
