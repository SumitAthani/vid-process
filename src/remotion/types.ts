export type GraphicCardLayout =
  | "center-card"
  | "top-half-banner"
  | "lower-third-callout";

export type GraphicCardAnimation =
  | "spring-pop"
  | "slide-up-blur"
  | "counter-spin";

export type GraphicCardTheme = {
  background: string;
  textColor: string;
  accentColor: string;
};

export type GraphicCardContent = {
  headline: string;
  subheadline?: string;
  metricValue?: string;
  iconName?: string;
  badgeText?: string;
};

export type GraphicCardOverlayProps = {
  layout: GraphicCardLayout;
  animation: GraphicCardAnimation;
  theme: GraphicCardTheme;
  content: GraphicCardContent;
};
