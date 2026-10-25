import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import openaiClient from "../utils/openAiClient";
import { toFile } from "openai";
import { BUCKETS, uploadLocalFile } from "./minio.service";
import { updateJobKeys } from "./job.service";

export type TranscriptResult = {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  language?: string;
  duration?: number;
};

export async function transcribeAudioFile(
  localAudioPath: string,
): Promise<TranscriptResult> {
  const audioFile = await toFile(
    fs.createReadStream(localAudioPath),
    "audio.mp3",
    { type: "audio/mpeg" },
  );

  const result = await openaiClient.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  return {
    text: result.text,
    segments: result.segments ?? [],
    language: result.language,
    duration: result.duration,
  };
}

export async function saveTranscriptArtifacts(
  jobId: string,
  workDir: string,
  transcript: TranscriptResult,
): Promise<{ transcriptJsonKey: string; transcriptTextKey: string }> {
  const transcriptJsonKey = `${jobId}/transcript.json`;
  const transcriptTextKey = `${jobId}/transcript.txt`;

  const jsonPath = path.join(workDir, "transcript.json");
  const txtPath = path.join(workDir, "transcript.txt");

  await fsPromises.writeFile(jsonPath, JSON.stringify(transcript, null, 2));
  await fsPromises.writeFile(txtPath, transcript.text);

  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    transcriptJsonKey,
    jsonPath,
    "application/json",
  );
  await uploadLocalFile(
    BUCKETS.INTERMEDIATE_ASSETS,
    transcriptTextKey,
    txtPath,
    "text/plain",
  );
  await updateJobKeys(jobId, {
    transcriptJsonKey,
    transcriptTextKey,
  });
  return { transcriptJsonKey, transcriptTextKey };
}
