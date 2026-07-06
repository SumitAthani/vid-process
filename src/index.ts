import "./config/env";

import crypto from "crypto";
import express from "express";
import type { Request, Response } from "express";
import pinoHttp from "pino-http";

import { errorHandler } from "./middleware/error.middleware";
import { logger } from "./utils/logger";
import { createBucketsIfNotExist } from "./services/minio.service";
import healthRoutes from "./routes/health.routs";
import uploadRoutes from "./routes/upload.routes";
import bullBoardRoutes from "./routes/bull-board.routes";
import jobRouters from "./routes/jobs.routes";

const app = express();
const apiRouter = express.Router();
const PORT = process.env.PORT || 3000;

process.on("uncaughtException", (err) => {
  logger.fatal(err, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal(reason, "Unhandled Rejection");
  process.exit(1);
});

app.use(
  pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
    autoLogging: {
      ignore: (req) => req.url?.startsWith("/bull/admin/queues") ?? false,
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

app.use(express.json());

app.use("/api", apiRouter);

apiRouter.use(healthRoutes);

app.use("/bull", bullBoardRoutes);
apiRouter.use("/upload", uploadRoutes);
apiRouter.use("/jobs", jobRouters);

apiRouter.get("/", (req: Request, res: Response) => {
  req.log.info("Root endpoint called");
  res.send("Hello World");
});

app.use(errorHandler);

async function start() {
  try {
    await createBucketsIfNotExist();

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(err, "Startup failed");
    process.exit(1);
  }
}

start();
