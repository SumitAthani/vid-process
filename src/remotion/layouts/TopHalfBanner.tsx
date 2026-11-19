import React from "react";
import { GraphicCardContent, GraphicCardTheme } from "../types";
import { IconResolver } from "../components/IconResolver";

export const TopHalfBanner: React.FC<{
  content: GraphicCardContent;
  theme: GraphicCardTheme;
}> = ({ content, theme }) => {
  return (
    <div
      style={{
        width: 1080,
        height: 960,
        background: `linear-gradient(145deg, ${theme.background} 0%, #030712 100%)`,
        borderBottom: `4px solid ${theme.accentColor}88`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "60px 80px",
        boxSizing: "border-box",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {content.badgeText && (
        <div
          style={{
            backgroundColor: `${theme.accentColor}25`,
            border: `1.5px solid ${theme.accentColor}99`,
            borderRadius: 9999,
            padding: "8px 24px",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: theme.accentColor,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          {content.badgeText}
        </div>
      )}

      {content.metricValue ? (
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            lineHeight: 1,
            color: theme.accentColor,
            letterSpacing: -2,
            marginBottom: 24,
            textShadow: `0 8px 40px ${theme.accentColor}77`,
          }}
        >
          {content.metricValue}
        </div>
      ) : (
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: 32,
            backgroundColor: `${theme.accentColor}22`,
            border: `2px solid ${theme.accentColor}77`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
            boxShadow: `0 0 40px ${theme.accentColor}55`,
          }}
        >
          <IconResolver
            name={content.iconName}
            size={58}
            color={theme.accentColor}
          />
        </div>
      )}

      <div
        style={{
          fontSize: 48,
          fontWeight: 800,
          lineHeight: 1.25,
          color: theme.textColor,
          maxWidth: 900,
          marginBottom: content.subheadline ? 16 : 0,
        }}
      >
        {content.headline}
      </div>

      {content.subheadline && (
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            lineHeight: 1.4,
            color: `${theme.textColor}CC`,
            maxWidth: 780,
          }}
        >
          {content.subheadline}
        </div>
      )}
    </div>
  );
};
