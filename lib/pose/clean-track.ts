import {
  FRAME_STRIDE,
  hasPose,
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  LM,
  type PoseTrack,
} from "@/lib/pose/landmarks";

/** Left/right landmark pairs: eyes are 1–3 / 4–6, then odd = left, even = right from 7 to 32. */
const SIDE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [2, 5],
  [3, 6],
  ...Array.from({ length: 13 }, (_, i) => [7 + 2 * i, 8 + 2 * i] as const),
];

/** Pairs used to decide whether a frame's sides are swapped (arms often cross, so not hands). */
const SWAP_TEST_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftHip, LM.rightHip],
  [LM.leftKnee, LM.rightKnee],
  [LM.leftAnkle, LM.rightAnkle],
];

const SWAP_RATIO = 0.5;

function distance(data: Float32Array, frameA: number, a: number, frameB: number, b: number) {
  const offsetA = frameA * FRAME_STRIDE + a * LANDMARK_STRIDE;
  const offsetB = frameB * FRAME_STRIDE + b * LANDMARK_STRIDE;
  return Math.hypot(data[offsetA] - data[offsetB], data[offsetA + 1] - data[offsetB + 1]);
}

function swapSides(data: Float32Array, frame: number) {
  for (const [left, right] of SIDE_PAIRS) {
    const a = frame * FRAME_STRIDE + left * LANDMARK_STRIDE;
    const b = frame * FRAME_STRIDE + right * LANDMARK_STRIDE;

    for (let k = 0; k < LANDMARK_STRIDE; k += 1) {
      const value = data[a + k];
      data[a + k] = data[b + k];
      data[b + k] = value;
    }
  }
}

/**
 * The model sometimes flips the golfer's left and right for a few frames (it can't always tell
 * front from back). A frame whose sides match the previous frame much better when swapped is
 * swapped back. Mutates `data`.
 */
export function fixSideSwaps(track: PoseTrack, data: Float32Array) {
  let swaps = 0;

  for (let frame = 1; frame < track.times.length; frame += 1) {
    if (!hasPose(track, frame) || !hasPose(track, frame - 1)) {
      continue;
    }

    let same = 0;
    let swapped = 0;

    for (const [left, right] of SWAP_TEST_PAIRS) {
      same += distance(data, frame - 1, left, frame, left) + distance(data, frame - 1, right, frame, right);
      swapped += distance(data, frame - 1, left, frame, right) + distance(data, frame - 1, right, frame, left);
    }

    if (swapped < same * SWAP_RATIO) {
      swapSides(data, frame);
      swaps += 1;
    }
  }

  return swaps;
}

/**
 * Light [1 2 1] smoothing of image positions over time to take out frame-to-frame jitter.
 * Frames next to a gap aren't smoothed across it.
 */
function smoothPositions(track: PoseTrack, source: Float32Array) {
  const data = new Float32Array(source);

  for (let frame = 1; frame < track.times.length - 1; frame += 1) {
    if (!hasPose(track, frame - 1) || !hasPose(track, frame) || !hasPose(track, frame + 1)) {
      continue;
    }

    for (let landmark = 0; landmark < LANDMARK_COUNT; landmark += 1) {
      for (const k of [0, 1]) {
        const at = (f: number) => source[f * FRAME_STRIDE + landmark * LANDMARK_STRIDE + k];
        data[frame * FRAME_STRIDE + landmark * LANDMARK_STRIDE + k] =
          (at(frame - 1) + 2 * at(frame) + at(frame + 1)) / 4;
      }
    }
  }

  return data;
}

/** Display/analysis copy of a raw track: side swaps fixed, then lightly smoothed. */
export function cleanTrack(track: PoseTrack): PoseTrack {
  const data = new Float32Array(track.data);
  fixSideSwaps(track, data);
  return { ...track, data: smoothPositions(track, data) };
}
