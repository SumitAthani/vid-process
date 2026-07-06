import { flowProducer } from "../queues/flow";

export async function createVideoFlow(objectName: string, jobId: string) {
  return flowProducer.add({
    name: "render-job",
    queueName: "render",
    data: { jobId, objectName },

    children: [
      {
        name: "summary-job",
        queueName: "summary",
        data: { jobId, objectName },

        children: [
          {
            name: "transcription-job",
            queueName: "transcription",
            data: {
              jobId,
              objectName,
            },
          },
        ],
      },

      {
        name: "broll-job",
        queueName: "broll",
        data: { jobId, objectName },

        children: [
          {
            name: "transcription-job",
            queueName: "transcription",
            data: {
              jobId,
              objectName,
            },
          },
        ],
      },
    ],
  });
}
