import { getContainedStageSize } from "@/lib/video-layout";

/** Floating swing-checks panel width (18rem) plus its 8px inset either side. */
export const CHECKS_PANEL_WIDTH = 288 + 16;

/** Below this media width the panel always docks; a floating one would cover most of the pane. */
export const CHECKS_DOCK_WIDTH = 520;

/**
 * Where the swing checks panel goes in a pane whose media area (video plus docked panel) is
 * `width`×`height` px, for a clip of `aspectRatio` (width / height). It floats only where it can't
 * cover the golfer: in the empty margin beside the video, or over a landscape clip's corner
 * (usually sky or background). Otherwise it docks below the video.
 *
 * Measured on the whole media area, so docking (which shortens the video) can't flip the answer.
 */
export function checksPanelPlacement(width: number, height: number, aspectRatio: number): "float" | "dock" {
  if (width <= 0 || height <= 0) {
    return "float";
  }

  if (width < CHECKS_DOCK_WIDTH) {
    return "dock";
  }

  if (aspectRatio >= 1) {
    return "float";
  }

  const stage = getContainedStageSize(width, height, aspectRatio);
  return (width - stage.width) / 2 >= CHECKS_PANEL_WIDTH ? "float" : "dock";
}
