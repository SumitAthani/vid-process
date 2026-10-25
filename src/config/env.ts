import { z } from "zod";
import dotenv from "dotenv";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

// Load .env file if present
dotenv.config();

const defaultFfmpegPath = ffmpegStatic ?? "ffmpeg";
const defaultFfprobePath = ffprobeStatic.path ?? "ffprobe";

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
    MINIO_PUBLIC_ENDPOINT: z.string().optional(),
    MINIO_PUBLIC_PORT: z.coerce.number().optional(),
    MINIO_PUBLIC_USE_SSL: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
    // Keep your custom transform here; z.coerce.boolean() is unsafe for "false"
    MINIO_USE_SSL: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .default(false),

    OPEN_AI_API_KEY: z.string(),
    MIN_REQUIRED_HOTKEYS: z.coerce.number(),
    MAX_ALLOWED_HOTKEYS: z.coerce.number(),
    PEXELS_API_KEY: z.string().min(1),
    PEXELS_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
    BROLL_MIN_ON_SCREEN_SEC: z.coerce.number().default(2.5),
    BROLL_MAX_ON_SCREEN_SEC: z.coerce.number().default(4),

    // Primary video crop (9:16)
    CROP_WIDTH: z.coerce.number().int().positive().default(1080),
    CROP_HEIGHT: z.coerce.number().int().positive().default(1920),
    CROP_STRATEGY: z.enum(["center", "pad"]).default("center"),
    CROP_PAD_BACKGROUND: z.enum(["black", "white", "blur"]).default("blur"),

    // Layout engine: fade duration when entering/leaving B-roll layouts
    LAYOUT_TRANSITION_MS: z.coerce.number().int().nonnegative().default(250),

    // Subtitle burn-in defaults (Instagram-safe 9:16)
    SUBTITLE_FONT_SIZE: z.coerce.number().int().min(24).max(96).default(48),
    SUBTITLE_MARGIN_V: z.coerce.number().int().min(0).max(800).default(360),
    SUBTITLE_MARGIN_L: z.coerce.number().int().min(0).max(400).default(80),
    SUBTITLE_MARGIN_R: z.coerce.number().int().min(0).max(400).default(140),
    SUBTITLE_FONT_NAME: z.string().min(1).max(64).default("Arial"),
    // Directory containing font files for libass (ffmpeg-static needs this)
    SUBTITLE_FONTS_DIR: z
      .string()
      .min(1)
      .default("/System/Library/Fonts/Supplemental"),

    // Outbound job completion webhook (empty = no global default)
    JOB_WEBHOOK_URL: z.union([z.literal(""), z.url()]).default(""),
    JOB_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    // Media binaries — default to vendored libass-enabled static builds
    FFMPEG_PATH: z.string().min(1).default(defaultFfmpegPath),
    FFPROBE_PATH: z.string().min(1).default(defaultFfprobePath),
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
