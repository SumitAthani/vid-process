export const CROP_STRATEGIES = ["center", "pad"] as const;
export type CropStrategy = (typeof CROP_STRATEGIES)[number];

export const PAD_BACKGROUNDS = ["black", "white", "blur"] as const;
export type PadBackground = (typeof PAD_BACKGROUNDS)[number];

export type CropJobOptions = {
  cropStrategy: CropStrategy;
  padBackground: PadBackground | null;
};
