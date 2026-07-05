import { Router } from "express";
const router = Router();

router.post("/webhook", (req, res) => {
  console.log(req.body);
  res.status(200).json({ message: "Webhook received" });
});

export default router;

