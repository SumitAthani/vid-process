import "../config/env";

import IORedis from "ioredis";

export const connection = new IORedis({
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT!),
  maxRetriesPerRequest: null,
});
