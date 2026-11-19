/**
 * Instagram Reels & TikTok 9:16 Safe Zones for 1080x1920 canvas
 *
 * Top ~240px: Account name, search, camera punch-hole
 * Bottom ~580px: Captions, audio ticker, engagement footer
 * Right ~140px: Like, comment, share, bookmark buttons
 * Left ~60px: Edge margin
 */
export const REEL_SAFE_ZONES = {
  canvasWidth: 1080,
  canvasHeight: 1920,
  paddingTop: 240,
  paddingBottom: 580,
  paddingRight: 140,
  paddingLeft: 80,
  /** Usable width inside safe zones: 1080 - 80 - 140 = 860 */
  contentWidth: 860,
  /** Usable height inside safe zones: 1920 - 240 - 580 = 1100 */
  contentHeight: 1100,
} as const;
