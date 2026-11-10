import { frameIndexNear, hasPose, landmarkAt, LM, type PoseTrack } from "@/lib/pose/landmarks";

/**
 * "Swing check": tempo, hand path and head movement, built only on what pose estimation tracks
 * reliably (hands, head, legs) and on the swing positions.
 */

export interface Tempo {
  /** Seconds from the start of the takeaway to the top. */
  backswing: number;
  /** Seconds from the top to impact. */
  downswing: number;
  /** backswing / downswing; tour players average about 3. */
  ratio: number;
}

export const TOUR_TEMPO = 3;

export function swingTempo({ start, top, impact }: { start?: number; top?: number; impact?: number }) {
  if (start === undefined || top === undefined || impact === undefined || !(start < top && top < impact)) {
    return null;
  }

  const backswing = top - start;
  const downswing = impact - top;
  return { backswing, downswing, ratio: backswing / downswing } satisfies Tempo;
}

export interface PathPoint {
  /** Normalized 0–1 frame coordinates. */
  x: number;
  y: number;
  /** Media time (seconds). */
  t: number;
}

const VISIBLE = 0.5;

function framesBetween(track: PoseTrack, from: number, to: number) {
  const frames: number[] = [];

  for (let i = 0; i < track.times.length; i += 1) {
    if (track.times[i] >= from - 1e-6 && track.times[i] <= to + 1e-6 && hasPose(track, i)) {
      frames.push(i);
    }
  }

  return frames;
}

function midpoint(track: PoseTrack, index: number, a: number, b: number) {
  const p = landmarkAt(track, index, a);
  const q = landmarkAt(track, index, b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** The hands (midpoint of the wrists) from `from` to `to` seconds. */
export function handPath(track: PoseTrack, from: number, to: number): PathPoint[] {
  return framesBetween(track, from, to).map((index) => ({
    ...midpoint(track, index, LM.leftWrist, LM.rightWrist),
    t: track.times[index],
  }));
}

export type HeadSource = "ears" | "nose";

/**
 * The ears' midpoint stays at the centre of the head as it turns, but one ear is often hidden
 * (down-the-line); then the nose is used. Chosen once per range so the path can't jump.
 */
export function headSource(track: PoseTrack, from: number, to: number): HeadSource {
  const frames = framesBetween(track, from, to);
  const bothEars = frames.filter(
    (index) =>
      landmarkAt(track, index, LM.leftEar).visibility >= VISIBLE &&
      landmarkAt(track, index, LM.rightEar).visibility >= VISIBLE,
  ).length;

  return frames.length > 0 && bothEars >= frames.length * 0.8 ? "ears" : "nose";
}

function headAt(track: PoseTrack, index: number, source: HeadSource) {
  if (source === "ears") {
    return midpoint(track, index, LM.leftEar, LM.rightEar);
  }

  const nose = landmarkAt(track, index, LM.nose);
  return { x: nose.x, y: nose.y };
}

export function headPath(track: PoseTrack, from: number, to: number, source = headSource(track, from, to)) {
  return framesBetween(track, from, to).map((index) => ({ ...headAt(track, index, source), t: track.times[index] }));
}

export type CameraView = "face-on" | "down-the-line" | "unknown";

/**
 * Face-on shows the shoulders side by side; down-the-line shows them nearly on top of each other.
 * Judged at address from shoulder width vs torso length (in frame-height units).
 */
export function detectCameraView(track: PoseTrack, index: number, aspect = 1): CameraView {
  if (!hasPose(track, index)) {
    return "unknown";
  }

  const left = landmarkAt(track, index, LM.leftShoulder);
  const right = landmarkAt(track, index, LM.rightShoulder);
  const shoulders = midpoint(track, index, LM.leftShoulder, LM.rightShoulder);
  const hips = midpoint(track, index, LM.leftHip, LM.rightHip);
  const width = Math.hypot((left.x - right.x) * aspect, left.y - right.y);
  const torso = Math.hypot((shoulders.x - hips.x) * aspect, shoulders.y - hips.y);

  if (torso <= 0) {
    return "unknown";
  }

  const ratio = width / torso;
  return ratio >= 0.5 ? "face-on" : ratio <= 0.35 ? "down-the-line" : "unknown";
}

/** Leg length (hip joint to ankle) assumed for converting to inches: about a 5'10" golfer. */
export const ASSUMED_LEG_INCHES = 33;

export interface HeadShift {
  /**
   * Inches along the horizontal: positive toward the target (face-on), toward the ball
   * (down-the-line), or screen-right when the view is unknown.
   */
  forward: number;
  /** Inches; positive is down. */
  down: number;
}

export interface HeadMovement {
  view: CameraView;
  source: HeadSource;
  atTop?: HeadShift;
  atImpact?: HeadShift;
}

function legLength(track: PoseTrack, index: number, aspect: number) {
  const segment = (a: number, b: number) => {
    const p = landmarkAt(track, index, a);
    const q = landmarkAt(track, index, b);
    return Math.hypot((p.x - q.x) * aspect, p.y - q.y);
  };
  const left = segment(LM.leftHip, LM.leftKnee) + segment(LM.leftKnee, LM.leftAnkle);
  const right = segment(LM.rightHip, LM.rightKnee) + segment(LM.rightKnee, LM.rightAnkle);
  return (left + right) / 2;
}

/**
 * How far the head moved from Address by Top and by Impact, in approximate inches (scaled by the
 * golfer's leg length in the image), with the horizontal turned into golf directions.
 */
export function headMovement(
  track: PoseTrack,
  { address, top, impact }: { address?: number; top?: number; impact?: number },
  aspect = 1,
): HeadMovement | null {
  if (address === undefined) {
    return null;
  }

  const start = frameIndexNear(track, address);

  if (start < 0 || !hasPose(track, start)) {
    return null;
  }

  const end = impact ?? top ?? address;
  const source = headSource(track, address, end);
  const view = detectCameraView(track, start, aspect);
  const legs = legLength(track, start, aspect);

  if (!(legs > 0)) {
    return null;
  }

  // Inches per frame-height unit.
  const scale = ASSUMED_LEG_INCHES / legs;
  const handsAtAddress = midpoint(track, start, LM.leftWrist, LM.rightWrist);
  const topIndex = top === undefined ? -1 : frameIndexNear(track, top);
  let forwardSign = 1;

  if (view === "face-on" && topIndex >= 0 && hasPose(track, topIndex)) {
    // At the top the hands are on the trail side; the target is the other way.
    const handsAtTop = midpoint(track, topIndex, LM.leftWrist, LM.rightWrist);
    forwardSign = handsAtTop.x < handsAtAddress.x ? 1 : -1;
  } else if (view === "down-the-line") {
    // At address the hands hang toward the ball, out in front of the hips.
    const hips = midpoint(track, start, LM.leftHip, LM.rightHip);
    forwardSign = handsAtAddress.x > hips.x ? 1 : -1;
  }

  const origin = headAt(track, start, source);
  const shiftAt = (time?: number): HeadShift | undefined => {
    const index = time === undefined ? -1 : frameIndexNear(track, time);

    if (index < 0 || !hasPose(track, index)) {
      return undefined;
    }

    const head = headAt(track, index, source);
    return {
      forward: (head.x - origin.x) * aspect * scale * forwardSign,
      down: (head.y - origin.y) * scale,
    };
  };

  return { view, source, atTop: shiftAt(top), atImpact: shiftAt(impact) };
}

/** Below this the head counts as not having moved that way. */
export const STEADY_INCHES = 0.25;

/** e.g. "≈1.1 in down · 0.6 in toward target", or "steady". */
export function describeHeadShift(shift: HeadShift, view: CameraView) {
  const [toward, away] =
    view === "face-on"
      ? ["toward target", "away from target"]
      : view === "down-the-line"
        ? ["toward ball", "away from ball"]
        : ["right", "left"];
  const parts: string[] = [];

  if (Math.abs(shift.down) >= STEADY_INCHES) {
    parts.push(`${Math.abs(shift.down).toFixed(1)} in ${shift.down > 0 ? "down" : "up"}`);
  }

  if (Math.abs(shift.forward) >= STEADY_INCHES) {
    parts.push(`${Math.abs(shift.forward).toFixed(1)} in ${shift.forward > 0 ? toward : away}`);
  }

  return parts.length > 0 ? `≈${parts.join(" · ")}` : "steady";
}
