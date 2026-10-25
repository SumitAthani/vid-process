import { Router } from "express";
import { publicMinioClient, BUCKETS } from "../services/minio.service";
import { env } from "../config/env";
import crypto from "crypto";

const router = Router();

router.post("/presigned-upload", async (req, res) => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({
        message: "fileName and contentType required",
      });
    }

    const uniqueId = crypto.randomUUID();

    const objectName = `videos/${uniqueId}-${fileName}`;

    // expiry in seconds
    const expiry = 60 * 10;

    const presignedUrl = await publicMinioClient.presignedPutObject(
      BUCKETS.RAW_VIDEOS,
      objectName,
      expiry
    );

    req.log.info({ fileName, objectName }, "Presigned upload URL generated");

    const host = env.MINIO_PUBLIC_ENDPOINT ?? env.MINIO_ENDPOINT;
    const useSsl = env.MINIO_PUBLIC_USE_SSL ?? env.MINIO_USE_SSL;
    const defaultPort = useSsl ? 443 : 9000;
    const port =
      env.MINIO_PUBLIC_PORT ??
      (env.MINIO_PUBLIC_ENDPOINT ? defaultPort : env.MINIO_PORT);
    const proto = useSsl ? "https" : "http";
    const portStr = port === 80 || port === 443 ? "" : `:${port}`;

    return res.json({
      uploadUrl: presignedUrl,
      objectName,
      publicUrl: `${proto}://${host}${portStr}/${BUCKETS.RAW_VIDEOS}/${objectName}`,
    });
  } catch (err) {
    req.log.error(err, "Failed to generate presigned URL");

    return res.status(500).json({
      message: "Failed to generate presigned URL",
    });
  }
});

export default router;
