import React from "react";
import { GraphicCardContent, GraphicCardTheme } from "../types";
import { IconResolver } from "../components/IconResolver";
import { REEL_SAFE_ZONES } from "../utils/safe-zones";

export const CenterCard: React.FC<{
  content: GraphicCardContent;
  theme: GraphicCardTheme;
}> = ({ content, theme }) => {
  return (
    <div
      style={{
        width: REEL_SAFE_ZONES.contentWidth,
        maxWidth: 860,
        backgroundColor: `${theme.background}E6`, // 90% opacity for glass effect
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: 36,
        border: `2px solid ${theme.accentColor}55`,
        boxShadow: `0 20px 60px -10px ${theme.background}AA, 0 0 40px 0 ${theme.accentColor}33`,
        padding: "48px 44px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        boxSizing: "border-box",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Optional Badge */}
      {content.badgeText && (
        <div
          style={{
            backgroundColor: `${theme.accentColor}22`,
            border: `1.5px solid ${theme.accentColor}88`,
            borderRadius: 9999,
            padding: "8px 20px",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: theme.accentColor,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          {content.badgeText}
        </div>
      )}

      {/* Main Visual: Metric or Icon */}
      {content.metricValue ? (
        <div
          style={{
            fontSize: 110,
            fontWeight: 900,
            lineHeight: 1,
            color: theme.accentColor,
            letterSpacing: -2,
            marginBottom: 20,
            textShadow: `0 8px 30px ${theme.accentColor}66`,
          }}
        >
          {content.metricValue}
        </div>
      ) : (
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 28,
            backgroundColor: `${theme.accentColor}22`,
            border: `2px solid ${theme.accentColor}66`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            boxShadow: `0 0 30px ${theme.accentColor}44`,
          }}
        >
          <IconResolver
            name={content.iconName}
            size={52}
            color={theme.accentColor}
          />
        </div>
      )}

      {/* Headline */}
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1.25,
          color: theme.textColor,
          marginBottom: content.subheadline ? 16 : 0,
        }}
      >
        {content.headline}
      </div>

      {/* Subheadline */}
      {content.subheadline && (
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            lineHeight: 1.4,
            color: `${theme.textColor}CC`,
            maxWidth: 680,
          }}
        >
          {content.subheadline}
        </div>
      )}
    </div>
  );
};
