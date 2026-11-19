import React from "react";
import { GraphicCardOverlayProps } from "../types";
import { AnimationWrapper } from "../animations/AnimationWrapper";
import { CenterCard } from "../layouts/CenterCard";
import { TopHalfBanner } from "../layouts/TopHalfBanner";
import { LowerThirdCallout } from "../layouts/LowerThirdCallout";
import { REEL_SAFE_ZONES } from "../utils/safe-zones";

export const GraphicCardOverlay: React.FC<GraphicCardOverlayProps> = ({
  layout,
  animation,
  theme,
  content,
}) => {
  let contentNode: React.ReactNode;
  let containerStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    height: "100%",
    top: 0,
    left: 0,
    display: "flex",
    boxSizing: "border-box",
  };

  if (layout === "top-half-banner") {
    containerStyle = {
      ...containerStyle,
      justifyContent: "center",
      alignItems: "flex-start",
    };
    contentNode = <TopHalfBanner content={content} theme={theme} />;
  } else if (layout === "lower-third-callout") {
    containerStyle = {
      ...containerStyle,
      justifyContent: "center",
      alignItems: "flex-start",
      paddingTop: 1100, // Safe above bottom UI chrome
    };
    contentNode = <LowerThirdCallout content={content} theme={theme} />;
  } else {
    // center-card (default)
    containerStyle = {
      ...containerStyle,
      justifyContent: "center",
      alignItems: "center",
      paddingTop: REEL_SAFE_ZONES.paddingTop,
      paddingBottom: REEL_SAFE_ZONES.paddingBottom,
    };
    contentNode = <CenterCard content={content} theme={theme} />;
  }

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: "transparent",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={containerStyle}>
        <AnimationWrapper animation={animation}>
          {contentNode}
        </AnimationWrapper>
      </div>
    </div>
  );
};
