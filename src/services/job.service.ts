import { prisma } from "../db/client";
import { createVideoFlow } from "../flows/video.flow";
import { JobStatus } from "../generated/prisma/enums";

export class EnqueueError extends Error {
  constructor(
    public jobId: string,
    cause?: unknown,
  ) {
    super("Failed to enqueue job");
    this.cause = cause;
  }
}

export async function createJob(objectName: string) {
  const job = await prisma.job.create({
    data: {
      objectName,
    },
  });

  return job;
}

export async function getJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
  });
}

type UpdateJobData = Partial<{
  status: JobStatus;
  transcriptJsonKey: string;
  transcriptTextKey: string;
  subtitlesSrtKey: string;
  subtitlesVttKey: string;
}>;

export async function updateJobKeys(id: string, data: UpdateJobData) {
  return await prisma.job.update({
    where: {
      id,
    },
    data: {
      ...data,
    },
  });
}

export async function updateJobStatus(id: string, status: JobStatus) {
  return await prisma.job.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });
}

export async function createAndEnqueueJob(objectName: string) {
  const job = await createJob(objectName);

  try {
    await createVideoFlow(objectName, job.id);
    return job;
  } catch (err) {
    await updateJobStatus(job.id, "failed");
    throw new EnqueueError(job.id, err);
  }
}
