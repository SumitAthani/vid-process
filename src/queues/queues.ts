import { Queue } from "bullmq";
import { connection } from "./connection";

export const transcriptionQueue = new Queue("transcription", {
  connection,
});

export const keywordExtractionQueue = new Queue("keyword-extraction", {
  connection,
});

export const cropQueue = new Queue("crop", {
  connection,
});

export const brollQueue = new Queue("broll", {
  connection,
});

export const renderQueue = new Queue("render", {
  connection,
});
