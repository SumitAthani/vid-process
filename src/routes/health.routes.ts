import { Router, Request, Response } from "express";
import { connection } from "../queues/connection";
import { minioClient } from "../services/minio.service";
import { prisma } from "../db/client";

const router = Router();

router.get("/health", async (req: Request, res: Response) => {
  const healthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      redis: "down",
      minio: "down",
      postgres: "down",
    },
    message: "All systems operational",
  };

  try {
    await prisma.job.findFirst();
    healthStatus.services.postgres = "up";
  } catch (error) {
    healthStatus.services.postgres = "down";
  }

  try {
    // Run checks concurrently.
    // allSettled waits for all promises to finish regardless of success or failure.
    const [redisResult, minioResult] = await Promise.allSettled([
      connection.ping(),
      minioClient.listBuckets(),
    ]);

    // 1. Evaluate Redis
    if (redisResult.status === "fulfilled" && redisResult.value === "PONG") {
      healthStatus.services.redis = "up";
    } else if (redisResult.status === "rejected") {
      req.log.warn({ err: redisResult.reason }, "Redis health check failed");
    }

    // 2. Evaluate MinIO
    if (minioResult.status === "fulfilled") {
      healthStatus.services.minio = "up";
    } else if (minioResult.status === "rejected") {
      req.log.warn({ err: minioResult.reason }, "MinIO health check failed");
    }

    // Determine if everything is healthy
    const isHealthy =
      healthStatus.services.redis === "up" &&
      healthStatus.services.minio === "up" &&
      healthStatus.services.postgres === "up";

    if (isHealthy) {
      res.status(200).json(healthStatus);
    } else {
      healthStatus.status = "error";
      healthStatus.message = "One or more dependent services are down";
      // Return 503 Service Unavailable so load balancers know to route traffic elsewhere
      res.status(503).json(healthStatus);
    }
  } catch (error) {
    // This catch block will now only trigger for catastrophic, unexpected errors
    // (e.g., memory issues or synchronous code failures) rather than network rejections.
    req.log.error(error, "Catastrophic health check failure");

    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      services: { redis: "unknown", minio: "unknown" },
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

export default router;
