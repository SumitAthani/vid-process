import { z } from "zod";
import dotenv from "dotenv";

// Load .env file if present
dotenv.config();

// 1. Define the schema for your environment variables
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3000), // Coerces the string to a number directly

    // Redis
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535),

    // Database
    DATABASE_URL: z.url(),

    // MinIO
    MINIO_ENDPOINT: z.string(),
    MINIO_PORT: z.coerce.number(),
    MINIO_ACCESS_KEY: z.string().min(1, "Access key is required"),
    MINIO_SECRET_KEY: z.string().min(1, "Secret key is required"),
    // Keep your custom transform here; z.coerce.boolean() is unsafe for "false"
    MINIO_USE_SSL: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .default(false),

    OPEN_AI_API_KEY: z.string(),
    MIN_REQUIRED_HOTKEYS: z.coerce.number(),
    MAX_ALLOWED_HOTKEYS: z.coerce.number(),
    PEXELS_API_KEY: z.string().min(1),
  })
  .refine((data) => data.MIN_REQUIRED_HOTKEYS <= data.MAX_ALLOWED_HOTKEYS, {
    message:
      "MIN_REQUIRED_HOTKEYS must be less than or equal to MAX_ALLOWED_HOTKEYS",
    path: ["MIN_REQUIRED_HOTKEYS"], // or ["MAX_ALLOWED_HOTKEYS"]
  });

// 2. Parse and validate
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:\n", parsedEnv);

  process.exit(1);
}

// 3. Export the strictly-typed, immutable env object
export const env = Object.freeze(parsedEnv.data);
