import { Queue } from "bullmq";
import { connection } from "./connection";

export const transcriptionQueue = new Queue("transcription", {
  connection,
});

export const summaryQueue = new Queue("summary", {
  connection,
});

export const brollQueue = new Queue("broll", {
  connection,
});

export const renderQueue = new Queue("render", {
  connection,
});