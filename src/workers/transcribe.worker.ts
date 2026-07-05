import { Worker } from "bullmq";
import { connection } from "../queues/connection";

new Worker(
  "transcription",
  async (job) => {
    console.log("Transcribing:", job.data.videoUrl);

    // fake processing
    await new Promise((r) => setTimeout(r, 3000));

    return {
      transcript: "This is transcript text",
    };
  },
  { connection }
);