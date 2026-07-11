import { flowProducer } from "../queues/flow";

export async function createVideoFlow(objectName: string, jobId: string) {
  return flowProducer.add({
    name: "render-job",
    queueName: "render",
    data: { jobId, objectName },
    children: [
      // ---------------------------------------------------
      // TRACK 1: Video Processing (Leaf - Starts Immediately)
      // ---------------------------------------------------
      {
        name: "crop-job",
        queueName: "crop",
        data: { jobId, objectName },
      },

      // ---------------------------------------------------
      // TRACK 2: Audio & B-Roll Pipeline
      // ---------------------------------------------------
      {
        name: "fetch-broll-job",
        queueName: "broll",
        data: { jobId, objectName },
        children: [
          {
            name: "extract-keywords-job",
            queueName: "keyword-extraction",
            data: { jobId, objectName },
            children: [
              // Leaf - Starts Immediately in parallel with Crop
              {
                name: "transcription-job",
                queueName: "transcription",
                data: { jobId, objectName },
              },
            ],
          },
        ],
      },
    ],
  });
}
