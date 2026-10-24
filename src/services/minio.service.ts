import { Client } from "minio";
import { logger } from "../utils/logger";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { env } from "../config/env";

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const publicMinioClient = env.MINIO_PUBLIC_ENDPOINT
  ? new Client({
      endPoint: env.MINIO_PUBLIC_ENDPOINT,
      port: env.MINIO_PUBLIC_PORT ?? env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    })
  : minioClient;

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

export async function getDataStream(bucketName: string, objectName: string) {
  return await minioClient.getObject(bucketName, objectName);
}

export async function downloadVideo(
  objectName: string,
  workDir: string,
): Promise<string> {
  const ext = path.extname(objectName) || ".mp4";
  const localPath = path.join(workDir, `input${ext}`);
  const stream = await minioClient.getObject(BUCKETS.RAW_VIDEOS, objectName);
  await pipeline(stream, fs.createWriteStream(localPath));
  return localPath;
}

export async function uploadLocalFile(
  bucket: string,
  objectKey: string,
  localPath: string,
  contentType: string,
): Promise<void> {
  await minioClient.fPutObject(bucket, objectKey, localPath, {
    "Content-Type": contentType,
  });
}
