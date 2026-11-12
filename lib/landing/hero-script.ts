/**
 * The landing hero's short demo, as a function of the sample clip's own time (so it can't drift
 * from the swing). A cursor clicks Pose (the skeleton appears), then Swing checks (the posture
 * line appears), then the swing plays out. The clip loops over just the swing.
 */

/** Video seconds of the down-the-line sample the hero loops over (setup to finish). */
export const HERO_LOOP = { start: 0.3, end: 3.4 } as const;

export type CursorTarget = "enter" | "pose" | "checks";

export interface HeroFrame {
  pose: boolean;
  checks: boolean;
  cursor: { target: CursorTarget; visible: boolean; clicking: boolean };
}

/** Video seconds (the clip plays at 0.5x, so 0.1 s here is 0.2 s on screen). */
const MOVE_TO_POSE = 0.38;
const CLICK_POSE = 0.55;
const MOVE_TO_CHECKS = 0.65;
const CLICK_CHECKS = 0.85;
const CLICK_LENGTH = 0.07;
const CURSOR_LEAVES = 1.15;

export function heroFrame(time: number, { reducedMotion = false } = {}): HeroFrame {
  if (reducedMotion) {
    return { pose: true, checks: true, cursor: { target: "checks", visible: false, clicking: false } };
  }

  const target: CursorTarget = time < MOVE_TO_POSE ? "enter" : time < MOVE_TO_CHECKS ? "pose" : "checks";
  const clicking =
    (time >= CLICK_POSE && time < CLICK_POSE + CLICK_LENGTH) ||
    (time >= CLICK_CHECKS && time < CLICK_CHECKS + CLICK_LENGTH);

  return {
    pose: time >= CLICK_POSE,
    checks: time >= CLICK_CHECKS,
    cursor: { target, visible: time >= HERO_LOOP.start && time < CURSOR_LEAVES, clicking },
  };
}
