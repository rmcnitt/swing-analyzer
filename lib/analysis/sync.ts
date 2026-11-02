import { clamp } from "@/lib/utils";
import type { PaneId } from "@/lib/types";

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

/** Where a leader time lands in a follower clip, and how fast the follower should run there. */
export interface TimeMapping {
  /** Follower time; may fall outside the follower clip (callers clamp to its edges). */
  time: number;
  /** Follower seconds per leader second at this point (the local tempo ratio). */
  rate: number;
}

/** Maps a time in one pane to the matching time in another. */
export type TimeMapper = (from: PaneId, to: PaneId, time: number) => TimeMapping;

export const identityMapper: TimeMapper = (_from, _to, time) => ({ time, rate: 1 });

/** The same swing position in both panes: [leader time, follower time]. */
export type Anchor = readonly [number, number];

/** Tempo ratios beyond this are almost certainly a mis-marked checkpoint; keep playback sane. */
const MIN_RATE = 0.25;
const MAX_RATE = 4;

/**
 * Maps `time` through matched checkpoints. Between two checkpoints the follower is stretched
 * linearly, so both swings pass every shared position together even when tempos differ. With a
 * single checkpoint (or outside the first/last one) it's a constant offset; with none, identity.
 * Anchors must be sorted and strictly increasing in both coordinates (see `matchCheckpoints`).
 */
export function mapThroughAnchors(anchors: readonly Anchor[], time: number): TimeMapping {
  if (anchors.length === 0) {
    return { time, rate: 1 };
  }

  const first = anchors[0];
  const last = anchors[anchors.length - 1];

  if (anchors.length === 1 || time <= first[0]) {
    return { time: time + (first[1] - first[0]), rate: 1 };
  }

  if (time >= last[0]) {
    return { time: time + (last[1] - last[0]), rate: 1 };
  }

  const index = anchors.findIndex(([leader], i) => i > 0 && time <= leader);
  const [a0, b0] = anchors[index - 1];
  const [a1, b1] = anchors[index];
  const slope = (b1 - b0) / (a1 - a0);

  return { time: b0 + (time - a0) * slope, rate: clamp(slope, MIN_RATE, MAX_RATE) };
}

export interface MatchedCheckpoint {
  key: string;
  primary: number;
  secondary: number;
}

/**
 * Pairs up positions marked in both panes, sorted by time. Pairs that would make time run
 * backwards in one pane (e.g. Top marked after Impact) are dropped, keeping the largest
 * consistent set.
 */
export function matchCheckpoints(
  primary: ReadonlyMap<string, number>,
  secondary: ReadonlyMap<string, number>,
): MatchedCheckpoint[] {
  const shared = [...primary]
    .filter(([key]) => secondary.has(key))
    .map(([key, time]) => ({ key, primary: time, secondary: secondary.get(key)! }))
    .sort((a, b) => a.primary - b.primary || a.secondary - b.secondary);

  // Longest chain strictly increasing in both times (n is tiny, so O(n²) is fine).
  const chainLength = shared.map(() => 1);
  const previous = shared.map(() => -1);

  shared.forEach((item, i) => {
    for (let j = 0; j < i; j += 1) {
      const before = shared[j];

      if (
        before.primary < item.primary &&
        before.secondary < item.secondary &&
        chainLength[j] + 1 > chainLength[i]
      ) {
        chainLength[i] = chainLength[j] + 1;
        previous[i] = j;
      }
    }
  });

  let end = chainLength.indexOf(Math.max(0, ...chainLength));
  const chain: MatchedCheckpoint[] = [];

  while (end >= 0) {
    chain.unshift(shared[end]);
    end = previous[end];
  }

  return chain;
}

/** A mapper between the two compare panes driven by their matched checkpoints. */
export function createCheckpointMapper(checkpoints: readonly MatchedCheckpoint[]): TimeMapper {
  const forward: Anchor[] = checkpoints.map(({ primary, secondary }) => [primary, secondary]);
  const backward: Anchor[] = checkpoints.map(({ primary, secondary }) => [secondary, primary]);

  return (from, to, time) => {
    if (from === to) {
      return { time, rate: 1 };
    }

    return mapThroughAnchors(from === "primary" ? forward : backward, time);
  };
}
