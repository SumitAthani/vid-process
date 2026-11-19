import { z } from "zod";
import { env } from "../config/env";

export const GraphicCardLayoutSchema = z.enum([
  "center-card",
  "top-half-banner",
  "lower-third-callout",
]);

export const GraphicCardAnimationSchema = z.enum([
  "spring-pop",
  "slide-up-blur",
  "counter-spin",
]);

export const GraphicCardThemeSchema = z.object({
  background: z.string().default("#0F172A"),
  textColor: z.string().default("#F8FAFC"),
  accentColor: z.string().default("#38BDF8"),
});

export const GraphicCardContentSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  metricValue: z.string().optional(),
  iconName: z.string().optional(),
  badgeText: z.string().optional(),
});

export const GraphicCardSpecSchema = z.object({
  layout: GraphicCardLayoutSchema.default("center-card"),
  animation: GraphicCardAnimationSchema.default("spring-pop"),
  theme: GraphicCardThemeSchema.default({
    background: "#0F172A",
    textColor: "#F8FAFC",
    accentColor: "#38BDF8",
  }),
  content: GraphicCardContentSchema,
});

export type GraphicCardSpec = z.infer<typeof GraphicCardSpecSchema>;

const HotKeySegmentSchema = z
  .object({
    hotKey: z.string().min(1),
    kind: z.enum(["stock-video", "graphic-card"]).default("stock-video"),
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
    graphicCard: GraphicCardSpecSchema.optional(),
  })
  .refine((s) => s.endTime > s.startTime)
  .refine(
    (s) =>
      Math.round((s.endTime - s.startTime) * 1000) / 1000 >=
      env.BROLL_MIN_ON_SCREEN_SEC - 0.001,
    {
      message: `on-screen duration must be ≥ ${env.BROLL_MIN_ON_SCREEN_SEC}s`,
    },
  )
  .refine(
    (s) =>
      s.minDuration <=
      Math.round((s.endTime - s.startTime) * 1000) / 1000 + 0.001,
    {
      message: "minDuration must not exceed on-screen window",
    },
  );

export const BrollManifestSchema = z.object({
  version: z.literal(1),
  jobId: z.uuid(),
  segments: z.array(HotKeySegmentSchema),
});
