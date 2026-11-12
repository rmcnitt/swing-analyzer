import { getContainedStageSize } from "@/lib/video-layout";

/** Floating swing-checks panel width (18rem) plus its 8px inset either side. */
export const CHECKS_PANEL_WIDTH = 288 + 16;

/** Docked beside the video: the 18rem panel column. */
export const CHECKS_SIDE_WIDTH = 288;

/** Below this media width the panel always docks; a floating one would cover most of the pane. */
export const CHECKS_DOCK_WIDTH = 520;

export type ChecksPlacement = "float" | "side" | "below";

/**
 * Where the swing checks panel goes in a pane whose media area (video plus a docked panel) is
 * `width`×`height` px, for a clip of `aspectRatio` (width / height). It never covers the golfer:
 * - "float": in a corner, over the empty margin beside a portrait clip or a landscape clip's
 *   corner (usually sky or background);
 * - "side": a column beside the video, when the margins together fit it (the video keeps its size);
 * - "below": under the video (narrow panes).
 *
 * Measured on the whole media area, so docking (which resizes the video area) can't flip it.
 */
export function checksPanelPlacement(width: number, height: number, aspectRatio: number): ChecksPlacement {
  if (width <= 0 || height <= 0) {
    return "float";
  }

  if (width < CHECKS_DOCK_WIDTH) {
    return "below";
  }

  if (aspectRatio >= 1) {
    return "float";
  }

  const margin = width - getContainedStageSize(width, height, aspectRatio).width;

  if (margin / 2 >= CHECKS_PANEL_WIDTH) {
    return "float";
  }

  return margin >= CHECKS_SIDE_WIDTH ? "side" : "below";
}
