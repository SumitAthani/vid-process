import { BUCKETS, minioClient } from "./minio.service";
import { updateJobKeys } from "./job.service";
import { BrollManifestSchema } from "../types/broll-manifest";
import {
  buildTranscriptWindows,
  maxAllowedHotKeys,
  minRequiredHotKeys,
} from "../utils/keyword";
import { streamToString } from "../utils/files";
import openaiClient from "../utils/openAiClient";
import { KEYWORD_SYSTEM_PROMPT } from "../utils/keywords-generation.instructions";
import { enforceMinOnScreenDuration } from "../utils/broll-timing";

export async function generateManifestFromTranscript(
  jobId: string,
  durationSeconds: number,
) {
  const transcriptFilePath = `${jobId}/transcript.json`;
  const transcriptStream = await minioClient.getObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    transcriptFilePath,
  );

  const transcript = JSON.parse(await streamToString(transcriptStream));
  const windows = buildTranscriptWindows(transcript.segments ?? []);

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      { role: "system", content: KEYWORD_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          durationSeconds,
          minRequired: minRequiredHotKeys(durationSeconds),
          maxAllowed: maxAllowedHotKeys(durationSeconds),
          windows,
        }),
      },
    ],
  });

  // manifest parsing here
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");

  const llmJson = typeof content === "string" ? JSON.parse(content) : content;
  if (!Array.isArray(llmJson?.segments)) {
    throw new Error("LLM response missing s`egments array");
  }

  const normalizedSegments = enforceMinOnScreenDuration(
    llmJson.segments,
    durationSeconds,
  );

  const manifestData = {
    version: 1 as const,
    jobId,
    segments: normalizedSegments,
  };

  const parsedManifest = BrollManifestSchema.safeParse(manifestData);

  if (!parsedManifest.success) {
    throw parsedManifest.error;
  }

  const min = minRequiredHotKeys(durationSeconds);
  if (parsedManifest.data.segments.length < min) {
    throw new Error(
      `Insufficient hot keys: got ${parsedManifest.data.segments.length}, need ≥ ${min} for ${durationSeconds}s video`,
    );
  }

  const json = JSON.stringify(parsedManifest.data, null, 2);
  const buffer = Buffer.from(json);

  const brollManifestKey = `${jobId}/broll-manifest.json`;

  await minioClient.putObject(
    BUCKETS.INTERMEDIATE_ASSETS,
    brollManifestKey,
    buffer,
    buffer.length,
    {
      "Content-Type": "application/json",
    },
  );

  await updateJobKeys(jobId, {
    brollManifestKey,
  });

  return { brollManifestKey };
}
