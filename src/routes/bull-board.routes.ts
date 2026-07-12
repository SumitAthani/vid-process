import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Router } from "express";

import {
  transcriptionQueue,
  cropQueue,
  brollQueue,
  renderQueue,
  keywordExtractionQueue,
} from "../queues/queues";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/bull/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(transcriptionQueue),
    new BullMQAdapter(cropQueue),
    new BullMQAdapter(brollQueue),
    new BullMQAdapter(renderQueue),
    new BullMQAdapter(keywordExtractionQueue),
  ],
  serverAdapter,
});

const router = Router();
router.use("/admin/queues", serverAdapter.getRouter());

export default router;
