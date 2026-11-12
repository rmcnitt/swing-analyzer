import { frameIndexNear, hasPose, landmarkAt, LM, type PoseTrack } from "@/lib/pose/landmarks";
import type { SwingCheckId } from "@/lib/types";

/**
 * "Swing checks": tempo, head movement and (down-the-line) posture checks, measured from the pose
 * track at the swing positions. Each check is switched on or off per pane.
 */

export interface SwingCheckInfo {
  id: SwingCheckId;
  label: string;
  /** Position to jump to when the check is switched on (where it is judged). */
  focus?: "Address" | "Top";
  defaultOn: boolean;
}

export const SWING_CHECKS: readonly SwingCheckInfo[] = [
  { id: "tempo", label: "Tempo", defaultOn: true },
  { id: "head", label: "Head", focus: "Address", defaultOn: true },
  { id: "posture", label: "Posture", focus: "Address", defaultOn: false },
  { id: "extension", label: "Early ext.", focus: "Address", defaultOn: false },
  { id: "leadArm", label: "Lead arm", focus: "Top", defaultOn: false },
];

export function isCheckOn(checks: Partial<Record<SwingCheckId, boolean>> | undefined, id: SwingCheckId) {
  return checks?.[id] ?? SWING_CHECKS.find((check) => check.id === id)?.defaultOn ?? false;
}

/** Where each check turns from fine to worth a look; easy to tune. */
export const CHECK_TOLERANCES = {
  /** Head shift (straight-line inches) from Address. */
  headInches: 2,
  /** Spine angle change from Address, degrees. */
  postureDegrees: 5,
  /** Hips moving toward the ball from Address (early extension), inches. Behind is fine. */
  extensionInches: 1.5,
  /** Lead arm vs shoulder plane at the top, degrees either way. */
  leadArmDegrees: 10,
} as const;

/** Swing position times (seconds), marked or detected. */
export interface SwingTimes {
  address?: number;
  top?: number;
  impact?: number;
}

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

export function midpoint(track: PoseTrack, index: number, a: number, b: number) {
  const p = landmarkAt(track, index, a);
  const q = landmarkAt(track, index, b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
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

export function headAt(track: PoseTrack, index: number, source: HeadSource) {
  if (source === "ears") {
    return midpoint(track, index, LM.leftEar, LM.rightEar);
  }

  const nose = landmarkAt(track, index, LM.nose);
  return { x: nose.x, y: nose.y };
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

/** Height used when the golfer's own isn't set (5'10"). */
export const AVERAGE_HEIGHT_INCHES = 70;
export const MIN_HEIGHT_INCHES = 48;
export const MAX_HEIGHT_INCHES = 90;
/** Hip joint to ankle as a share of standing height (33 in at 5'10"). */
export const LEG_SHARE_OF_HEIGHT = 33 / 70;

export function clampHeight(inches: number) {
  return Math.min(MAX_HEIGHT_INCHES, Math.max(MIN_HEIGHT_INCHES, Math.round(inches)));
}

/** 70 → `5'10"`. */
export function formatHeight(inches: number) {
  const rounded = Math.round(inches);
  return `${Math.floor(rounded / 12)}'${rounded % 12}"`;
}

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
  /** Which way `forward` points on screen (+1 right, -1 left). */
  screenSign: 1 | -1;
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
 * Inches per frame-height unit at frame `index`, using the golfer's leg length in the image as the
 * ruler (legs are tracked well and barely change length during the swing). 0 if it can't tell.
 */
export function inchesPerUnit(track: PoseTrack, index: number, aspect = 1, heightInches = AVERAGE_HEIGHT_INCHES) {
  const legs = hasPose(track, index) ? legLength(track, index, aspect) : 0;
  return legs > 0 ? (heightInches * LEG_SHARE_OF_HEIGHT) / legs : 0;
}

export interface CheckOptions {
  /** The golfer's height, for converting to inches. */
  heightInches?: number;
}

/**
 * How far the head moved from Address by Top and by Impact, in approximate inches (scaled by the
 * golfer's leg length in the image and their height), with the horizontal turned into golf
 * directions.
 */
export function headMovement(
  track: PoseTrack,
  { address, top, impact }: { address?: number; top?: number; impact?: number },
  aspect = 1,
  { heightInches = AVERAGE_HEIGHT_INCHES }: CheckOptions = {},
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
  const scale = inchesPerUnit(track, start, aspect, heightInches);

  if (!(scale > 0)) {
    return null;
  }

  const handsAtAddress = midpoint(track, start, LM.leftWrist, LM.rightWrist);
  const topIndex = top === undefined ? -1 : frameIndexNear(track, top);
  let forwardSign: 1 | -1 = 1;

  if (view === "face-on" && topIndex >= 0 && hasPose(track, topIndex)) {
    // At the top the hands are on the trail side; the target is the other way.
    const handsAtTop = midpoint(track, topIndex, LM.leftWrist, LM.rightWrist);
    forwardSign = handsAtTop.x < handsAtAddress.x ? 1 : -1;
  } else if (view === "down-the-line") {
    forwardSign = ballSide(track, start);
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

  return { view, source, screenSign: forwardSign, atTop: shiftAt(top), atImpact: shiftAt(impact) };
}

/** Below this the head counts as not having moved that way. */
export const STEADY_INCHES = 0.25;

const DIRECTION_WORDS = {
  long: {
    "face-on": ["toward target", "away from target"],
    "down-the-line": ["toward ball", "away from ball"],
    unknown: ["right", "left"],
  },
  short: {
    "face-on": ["fwd", "back"],
    "down-the-line": ["to ball", "off ball"],
    unknown: ["right", "left"],
  },
} as const;

/**
 * e.g. "≈1.1 in down · 0.6 in toward target", or "steady". `short` gives the panel's compact form,
 * "1.1″ down · 0.6″ fwd" (fwd/back = toward/away from the target face-on).
 */
export function describeHeadShift(shift: HeadShift, view: CameraView, { short = false } = {}) {
  const [toward, away] = DIRECTION_WORDS[short ? "short" : "long"][view];
  const unit = short ? "″" : " in";
  const parts: string[] = [];

  if (Math.abs(shift.down) >= STEADY_INCHES) {
    parts.push(`${Math.abs(shift.down).toFixed(1)}${unit} ${shift.down > 0 ? "down" : "up"}`);
  }

  if (Math.abs(shift.forward) >= STEADY_INCHES) {
    parts.push(`${Math.abs(shift.forward).toFixed(1)}${unit} ${shift.forward > 0 ? toward : away}`);
  }

  if (parts.length === 0) {
    return "steady";
  }

  return short ? parts.join(" · ") : `≈${parts.join(" · ")}`;
}

const ARROWS = { down: "↓", up: "↑", right: "→", left: "←" } as const;

/**
 * Compact on-screen form for a table cell, e.g. "↓1.8 ←0.8": inches, with arrows as the movement
 * looks on the video (`screenSign` from HeadMovement).
 */
export function headShiftArrows(shift: HeadShift, screenSign: 1 | -1) {
  const parts: string[] = [];
  const right = shift.forward * screenSign;

  if (Math.abs(shift.down) >= STEADY_INCHES) {
    parts.push(`${shift.down > 0 ? ARROWS.down : ARROWS.up}${Math.abs(shift.down).toFixed(1)}`);
  }

  if (Math.abs(right) >= STEADY_INCHES) {
    parts.push(`${right > 0 ? ARROWS.right : ARROWS.left}${Math.abs(right).toFixed(1)}`);
  }

  return parts.length > 0 ? parts.join(" ") : "steady";
}

/** Straight-line distance of a head shift, in inches. */
export function shiftDistance(shift: HeadShift) {
  return Math.hypot(shift.forward, shift.down);
}

/** Whether the head stayed within tolerance at both Top and Impact. */
export function headWithinTolerance(movement: HeadMovement) {
  return [movement.atTop, movement.atImpact].every(
    (shift) => !shift || shiftDistance(shift) <= CHECK_TOLERANCES.headInches,
  );
}

/**
 * Down-the-line: which way the ball is on screen (+1 right, -1 left). At address the hands hang
 * toward the ball, out in front of the hips.
 */
function ballSide(track: PoseTrack, start: number): 1 | -1 {
  const hands = midpoint(track, start, LM.leftWrist, LM.rightWrist);
  const hips = midpoint(track, start, LM.leftHip, LM.rightHip);
  return hands.x > hips.x ? 1 : -1;
}

function allVisible(track: PoseTrack, index: number, landmarks: readonly number[]) {
  return (
    index >= 0 &&
    hasPose(track, index) &&
    landmarks.every((landmark) => landmarkAt(track, index, landmark).visibility >= VISIBLE)
  );
}

const TORSO = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip] as const;

/**
 * Spine angle at frame `index`: the line from the middle of the hips to the middle of the
 * shoulders, in degrees above flat ground (90 = standing straight up). Undefined if the torso
 * isn't clearly visible.
 */
export function spineAngle(track: PoseTrack, index: number, aspect = 1) {
  if (!allVisible(track, index, TORSO)) {
    return undefined;
  }

  const hips = midpoint(track, index, LM.leftHip, LM.rightHip);
  const shoulders = midpoint(track, index, LM.leftShoulder, LM.rightShoulder);
  const rise = hips.y - shoulders.y;

  return rise > 0 ? (Math.atan2(rise, Math.abs(shoulders.x - hips.x) * aspect) * 180) / Math.PI : undefined;
}

/**
 * Checks judged down-the-line (posture, early extension, lead arm) only report numbers for a
 * down-the-line clip; face-on they'd measure something else.
 */
export type ViewGated<T> = { view: CameraView } & ({ ok: true; value: T } | { ok: false });

function gate<T>(track: PoseTrack, start: number, aspect: number, value: () => T): ViewGated<T> {
  const view = detectCameraView(track, start, aspect);
  return view === "down-the-line" ? { view, ok: true, value: value() } : { view, ok: false };
}

export interface Posture {
  /** Spine angle above the ground, degrees. */
  address?: number;
  top?: number;
  impact?: number;
}

/** Spine angle at Address, Top and Impact (down-the-line only). */
export function postureCheck(track: PoseTrack, { address, top, impact }: SwingTimes, aspect = 1) {
  const start = address === undefined ? -1 : frameIndexNear(track, address);

  if (start < 0 || !hasPose(track, start)) {
    return null;
  }

  const at = (time?: number) => (time === undefined ? undefined : spineAngle(track, frameIndexNear(track, time), aspect));
  return gate(track, start, aspect, (): Posture => ({ address: at(address), top: at(top), impact: at(impact) }));
}

/** Biggest spine-angle change from Address (signed, + = more upright), or undefined. */
export function postureChange(posture: Posture) {
  if (posture.address === undefined) {
    return undefined;
  }

  const changes = [posture.top, posture.impact]
    .filter((angle) => angle !== undefined)
    .map((angle) => angle - posture.address!);

  return changes.length > 0 ? changes.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : undefined;
}

export function postureWithinTolerance(posture: Posture) {
  const change = postureChange(posture);
  return change === undefined || Math.abs(change) <= CHECK_TOLERANCES.postureDegrees;
}

/**
 * Early extension: how far the hips (and so the butt) moved toward the ball from Address, at Top
 * and Impact, in inches. Positive = toward the ball (off "the wall"); negative = behind it.
 */
export interface Extension {
  atTop?: number;
  atImpact?: number;
  /** Which way the ball is on screen (+1 right, -1 left). */
  ballSide: 1 | -1;
}

const HIPS = [LM.leftHip, LM.rightHip] as const;

export function earlyExtension(
  track: PoseTrack,
  { address, top, impact }: SwingTimes,
  aspect = 1,
  { heightInches = AVERAGE_HEIGHT_INCHES }: CheckOptions = {},
) {
  const start = address === undefined ? -1 : frameIndexNear(track, address);

  if (!allVisible(track, start, HIPS)) {
    return null;
  }

  return gate(track, start, aspect, (): Extension => {
    const side = ballSide(track, start);
    const scale = inchesPerUnit(track, start, aspect, heightInches);
    const origin = midpoint(track, start, LM.leftHip, LM.rightHip).x;
    const shiftAt = (time?: number) => {
      const index = time === undefined ? -1 : frameIndexNear(track, time);
      return allVisible(track, index, HIPS) && scale > 0
        ? (midpoint(track, index, LM.leftHip, LM.rightHip).x - origin) * aspect * scale * side
        : undefined;
    };

    return { atTop: shiftAt(top), atImpact: shiftAt(impact), ballSide: side };
  });
}

export function extensionWithinTolerance(extension: Pick<Extension, "atTop" | "atImpact">) {
  return [extension.atTop, extension.atImpact].every(
    (shift) => shift === undefined || shift <= CHECK_TOLERANCES.extensionInches,
  );
}

/** Table-cell form of an extension shift: "on line", or e.g. "→0.4" (arrow as seen on screen). */
export function extensionArrow(inches: number, ballSide: 1 | -1) {
  if (Math.abs(inches) < STEADY_INCHES) {
    return "on line";
  }

  return `${inches * ballSide > 0 ? ARROWS.right : ARROWS.left}${Math.abs(inches).toFixed(1)}`;
}

export type BodySide = "left" | "right";

/**
 * Down-the-line, a right-hander faces right (ball to the right of the hips) and a left-hander
 * faces left; the lead arm is the one on the target side (left for a right-hander).
 */
function leadSide(track: PoseTrack, start: number): BodySide {
  return ballSide(track, start) > 0 ? "left" : "right";
}

const SIDE_LANDMARKS = {
  left: { shoulder: LM.leftShoulder, wrist: LM.leftWrist },
  right: { shoulder: LM.rightShoulder, wrist: LM.rightWrist },
} as const;

/** Lead shoulder, trail shoulder and lead wrist for a golfer whose lead arm is `lead`. */
export function leadArmLandmarks(lead: BodySide) {
  const trail = lead === "left" ? "right" : "left";
  return { shoulder: SIDE_LANDMARKS[lead].shoulder, trailShoulder: SIDE_LANDMARKS[trail].shoulder, wrist: SIDE_LANDMARKS[lead].wrist };
}

/**
 * Lead arm against the shoulder plane at frame `index` (down-the-line): both measured from the
 * lead shoulder as an angle above horizontal, pointing back (away from the ball). Positive = the
 * arm is steeper (above the shoulder plane), negative = flatter (below). Undefined if unclear.
 */
export function leadArmAngle(track: PoseTrack, index: number, lead: BodySide, ballSign: 1 | -1, aspect = 1) {
  const { shoulder, trailShoulder, wrist } = leadArmLandmarks(lead);

  if (!allVisible(track, index, [shoulder, trailShoulder, wrist])) {
    return undefined;
  }

  const origin = landmarkAt(track, index, shoulder);
  const elevation = (landmark: number) => {
    const point = landmarkAt(track, index, landmark);
    return (Math.atan2(origin.y - point.y, (point.x - origin.x) * aspect * -ballSign) * 180) / Math.PI;
  };

  return elevation(wrist) - elevation(trailShoulder);
}

export interface LeadArm {
  /** Degrees above (+) or below (−) the shoulder plane at Top. */
  atTop?: number;
  lead: BodySide;
}

/** Lead arm vs shoulder plane at the top (down-the-line only). */
export function leadArmPlane(track: PoseTrack, { address, top }: SwingTimes, aspect = 1) {
  const start = address === undefined ? -1 : frameIndexNear(track, address);

  if (start < 0 || !hasPose(track, start)) {
    return null;
  }

  return gate(track, start, aspect, (): LeadArm => {
    const lead = leadSide(track, start);
    const index = top === undefined ? -1 : frameIndexNear(track, top);
    return { lead, atTop: index < 0 ? undefined : leadArmAngle(track, index, lead, ballSide(track, start), aspect) };
  });
}

/** How far the butt sits behind the hip joints, as a share of leg length (~6 in on 33 in). */
const BUTT_DEPTH_SHARE = 0.18;

export interface Point2 {
  x: number;
  y: number;
}

/** What the video overlay needs for each check, fixed for the clip (the live parts follow playback). */
export interface CheckGuides {
  /** The clip's width / height, so live measurements match the panel's. */
  aspect: number;
  /**
   * Address head position (normalized) and a ring radius in frame-height units. `tolerance` is the
   * head tolerance in frame-height units (x scaled by `aspect`); absent when there's no ruler.
   */
  head?: { source: HeadSource; origin: Point2; radius: number; tolerance?: number };
  /** Address spine, hip middle to shoulder middle (normalized), and its angle; down-the-line only. */
  posture?: { hips: Point2; shoulders: Point2; angle: number };
  /**
   * The "wall": a vertical line at the butt at Address (normalized x, from `top` to `bottom`).
   * The live butt is the hip middle pushed `buttOffset` away from the ball (`ballSide`, ±1);
   * `tolerance` is the extension tolerance in normalized x.
   */
  extension?: { wallX: number; top: number; bottom: number; ballSide: 1 | -1; buttOffset: number; tolerance: number };
  /** Shown around the Top frame (`topIndex`): shoulder plane and lead arm lines. */
  leadArm?: { topIndex: number; lead: BodySide; ballSide: 1 | -1 };
}

/** Overlay guides for a clip, given its swing positions (seconds; marked or detected). */
export function buildCheckGuides(
  track: PoseTrack,
  { address, top, impact }: SwingTimes,
  aspect = 1,
  { heightInches = AVERAGE_HEIGHT_INCHES }: CheckOptions = {},
): CheckGuides {
  const start = address === undefined ? -1 : frameIndexNear(track, address);

  if (address === undefined || start < 0 || !hasPose(track, start)) {
    return { aspect };
  }

  const guides: CheckGuides = { aspect };
  const headEnd = impact ?? top ?? address;
  const source = headSource(track, address, headEnd);
  // About the head's half-height (~4.5 in against ~33 in of leg). Leg length is a steadier ruler
  // than the face, which tilts down at address.
  const legs = legLength(track, start, aspect);
  const radius = Math.max(0.01, legs * 0.13);
  const scale = inchesPerUnit(track, start, aspect, heightInches);
  guides.head = { source, origin: headAt(track, start, source), radius };

  if (scale > 0) {
    guides.head.tolerance = CHECK_TOLERANCES.headInches / scale;
  }

  if (detectCameraView(track, start, aspect) !== "down-the-line") {
    return guides;
  }

  const hips = midpoint(track, start, LM.leftHip, LM.rightHip);

  const spine = spineAngle(track, start, aspect);

  if (spine !== undefined) {
    guides.posture = { hips, shoulders: midpoint(track, start, LM.leftShoulder, LM.rightShoulder), angle: spine };
  }

  const topIndex = top === undefined ? -1 : frameIndexNear(track, top);

  if (topIndex >= 0) {
    guides.leadArm = { topIndex, lead: leadSide(track, start), ballSide: ballSide(track, start) };
  }

  if (allVisible(track, start, HIPS) && legs > 0 && scale > 0) {
    const side = ballSide(track, start);
    const buttOffset = (legs * BUTT_DEPTH_SHARE) / aspect;
    const ankles = midpoint(track, start, LM.leftAnkle, LM.rightAnkle);
    guides.extension = {
      wallX: hips.x - side * buttOffset,
      top: hips.y - legs * 0.4,
      bottom: Math.max(hips.y + legs * 0.3, ankles.y),
      ballSide: side,
      buttOffset,
      tolerance: CHECK_TOLERANCES.extensionInches / scale / aspect,
    };
  }

  return guides;
}
