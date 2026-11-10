/**
 * Pose tracks: MediaPipe Pose Landmarker output for a whole clip, stored compactly.
 *
 * Each analyzed frame holds 33 landmarks (BlazePose topology). Per landmark we keep the image
 * position (normalized 0–1 to the video frame, like annotations), its visibility, and the 3D
 * "world" position (metres, hip-centred) that joint angles are measured from.
 */

export const LANDMARK_COUNT = 33;
/** Values per landmark in `PoseTrack.data`: x, y, visibility, worldX, worldY, worldZ. */
export const LANDMARK_STRIDE = 6;
export const FRAME_STRIDE = LANDMARK_COUNT * LANDMARK_STRIDE;
export const POSE_TRACK_VERSION = 1;

/** BlazePose landmark indices used by the app. Left/right are the golfer's own sides. */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type Side = "left" | "right" | "center";

/** Bones drawn for the skeleton overlay (face and finger detail left out). */
export const SKELETON_BONES: ReadonlyArray<readonly [number, number, Side]> = [
  [LM.leftShoulder, LM.rightShoulder, "center"],
  [LM.leftHip, LM.rightHip, "center"],
  [LM.leftShoulder, LM.leftHip, "left"],
  [LM.rightShoulder, LM.rightHip, "right"],
  [LM.leftShoulder, LM.leftElbow, "left"],
  [LM.leftElbow, LM.leftWrist, "left"],
  [LM.rightShoulder, LM.rightElbow, "right"],
  [LM.rightElbow, LM.rightWrist, "right"],
  [LM.leftHip, LM.leftKnee, "left"],
  [LM.leftKnee, LM.leftAnkle, "left"],
  [LM.rightHip, LM.rightKnee, "right"],
  [LM.rightKnee, LM.rightAnkle, "right"],
  [LM.leftAnkle, LM.leftHeel, "left"],
  [LM.leftHeel, LM.leftFootIndex, "left"],
  [LM.leftAnkle, LM.leftFootIndex, "left"],
  [LM.rightAnkle, LM.rightHeel, "right"],
  [LM.rightHeel, LM.rightFootIndex, "right"],
  [LM.rightAnkle, LM.rightFootIndex, "right"],
];

export const SKELETON_JOINTS: readonly number[] = [
  LM.nose,
  ...new Set(SKELETON_BONES.flatMap(([a, b]) => [a, b])),
];

export interface PoseTrack {
  version: typeof POSE_TRACK_VERSION;
  videoId: string;
  model: string;
  /** Media time (seconds) of each analyzed frame, ascending. */
  times: number[];
  /** `times.length * FRAME_STRIDE` values; a frame with no golfer found is all NaN. */
  data: Float32Array;
  /** Clip length when analyzed, to spot a stale track. */
  duration: number;
  analyzedAt: string;
}

export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

export interface WorldLandmark {
  x: number;
  y: number;
  z: number;
}

export function frameCount(track: PoseTrack) {
  return track.times.length;
}

/** Whether frame `index` found a golfer. */
export function hasPose(track: PoseTrack, index: number) {
  return index >= 0 && index < track.times.length && !Number.isNaN(track.data[index * FRAME_STRIDE]);
}

export function landmarkAt(track: PoseTrack, index: number, landmark: number): Landmark {
  const offset = index * FRAME_STRIDE + landmark * LANDMARK_STRIDE;
  return { x: track.data[offset], y: track.data[offset + 1], visibility: track.data[offset + 2] };
}

export function worldLandmarkAt(track: PoseTrack, index: number, landmark: number): WorldLandmark {
  const offset = index * FRAME_STRIDE + landmark * LANDMARK_STRIDE + 3;
  return { x: track.data[offset], y: track.data[offset + 1], z: track.data[offset + 2] };
}

/**
 * Index of the analyzed frame nearest `time`, or -1 if none is within `tolerance` seconds
 * (default: 1.5× the track's typical sample spacing).
 */
export function frameIndexNear(track: PoseTrack, time: number, tolerance?: number) {
  const { times } = track;

  if (times.length === 0) {
    return -1;
  }

  let low = 0;
  let high = times.length - 1;

  while (low < high) {
    const mid = (low + high) >> 1;

    if (times[mid] < time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const index = low > 0 && time - times[low - 1] < times[low] - time ? low - 1 : low;
  const spacing = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : Infinity;
  const limit = tolerance ?? spacing * 1.5;

  return Math.abs(times[index] - time) <= limit ? index : -1;
}

/** Packs one frame's landmarks into `data` at `index` (all NaN when no golfer was found). */
export function writeFrame(
  data: Float32Array,
  index: number,
  landmarks: ReadonlyArray<{ x: number; y: number; visibility?: number }> | undefined,
  world: ReadonlyArray<{ x: number; y: number; z: number }> | undefined,
) {
  const base = index * FRAME_STRIDE;

  for (let i = 0; i < LANDMARK_COUNT; i += 1) {
    const offset = base + i * LANDMARK_STRIDE;
    const point = landmarks?.[i];
    const worldPoint = world?.[i];

    data[offset] = point ? point.x : NaN;
    data[offset + 1] = point ? point.y : NaN;
    data[offset + 2] = point ? (point.visibility ?? 1) : NaN;
    data[offset + 3] = worldPoint ? worldPoint.x : NaN;
    data[offset + 4] = worldPoint ? worldPoint.y : NaN;
    data[offset + 5] = worldPoint ? worldPoint.z : NaN;
  }
}

/** Media times to analyze: the middle of every frame, thinned to at most `maxFrames`. */
export function sampleTimes(duration: number, fps: number, maxFrames = 1200) {
  const step = 1 / fps;
  const total = Math.max(1, Math.ceil(duration / step - 1e-3));
  const stride = Math.max(1, Math.ceil(total / maxFrames));
  const times: number[] = [];

  for (let index = 0; index < total; index += stride) {
    times.push(Math.min(duration, (index + 0.5) * step));
  }

  return times;
}
