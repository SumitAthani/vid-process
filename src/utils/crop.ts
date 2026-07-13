export type CropRect = {
  scaleW: number;
  scaleH: number;
  x: number;
  y: number;
};

/**
 * Compute a center crop rect that fills targetWidth×targetHeight
 * after scaling with force_original_aspect_ratio=increase behavior.
 */
export function computeCenterCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Source dimensions must be positive");
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const scaleW = Math.round(sourceWidth * scale);
  const scaleH = Math.round(sourceHeight * scale);
  const x = Math.max(0, Math.round((scaleW - targetWidth) / 2));
  const y = Math.max(0, Math.round((scaleH - targetHeight) / 2));

  return { scaleW, scaleH, x, y };
}
