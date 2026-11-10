import { hasPose, landmarkAt, LM, type PoseTrack } from "@/lib/pose/landmarks";

/** Times (seconds) of the positions found; any may be missing when the clip doesn't show it. */
export interface DetectedPositions {
  Address?: number;
  Top?: number;
  Impact?: number;
  Finish?: number;
}

export type DetectedLabel = keyof DetectedPositions;

/** Detected positions plus timing that isn't a position. */
export interface SwingPhases extends DetectedPositions {
  /** When the hands first move (the takeaway starts); Address is set a little before this. */
  motionStart?: number;
}

/**
 * Hands count as still below these fractions of their peak (downswing) speed. Address is strict
 * so a slow takeaway or forward press isn't mistaken for the setup.
 */
const ADDRESS_STILL = 0.03;
const FINISH_STILL = 0.06;
/**
 * The clubhead starts back before the hands visibly move, so Address is taken this far (seconds)
 * before the hands' first movement, while they're still settled.
 */
const ADDRESS_LEAD = 0.3;
/** The hands count as settled once they've stayed still this long. */
const FINISH_HOLD = 0.12;
/** The club keeps settling behind the head after the hands stop; the finish is this much later. */
const FINISH_LAG = 0.25;
/** The swing must move the hands at least this many body-heights vertically. */
const MIN_HAND_TRAVEL = 0.3;

interface Series {
  times: number[];
  x: number[];
  y: number[];
  /** Shoulders-to-ankles height in frame-height units; the scale for distances/speeds. */
  bodyHeight: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Hand position per frame (midpoint of the wrists), gaps filled linearly. */
function handSeries(track: PoseTrack, aspect: number): Series | null {
  const n = track.times.length;
  const x: number[] = new Array(n).fill(NaN);
  const y: number[] = new Array(n).fill(NaN);
  const heights: number[] = [];
  let found = 0;

  for (let i = 0; i < n; i += 1) {
    if (!hasPose(track, i)) {
      continue;
    }

    const left = landmarkAt(track, i, LM.leftWrist);
    const right = landmarkAt(track, i, LM.rightWrist);
    // x in frame-height units so horizontal and vertical motion compare fairly.
    x[i] = ((left.x + right.x) / 2) * aspect;
    y[i] = (left.y + right.y) / 2;
    found += 1;

    const shoulders = (landmarkAt(track, i, LM.leftShoulder).y + landmarkAt(track, i, LM.rightShoulder).y) / 2;
    const ankles = (landmarkAt(track, i, LM.leftAnkle).y + landmarkAt(track, i, LM.rightAnkle).y) / 2;
    heights.push(ankles - shoulders);
  }

  if (n < 10 || found < n * 0.6) {
    return null;
  }

  for (const values of [x, y]) {
    const known = values.flatMap((value, index) => (Number.isNaN(value) ? [] : [index]));

    for (let i = 0; i < n; i += 1) {
      if (!Number.isNaN(values[i])) {
        continue;
      }

      const after = known.find((index) => index > i);
      const before = known.findLast((index) => index < i);

      if (before === undefined || after === undefined) {
        values[i] = values[(before ?? after)!];
      } else {
        const fraction = (i - before) / (after - before);
        values[i] = values[before] + (values[after] - values[before]) * fraction;
      }
    }
  }

  const bodyHeight = median(heights);
  return bodyHeight > 0.02 ? { times: track.times, x, y, bodyHeight } : null;
}

/** Centred moving average, `half` frames each side. */
function smooth(values: number[], half: number) {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;

    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j += 1) {
      sum += values[j];
      count += 1;
    }

    return sum / count;
  });
}

const argBy = (from: number, to: number, score: (i: number) => number) => {
  let best = from;

  for (let i = from + 1; i <= to; i += 1) {
    if (score(i) > score(best)) {
      best = i;
    }
  }

  return best;
};

/**
 * Finds Address, Top, Impact and Finish from the path of the hands, which pose estimation
 * tracks reliably even when the torso is ambiguous:
 * - Top: the hands' highest point before the fastest part of the swing.
 * - Impact: the hands back down at about their address height after the top.
 * - Address: the last still moment before the hands start back.
 * - Finish: the hands come to rest high after impact.
 * Works on image coordinates (y grows downward). `aspect` is the frame's width / height.
 */
export function detectSwingPositions(track: PoseTrack, aspect = 1): DetectedPositions | null {
  const phases = detectSwingPhases(track, aspect);

  if (!phases) {
    return null;
  }

  const { Address, Top, Impact, Finish } = phases;
  return Object.fromEntries(
    Object.entries({ Address, Top, Impact, Finish }).filter(([, time]) => time !== undefined),
  ) as DetectedPositions;
}

/** {@link detectSwingPositions} plus `motionStart`, for tempo. */
export function detectSwingPhases(track: PoseTrack, aspect = 1): SwingPhases | null {
  const series = handSeries(track, aspect);

  if (!series) {
    return null;
  }

  const { times, bodyHeight } = series;
  const n = times.length;
  const spacing = (times[n - 1] - times[0]) / (n - 1);
  const half = Math.max(1, Math.round(0.03 / spacing));
  const x = smooth(series.x, half);
  const y = smooth(series.y, half);

  const speed = times.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    return Math.hypot(x[b] - x[a], y[b] - y[a]) / (times[b] - times[a]) / bodyHeight;
  });

  const peak = argBy(0, n - 1, (i) => speed[i]);
  const addressStill = speed[peak] * ADDRESS_STILL;
  const finishStill = speed[peak] * FINISH_STILL;
  const top = argBy(0, peak, (i) => -y[i]);
  // Hands' lowest point before the top: their height at address.
  const addressY = Math.max(...y.slice(0, top + 1));
  const travel = addressY - y[top];

  if (top === 0 || travel / bodyHeight < MIN_HAND_TRAVEL) {
    return null;
  }

  const result: SwingPhases = { Top: times[top] };

  // Impact: first low point after the top that's back near address height.
  const lowEnough = addressY - travel * 0.25;
  let impact = -1;

  for (let i = top + 1; i < n; i += 1) {
    const isLowPoint = y[i] >= y[i - 1] && (i === n - 1 || y[i] >= y[i + 1]);

    if (isLowPoint && y[i] >= lowEnough) {
      impact = i;
      break;
    }
  }

  // Address: back from the top until the hands are near address height, then on back to the
  // last frame where they were still.
  let address = top;

  while (address > 0 && y[address] < addressY - travel * 0.2) {
    address -= 1;
  }

  while (address > 0 && speed[address] > addressStill) {
    address -= 1;
  }

  if (speed[address] <= addressStill) {
    const takeaway = times[address];
    result.motionStart = takeaway;

    while (
      address > 0 &&
      speed[address - 1] <= addressStill &&
      takeaway - times[address - 1] <= ADDRESS_LEAD
    ) {
      address -= 1;
    }

    result.Address = times[address];
  }

  if (impact < 0) {
    return result;
  }

  result.Impact = times[impact];

  // Finish: once the hands have risen at least halfway back up, the start of the first stretch
  // where they stay still.
  if (impact < n - 1) {
    const high = argBy(impact + 1, n - 1, (i) => -y[i]);
    const risen = y[impact] - (y[impact] - y[high]) * 0.5;
    let finish = -1;

    for (let i = impact + 1; i < n && finish < 0; i += 1) {
      if (y[i] > risen || speed[i] > finishStill) {
        continue;
      }

      let j = i;

      while (j + 1 < n && speed[j + 1] <= finishStill && times[j + 1] - times[i] < FINISH_HOLD) {
        j += 1;
      }

      if (times[j] - times[i] >= FINISH_HOLD - spacing * 1.5) {
        finish = i;
      }
    }

    if (y[impact] - y[high] >= travel * 0.5) {
      let at = finish >= 0 ? finish : high;
      const settled = times[at];

      // Step forward by the lag while the hands stay up in the finish.
      while (at + 1 < n && times[at + 1] - settled <= FINISH_LAG && y[at + 1] <= risen) {
        at += 1;
      }

      result.Finish = times[at];
    }
  }

  return result;
}
