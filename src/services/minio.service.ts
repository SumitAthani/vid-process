import "../config/env";
import { Client } from "minio";
import { logger } from "../logger";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

// Exporting these as constants makes it easy to import them
// into other files without risking typos in the string names.
export const BUCKETS = {
  RAW_VIDEOS: "raw-videos",
  INTERMEDIATE_ASSETS: "intermediate-assets",
  FINAL_VIDEOS: "final-videos",
} as const;

export async function createBucketsIfNotExist() {
  const bucketsToCreate = Object.values(BUCKETS);

  for (const bucket of bucketsToCreate) {
    try {
      const exists = await minioClient.bucketExists(bucket);

      if (!exists) {
        await minioClient.makeBucket(bucket, "us-east-1");
        logger.info({ bucket }, "Bucket created");
      } else {
        logger.info({ bucket }, "Bucket already exists");
      }
    } catch (error) {
      logger.error({ bucket, err: error }, "Failed to check or create bucket");
      throw error;
    }
  }
}
