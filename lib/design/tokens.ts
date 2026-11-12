/**
 * Design tokens for code that can't read CSS variables: canvas drawing (pose overlays, swing
 * checks), Konva annotations and PNG export. Values mirror `app/globals.css`; DESIGN.md is the
 * source of truth for both.
 */
export const color = {
  bg: "#0b0b0c",
  surface1: "#131315",
  surface2: "#1a1a1d",
  border: "#26262a",
  borderStrong: "#3a3a40",
  text: "#ededef",
  textMuted: "#9a9aa2",
  textFaint: "#5e5e66",
  accent: "#ff6a1a",
  good: "#5bbf7a",
  warn: "#e0b04a",
  bad: "#e0605a",
} as const;

/**
 * User-picked annotation colors. The one place more than one hue is allowed: golfers need
 * contrasting strokes on varied footage. The default (first) swatch is the accent.
 */
export const ANNOTATION_SWATCHES = [color.accent, "#38bdf8", "#facc15", "#4ade80", "#f472b6"] as const;

export const DEFAULT_ANNOTATION_COLOR = color.accent;
