import { Router } from "express";
import { z } from "zod";
import {
  createAndEnqueueJob,
  EnqueueError,
  getJobDetails,
} from "../services/job.service";
import { CROP_STRATEGIES, PAD_BACKGROUNDS } from "../types/crop";
import { LAYOUT_MODES } from "../types/layout";

const createJobBodySchema = z.object({
  objectName: z.string().min(1),
  cropStrategy: z.enum(CROP_STRATEGIES).optional(),
  padBackground: z.enum(PAD_BACKGROUNDS).optional(),
  subtitleFontSize: z.coerce.number().int().min(24).max(96).optional(),
  subtitleMarginV: z.coerce.number().int().min(0).max(800).optional(),
  subtitleMarginL: z.coerce.number().int().min(0).max(400).optional(),
  subtitleMarginR: z.coerce.number().int().min(0).max(400).optional(),
  subtitleFontName: z.string().min(1).max(64).optional(),
  webhookUrl: z.url().optional(),
  layout: z.enum(LAYOUT_MODES).optional(),
});

const router = Router();

router.post("/", async (req, res) => {
  try {
    const parsed = createJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
    }

    const {
      objectName,
      cropStrategy,
      padBackground,
      subtitleFontSize,
      subtitleMarginV,
      subtitleMarginL,
      subtitleMarginR,
      subtitleFontName,
      webhookUrl,
      layout,
    } = parsed.data;

    const job = await createAndEnqueueJob(objectName, {
      cropStrategy,
      padBackground,
      subtitleFontSize,
      subtitleMarginV,
      subtitleMarginL,
      subtitleMarginR,
      subtitleFontName,
      webhookUrl,
      layout,
    });

    req.log.info(
      {
        jobId: job.id,
        objectName,
        cropStrategy: job.cropStrategy,
        padBackground: job.padBackground,
        subtitleFontSize: job.subtitleFontSize,
        subtitleMarginV: job.subtitleMarginV,
        subtitleFontName: job.subtitleFontName,
        webhookUrl: job.webhookUrl,
        brollLayout: job.brollLayout,
      },
      "Job created and enqueued",
    );

    return res.status(201).json({
      jobData: job,
      objectName,
      message: "Job created successfully",
    });
  } catch (err) {
    req.log.error(err, "Failed to create Job");
    if (err instanceof EnqueueError) {
      return res.status(503).json({
        message: "Job saved but could not be queued",
        jobId: err.jobId,
        status: "failed",
      });
    }

    return res.status(500).json({
      message: "Failed to create Job",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const jobId = req.params.id;
    const jobData = await getJobDetails(jobId);
    if (!jobData) {
      return res.status(404).json({
        message: `Job with id ${jobId} not found`,
      });
    }
    return res.status(200).json(jobData);
  } catch (err) {
    req.log.error(err, "Failed to get Job Data");

    return res.status(500).json({
      message: "Failed to get Job Data",
    });
  }
});

export default router;
