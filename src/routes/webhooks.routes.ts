import { Router } from "express";

const router = Router();

router.post("/webhook", (req, res) => {
  req.log.info({ body: req.body }, "Webhook received");
  res.status(200).json({ message: "Webhook received" });
});

export default router;
