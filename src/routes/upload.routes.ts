import { Router } from "express";
import { minioClient, BUCKETS } from "../services/minio.service";
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

    const presignedUrl = await minioClient.presignedPutObject(
      BUCKETS.RAW_VIDEOS,
      objectName,
      expiry
    );

    req.log.info({ fileName, objectName }, "Presigned upload URL generated");

    return res.json({
      uploadUrl: presignedUrl,
      objectName,
      publicUrl: `http://localhost:9000/${BUCKETS.INTERMEDIATE_ASSETS}/${objectName}`,
    });
  } catch (err) {
    req.log.error(err, "Failed to generate presigned URL");

    return res.status(500).json({
      message: "Failed to generate presigned URL",
    });
  }
});

export default router;
