import { z } from "zod";

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
    minDuration: z.number().min(2.5).max(4),
    layout: z.literal("top-half-overlay"),
  })
  .refine((s) => s.endTime > s.startTime);

export const BrollManifestSchema = z.object({
  version: z.literal(1),
  jobId: z.uuid(),
  segments: z.array(HotKeySegmentSchema),
});
