import { clamp } from "@/lib/utils";

export type FollowerCorrection =
  | { kind: "seek"; time: number }
  | { kind: "rate"; multiplier: number };

export interface CorrectionOptions {
  /** Drift (media seconds) beyond which the follower jumps instead of catching up. */
  seekThreshold?: number;
  /** Drift small enough to ignore (about a frame at 60–120fps). */
  deadband?: number;
  /** Largest speed change used to catch up, as a fraction of the chosen speed. */
  maxAdjust?: number;
  /** Aim to close the drift over roughly this much media time. */
  catchUpSeconds?: number;
}

/**
 * How a playing follower should correct toward the leader's (mapped) time. Small drift is fixed
 * by briefly playing slightly faster/slower, which is smooth; only large drift seeks, since a
 * seek during playback stalls the decoder.
 */
export function followerCorrection(
  targetTime: number,
  followerTime: number,
  { seekThreshold = 0.25, deadband = 0.008, maxAdjust = 0.15, catchUpSeconds = 0.5 }: CorrectionOptions = {},
): FollowerCorrection {
  const drift = targetTime - followerTime;

  if (Math.abs(drift) > seekThreshold) {
    return { kind: "seek", time: Math.max(0, targetTime) };
  }

  if (Math.abs(drift) <= deadband) {
    return { kind: "rate", multiplier: 1 };
  }

  return { kind: "rate", multiplier: 1 + clamp(drift / catchUpSeconds, -maxAdjust, maxAdjust) };
}
