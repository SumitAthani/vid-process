import React from "react";
import { GraphicCardContent, GraphicCardTheme } from "../types";
import { IconResolver } from "../components/IconResolver";
import { REEL_SAFE_ZONES } from "../utils/safe-zones";

export const LowerThirdCallout: React.FC<{
  content: GraphicCardContent;
  theme: GraphicCardTheme;
}> = ({ content, theme }) => {
  return (
    <div
      style={{
        width: REEL_SAFE_ZONES.contentWidth,
        maxWidth: 860,
        backgroundColor: `${theme.background}EE`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 28,
        border: `2px solid ${theme.accentColor}66`,
        boxShadow: `0 16px 50px -10px ${theme.background}DD, 0 0 30px 0 ${theme.accentColor}33`,
        padding: "28px 36px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 28,
        boxSizing: "border-box",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Icon or Metric Pill */}
      {content.metricValue ? (
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            lineHeight: 1,
            color: theme.accentColor,
            letterSpacing: -1,
            minWidth: 120,
            textAlign: "center",
          }}
        >
          {content.metricValue}
        </div>
      ) : (
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            backgroundColor: `${theme.accentColor}25`,
            border: `1.5px solid ${theme.accentColor}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconResolver
            name={content.iconName}
            size={42}
            color={theme.accentColor}
          />
        </div>
      )}

      {/* Text Container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          textAlign: "left",
          flex: 1,
        }}
      >
        {content.badgeText && (
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: theme.accentColor,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {content.badgeText}
          </div>
        )}

        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            lineHeight: 1.25,
            color: theme.textColor,
            marginBottom: content.subheadline ? 6 : 0,
          }}
        >
          {content.headline}
        </div>

        {content.subheadline && (
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.35,
              color: `${theme.textColor}BB`,
            }}
          >
            {content.subheadline}
          </div>
        )}
      </div>
    </div>
  );
};
