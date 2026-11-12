/**
 * Which layout the analysis workspace uses:
 * - "desktop": desktop and iPad.
 * - "phone": a phone held upright, one swing. A scrolling column: video, chips, timeline, buttons.
 * - "compact": a phone in landscape, and every phone compare. A small desktop: the two videos
 *   side by side fill the screen, chips and scrubbers below them, everything else tucked away
 *   behind buttons that expand it. Compare is never stacked on a phone.
 */
export type WorkspaceLayout = "desktop" | "phone" | "compact";

/** Phone-sized screens in either orientation (narrow, or short in landscape). */
export const SMALL_SCREEN_QUERY = "(max-width: 767.98px), (max-height: 500px)";
export const PORTRAIT_QUERY = "(orientation: portrait)";

export interface LayoutDecision {
  layout: WorkspaceLayout;
  /**
   * Compare on a phone held upright: the workspace is drawn turned 90° so it's landscape anyway.
   * (Web pages can only lock orientation on Android, in fullscreen; this covers everything else.)
   */
  rotated: boolean;
}

export function workspaceLayout(input: {
  smallScreen: boolean;
  portrait: boolean;
  compareMode: boolean;
}): LayoutDecision {
  if (!input.smallScreen) {
    return { layout: "desktop", rotated: false };
  }

  if (input.compareMode || !input.portrait) {
    return { layout: "compact", rotated: input.portrait };
  }

  return { layout: "phone", rotated: false };
}
