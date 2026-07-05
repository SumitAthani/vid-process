import { flowProducer } from "../queues/flow";

export async function createVideoFlow(videoUrl: string) {
  return flowProducer.add({
    name: "render-job",
    queueName: "render",
    data: {},

    children: [
      {
        name: "summary-job",
        queueName: "summary",
        data: {},

        children: [
          {
            name: "transcription-job",
            queueName: "transcription",
            data: {
              videoUrl,
            },
          },
        ],
      },

      {
        name: "broll-job",
        queueName: "broll",
        data: {},

        children: [
          {
            name: "transcription-job",
            queueName: "transcription",
            data: {
              videoUrl,
            },
          },
        ],
      },
    ],
  });
}