import "./config/env";

import express from "express";
import type { Request, Response } from "express";

import { createBucketsIfNotExist } from "./services/minio.service";
import healthRoutes from "./routes/health.routs";
import uploadRoutes from "./routes/upload.routes";

const app = express();

const PORT = process.env.PORT || 3000;

console.log(process.env.MINIO_ENDPOINT);

app.use(express.json());
app.use("/api", healthRoutes);
app.use("/api/upload", uploadRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

async function start() {
  await createBucketsIfNotExist();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();