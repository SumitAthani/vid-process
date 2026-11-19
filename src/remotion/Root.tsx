import React from "react";
import { Composition } from "remotion";
import { GraphicCardOverlay } from "./compositions/GraphicCardOverlay";
import { GraphicCardOverlayProps } from "./types";

export const RemotionRoot: React.FC = () => {
  const defaultProps: GraphicCardOverlayProps = {
    layout: "center-card",
    animation: "spring-pop",
    theme: {
      background: "#0F172A",
      textColor: "#F8FAFC",
      accentColor: "#38BDF8",
    },
    content: {
      badgeText: "PERFORMANCE",
      headline: "3x Faster Processing",
      subheadline: "Engineered for low latency Reels",
      metricValue: "3x",
      iconName: "zap",
    },
  };

  return (
    <Composition
      id="GraphicCardOverlay"
      component={GraphicCardOverlay}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  );
};
