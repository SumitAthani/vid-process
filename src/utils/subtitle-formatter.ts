export type SubtitleCue = {
  start: number; // seconds
  end: number;
  lines: string[]; // 1–2 lines
};

export const SHORT_FORM_DEFAULTS = {
  maxCharsPerLine: 30,
  maxLines: 2,
  minCueDurationSec: 0.8,
} as const;

export function formatTimestamp(sec: number, textType: "srt" | "vtt"): string {
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);

  return (
    [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":") +
    (textType === "srt" ? "," : ".") +
    String(ms).padStart(3, "0")
  );
}

export function splitTextIntoLines(
  text: string,
  maxChars: number,
  maxLines: number,
): { lines: string[]; remainder: string } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], remainder: "" };

  const lines: string[] = [];
  let currentLine = "";
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    const word = words[index];
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxChars) {
      currentLine = candidate;
      index++;
    } else {
      // Word doesn't fit on this line
      if (currentLine === "") {
        // Handle a single word longer than maxChars
        currentLine = word;
        index++;
      }

      lines.push(currentLine);
      currentLine = "";
    }
  }

  // Add the last line if there's room
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return {
    lines,
    remainder: words.slice(index).join(" "),
  };
}

export function mergeShortCues(
  cues: SubtitleCue[],
  maxCharsPerLine: number,
  maxLines: number,
  minCueDurationSec: number,
): SubtitleCue[] {
  const merged: SubtitleCue[] = [];

  for (const cue of cues) {
    if (merged.length === 0) {
      merged.push(cue);
      continue;
    }

    const prev = merged[merged.length - 1];

    const duration = cue.end - cue.start;

    if (duration >= minCueDurationSec) {
      merged.push(cue);
      continue;
    }

    // Try combining previous + current text
    const combinedText = [...prev.lines, ...cue.lines].join(" ");

    const { lines, remainder } = splitTextIntoLines(
      combinedText,
      maxCharsPerLine,
      maxLines,
    );

    if (remainder === "") {
      prev.lines = lines;
      prev.end = cue.end;
    } else {
      merged.push(cue);
    }
  }

  return merged;
}

export function serializeSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((cue, i) => {
        const timestamp = `${formatTimestamp(cue.start, "srt")} --> ${formatTimestamp(cue.end, "srt")}`;
        return `${i + 1}\n${timestamp}\n${cue.lines.join("\n")}`;
      })
      .join("\n\n") + (cues.length ? "\n" : "")
  );
}

export function serializeVtt(cues: SubtitleCue[]): string {
  const body = cues
    .map((cue) => {
      const timestamp = `${formatTimestamp(cue.start, "vtt")} --> ${formatTimestamp(cue.end, "vtt")}`;
      return `${timestamp}\n${cue.lines.join("\n")}`;
    })
    .join("\n\n");

  return cues.length ? `WEBVTT\n\n${body}\n` : "WEBVTT\n";
}

export type AssBurnStyle = {
  fontName: string;
  fontSize: number;
  marginV: number;
  marginL: number;
  marginR: number;
  playResX: number;
  playResY: number;
};

/** Convert SRT timestamp (HH:MM:SS,mmm) to ASS (H:MM:SS.cs). */
function srtTimeToAss(srtTime: string): string {
  const match = srtTime.trim().match(/^(\d+):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return "0:00:00.00";
  const [, h, m, s, ms] = match;
  const cs = Math.round(Number(ms) / 10);
  return `${Number(h)}:${m}:${s}.${String(cs).padStart(2, "0")}`;
}

/**
 * Wrap SRT text into an ASS script with PlayRes matching the reel so
 * FontSize / Margin* are interpreted in video pixels (9:16 safe zone).
 */
export function wrapSrtToAss(srtContent: string, style: AssBurnStyle): string {
  const safeFont = style.fontName.replace(/[,]/g, "");
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${style.playResX}
PlayResY: ${style.playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${safeFont},${style.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,${style.marginL},${style.marginR},${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const blocks = srtContent.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
  const dialogues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    let idx = 0;
    if (/^\d+$/.test(lines[0]!)) idx = 1;
    const timeLine = lines[idx];
    if (!timeLine?.includes("-->")) continue;

    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    const text = lines
      .slice(idx + 1)
      .join("\\N")
      .replace(/[{}]/g, "");

    dialogues.push(
      `Dialogue: 0,${srtTimeToAss(startRaw)},${srtTimeToAss(endRaw)},Default,,0,0,0,,${text}`,
    );
  }

  return header + dialogues.join("\n") + (dialogues.length ? "\n" : "");
}
