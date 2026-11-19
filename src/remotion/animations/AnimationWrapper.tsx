import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GraphicCardAnimation } from "../types";

export const AnimationWrapper: React.FC<{
  animation: GraphicCardAnimation;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ animation, children, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrance spring
  const enterProgress = spring({
    frame,
    fps,
    config: {
      damping: 12,
      mass: 0.6,
      stiffness: 100,
    },
  });

  // Exit transition in last 12 frames
  const exitStartFrame = Math.max(0, durationInFrames - 12);
  const exitProgress = spring({
    frame: Math.max(0, frame - exitStartFrame),
    fps,
    config: {
      damping: 15,
      mass: 0.8,
    },
  });

  let transform = "none";
  let opacity = 1;
  let filter = "none";

  if (animation === "spring-pop") {
    const scale = interpolate(enterProgress, [0, 1], [0.75, 1]);
    const exitScale = interpolate(exitProgress, [0, 1], [1, 0.85]);
    const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

    transform = `scale(${frame >= exitStartFrame ? exitScale : scale})`;
    opacity = frame >= exitStartFrame ? exitOpacity : enterProgress;
  } else if (animation === "slide-up-blur") {
    const translateY = interpolate(enterProgress, [0, 1], [120, 0]);
    const blur = interpolate(enterProgress, [0, 1], [12, 0]);
    const exitTranslateY = interpolate(exitProgress, [0, 1], [0, -80]);
    const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

    transform = `translateY(${frame >= exitStartFrame ? exitTranslateY : translateY}px)`;
    opacity = frame >= exitStartFrame ? exitOpacity : enterProgress;
    filter = `blur(${frame < exitStartFrame ? blur : 0}px)`;
  } else {
    // counter-spin
    const scale = interpolate(enterProgress, [0, 1], [0.8, 1]);
    const rotate = interpolate(enterProgress, [0, 1], [-6, 0]);
    const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

    transform = `scale(${scale}) rotate(${rotate}deg)`;
    opacity = frame >= exitStartFrame ? exitOpacity : enterProgress;
  }

  return (
    <div
      style={{
        transform,
        opacity,
        filter,
        willChange: "transform, opacity, filter",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
