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
