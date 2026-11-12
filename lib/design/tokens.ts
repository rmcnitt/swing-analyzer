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

/** `rgba()` form of a 6-digit token hex, for canvas fills that need transparency. */
export function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Canvas font string in the UI mono face (IBM Plex Mono, loaded by next/font under a generated
 * family name exposed as `--font-plex-mono`). Falls back to the system mono outside the browser.
 */
export function monoFont(sizePx: number, weight = 500) {
  let family = "";

  if (typeof document !== "undefined") {
    family = getComputedStyle(document.documentElement).getPropertyValue("--font-plex-mono").trim();
  }

  return `${weight} ${sizePx}px ${family ? `${family}, ` : ""}${MONO_FALLBACK}`;
}
