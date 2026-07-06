import { Router } from "express";
import {
  createAndEnqueueJob,
  EnqueueError,
  getJob,
} from "../services/job.service";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { objectName } = req.body;
    if (!objectName) {
      return res.status(400).json({
        message: "Object name is required",
      });
    }

    const job = await createAndEnqueueJob(objectName);

    req.log.info({ jobId: job.id, objectName }, "Job created and enqueued");

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
    const jobData = await getJob(jobId);
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
