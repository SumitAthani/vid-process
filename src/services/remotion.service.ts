import path from "path";
import fs from "fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { logger } from "../utils/logger";
import {
  GraphicCardAnimation,
  GraphicCardContent,
  GraphicCardLayout,
  GraphicCardOverlayProps,
  GraphicCardTheme,
} from "../remotion/types";

let cachedBundleLocation: string | null = null;
let bundlingPromise: Promise<string> | null = null;

/**
 * Returns the path to the bundled Remotion project.
 * Uses lazy caching so webpack only bundles once per Node process runtime.
 */
export async function getRemotionBundle(): Promise<string> {
  if (cachedBundleLocation) {
    // Verify directory still exists in /tmp
    const exists = await fs
      .stat(cachedBundleLocation)
      .then(() => true)
      .catch(() => false);
    if (exists) return cachedBundleLocation;
  }

  if (bundlingPromise) {
    return bundlingPromise;
  }

  bundlingPromise = (async () => {
    logger.info("Bundling Remotion motion graphics engine...");
    // Check for TS in development, or JS in compiled dist/
    const entryPointTs = path.resolve(__dirname, "../remotion/index.ts");
    const entryPointJs = path.resolve(__dirname, "../remotion/index.js");
    const entryPoint = (await fs.stat(entryPointTs).then(() => true).catch(() => false))
      ? entryPointTs
      : entryPointJs;

    const bundleLocation = await bundle({
      entryPoint,
      onProgress: () => {},
    });
    cachedBundleLocation = bundleLocation;
    logger.info({ bundleLocation }, "Remotion bundle ready");
    bundlingPromise = null;
    return bundleLocation;
  })();

  return bundlingPromise;
}

export type RenderGraphicOverlayOpts = {
  layout: GraphicCardLayout;
  animation: GraphicCardAnimation;
  theme: GraphicCardTheme;
  content: GraphicCardContent;
  durationSeconds: number;
  outputPath: string;
  fps?: number;
};

/**
 * Render an animated motion graphic card overlay into a transparent ProRes 4444 (.mov) clip.
 * Preserves full alpha channel for seamless compositing onto base footage in FFmpeg.
 */
export async function renderGraphicOverlay(
  opts: RenderGraphicOverlayOpts,
): Promise<string> {
  const {
    layout,
    animation,
    theme,
    content,
    durationSeconds,
    outputPath,
    fps = 30,
  } = opts;

  const bundleLocation = await getRemotionBundle();
  const durationInFrames = Math.max(15, Math.round(durationSeconds * fps));

  const inputProps: GraphicCardOverlayProps = {
    layout,
    animation,
    theme,
    content,
  };

  // Detect system chromium if present (e.g. in Linux container)
  const linuxChromium = "/usr/bin/chromium";
  const hasLinuxChromium = await fs
    .stat(linuxChromium)
    .then(() => true)
    .catch(() => false);
  const browserExecutable =
    process.env.REMOTION_CHROME_EXECUTABLE ||
    (hasLinuxChromium ? linuxChromium : undefined);

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "GraphicCardOverlay",
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable,
  });

  const startTime = Date.now();
  logger.info(
    { layout, animation, durationInFrames, outputPath },
    "Rendering Remotion graphic overlay",
  );

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames,
      fps,
    },
    serveUrl: bundleLocation,
    codec: "prores",
    proResProfile: "4444",
    imageFormat: "png",
    pixelFormat: "yuva444p10le",
    outputLocation: outputPath,
    inputProps: inputProps as unknown as Record<string, unknown>,
    browserExecutable,
    concurrency: 1, // Keep CPU/memory usage controlled on 2 vCPUs
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
      flags: {
        "no-sandbox": true,
        "disable-setuid-sandbox": true,
        "disable-gpu": true,
        "disable-dev-shm-usage": true,
      },
    },
  });

  const elapsedMs = Date.now() - startTime;
  logger.info(
    { elapsedMs, outputPath },
    "Remotion graphic overlay render complete",
  );

  return outputPath;
}
