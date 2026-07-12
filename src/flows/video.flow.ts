import { flowProducer } from "../queues/flow";
import { CropJobOptions } from "../types/crop";

export async function createVideoFlow(
  objectName: string,
  jobId: string,
  cropOptions: CropJobOptions,
) {
  const cropJobData = {
    jobId,
    objectName,
    cropStrategy: cropOptions.cropStrategy,
    padBackground: cropOptions.padBackground,
  };

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
        data: cropJobData,
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
