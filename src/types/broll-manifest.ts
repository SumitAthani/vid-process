import { z } from "zod";
import { env } from "../config/env";

const HotKeySegmentSchema = z
  .object({
    hotKey: z.string().min(1),
    searchQuery: z
      .string()
      .min(3)
      .refine(
        (q) => q.trim().split(/\s+/).length >= 2,
        "searchQuery must be ≥2 words",
      ),
    startTime: z.number().nonnegative(),
    endTime: z.number().positive(),
    minDuration: z
      .number()
      .min(env.BROLL_MIN_ON_SCREEN_SEC)
      .max(env.BROLL_MAX_ON_SCREEN_SEC),
    layout: z.enum(["top-half-overlay", "half-and-half"]),
  })
  .refine((s) => s.endTime > s.startTime)
  .refine((s) => s.endTime - s.startTime >= env.BROLL_MIN_ON_SCREEN_SEC, {
    message: `on-screen duration must be ≥ ${env.BROLL_MIN_ON_SCREEN_SEC}s`,
  })
  .refine((s) => s.minDuration <= s.endTime - s.startTime, {
    message: "minDuration must not exceed on-screen window",
  });

export const BrollManifestSchema = z.object({
  version: z.literal(1),
  jobId: z.uuid(),
  segments: z.array(HotKeySegmentSchema),
});
