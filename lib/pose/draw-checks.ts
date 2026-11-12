import { hasPose, landmarkAt, LM, type PoseTrack } from "@/lib/pose/landmarks";
import {
  CHECK_TOLERANCES,
  headAt,
  leadArmAngle,
  leadArmLandmarks,
  midpoint,
  spineAngle,
  type CheckGuides,
  type Point2,
} from "@/lib/pose/swing-check";
import { color, monoFont, withAlpha } from "@/lib/design/tokens";
import type { SwingCheckId } from "@/lib/types";

/**
 * Check overlay colors (DESIGN.md): reference marks (where things were at Address, the shoulder
 * plane) are dashed and muted; live marks follow the playhead in the accent and turn warn past
 * their tolerance. A check is identified by its label, never by its own color.
 */
export const CHECK_COLORS = {
  reference: color.textMuted,
  live: color.accent,
  warn: color.warn,
} as const;

const liveColor = (withinTolerance: boolean) => (withinTolerance ? CHECK_COLORS.live : CHECK_COLORS.warn);

export type CheckVisibility = Partial<Record<SwingCheckId, boolean>>;

/**
 * Draws the switched-on swing checks for frame `index` into a `width`×`height` region (the video
 * frame). `scale` sizes lines like the on-screen overlay, so PNG exports at native resolution match.
 */
export function drawSwingChecks(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  guides: CheckGuides,
  visible: CheckVisibility,
  width: number,
  height: number,
  scale = 1,
) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0,0,0,0.65)";
  context.shadowBlur = 3 * scale;

  if (visible.head && guides.head) {
    drawHead(context, track, index, guides.head, guides.aspect, width, height, scale);
  }

  if (visible.posture && guides.posture) {
    drawPosture(context, track, index, guides.posture, guides.aspect, width, height, scale);
  }

  if (visible.extension && guides.extension) {
    drawExtension(context, track, index, guides.extension, width, height, scale);
  }

  if (visible.leadArm && guides.leadArm) {
    drawLeadArm(context, track, index, guides.leadArm, guides.aspect, width, height, scale);
  }

  context.restore();
}

function dashed(context: CanvasRenderingContext2D, scale: number) {
  context.strokeStyle = CHECK_COLORS.reference;
  context.lineWidth = 1.5 * scale;
  context.setLineDash([6 * scale, 4 * scale]);
}

/** Dashed ring where the head was at Address, solid ring where it is now, joined when apart. */
function drawHead(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { origin, radius, source, tolerance }: NonNullable<CheckGuides["head"]>,
  aspect: number,
  width: number,
  height: number,
  scale: number,
) {
  const r = radius * height;
  const ox = origin.x * width;
  const oy = origin.y * height;

  context.save();
  dashed(context, scale);
  context.beginPath();
  context.arc(ox, oy, r, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  if (!hasPose(track, index)) {
    context.restore();
    return;
  }

  const now = headAt(track, index, source);
  const nx = now.x * width;
  const ny = now.y * height;
  const moved = Math.hypot((now.x - origin.x) * aspect, now.y - origin.y);
  const tone = liveColor(tolerance === undefined || moved <= tolerance);

  context.strokeStyle = tone;
  context.lineWidth = 2 * scale;
  context.beginPath();
  context.arc(nx, ny, r, 0, Math.PI * 2);
  context.stroke();

  if (Math.hypot(nx - ox, ny - oy) > r * 0.15) {
    context.lineWidth = 1.5 * scale;
    context.beginPath();
    context.moveTo(ox, oy);
    context.lineTo(nx, ny);
    context.stroke();
  }

  for (const [x, y, fill] of [
    [ox, oy, CHECK_COLORS.reference],
    [nx, ny, tone],
  ] as const) {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(x, y, 2.5 * scale, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

/** Point `t` of the way from `a` to `b` (beyond `b` when t > 1), in pixels. */
function along(a: Point2, b: Point2, t: number, width: number, height: number): [number, number] {
  return [(a.x + (b.x - a.x) * t) * width, (a.y + (b.y - a.y) * t) * height];
}

const LABEL_SIZE = 12;

/**
 * On-video label: mono `--text` on a `--bg` 70% pill. `x` is the left edge, or the right edge when
 * `align` is "right"; `y` is the vertical middle.
 */
function label(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  align: "left" | "right" = "left",
) {
  context.save();
  context.font = monoFont(LABEL_SIZE * scale);
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.shadowBlur = 0;

  const padX = 6 * scale;
  const pillHeight = 20 * scale;
  const pillWidth = context.measureText(text).width + padX * 2;
  const left = align === "right" ? x - pillWidth : x;

  context.fillStyle = withAlpha(color.bg, 0.7);
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(left, y - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
  } else {
    context.rect(left, y - pillHeight / 2, pillWidth, pillHeight);
  }
  context.fill();

  context.fillStyle = color.text;
  context.fillText(text, left + padX, y);
  context.restore();
}

/** Dashed line along the Address spine, solid line along the current spine with its angle. */
function drawPosture(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { hips, shoulders, angle: addressAngle }: NonNullable<CheckGuides["posture"]>,
  aspect: number,
  width: number,
  height: number,
  scale: number,
) {
  context.save();
  dashed(context, scale);
  context.beginPath();
  context.moveTo(...along(hips, shoulders, -0.15, width, height));
  context.lineTo(...along(hips, shoulders, 1.35, width, height));
  context.stroke();
  context.setLineDash([]);

  const angle = spineAngle(track, index, aspect);

  if (angle !== undefined) {
    const nowHips = midpoint(track, index, LM.leftHip, LM.rightHip);
    const nowShoulders = midpoint(track, index, LM.leftShoulder, LM.rightShoulder);
    context.strokeStyle = liveColor(Math.abs(angle - addressAngle) <= CHECK_TOLERANCES.postureDegrees);
    context.lineWidth = 2.5 * scale;
    context.beginPath();
    context.moveTo(...along(nowHips, nowShoulders, 0, width, height));
    context.lineTo(...along(nowHips, nowShoulders, 1, width, height));
    context.stroke();

    // Label off the middle of the back (the side away from the lean), over the background.
    const [hx, hy] = along(nowHips, nowShoulders, 0.5, width, height);
    const leansRight = nowShoulders.x > nowHips.x;
    const gap = 26 * scale;
    label(context, `${Math.round(angle)}°`, leansRight ? hx - gap : hx + gap, hy, scale, leansRight ? "right" : "left");
  }

  context.restore();
}

/**
 * The wall: a dashed vertical line at the butt at Address, and the butt now (a dot at hip height).
 * When the butt has come off the wall toward the ball, the gap is drawn, warn past tolerance.
 */
function drawExtension(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { wallX, top, bottom, ballSide, buttOffset, tolerance }: NonNullable<CheckGuides["extension"]>,
  width: number,
  height: number,
  scale: number,
) {
  context.save();
  dashed(context, scale);
  context.beginPath();
  context.moveTo(wallX * width, top * height);
  context.lineTo(wallX * width, bottom * height);
  context.stroke();
  context.setLineDash([]);

  const hipsVisible =
    hasPose(track, index) &&
    [LM.leftHip, LM.rightHip].every((landmark) => landmarkAt(track, index, landmark).visibility >= 0.5);

  if (hipsVisible) {
    const hips = midpoint(track, index, LM.leftHip, LM.rightHip);
    const buttX = hips.x - ballSide * buttOffset;
    const off = (buttX - wallX) * ballSide;
    const tone = liveColor(off <= tolerance);
    const y = hips.y * height;

    if (off > 0.002) {
      context.strokeStyle = tone;
      context.lineWidth = 2.5 * scale;
      context.beginPath();
      context.moveTo(wallX * width, y);
      context.lineTo(buttX * width, y);
      context.stroke();
    }

    context.fillStyle = tone;
    context.strokeStyle = color.bg;
    context.lineWidth = 1 * scale;
    context.beginPath();
    context.arc(buttX * width, y, 5 * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}

/** Frames either side of Top that still show the lead arm lines. */
const LEAD_ARM_WINDOW = 2;

/**
 * Around the top: the shoulder plane (a dashed reference through both shoulders, extended) and the
 * lead arm (lead shoulder to wrist, live), with the angle between them.
 */
function drawLeadArm(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { topIndex, lead, ballSide }: NonNullable<CheckGuides["leadArm"]>,
  aspect: number,
  width: number,
  height: number,
  scale: number,
) {
  if (Math.abs(index - topIndex) > LEAD_ARM_WINDOW) {
    return;
  }

  const angle = leadArmAngle(track, index, lead, ballSide, aspect);

  if (angle === undefined) {
    return;
  }

  const { shoulder, trailShoulder, wrist } = leadArmLandmarks(lead);
  const s = landmarkAt(track, index, shoulder);
  const t = landmarkAt(track, index, trailShoulder);
  const w = landmarkAt(track, index, wrist);

  context.save();
  // Shoulder plane: from below the lead shoulder, through the trail shoulder and well beyond.
  dashed(context, scale);
  context.beginPath();
  context.moveTo(...along(s, t, -0.8, width, height));
  context.lineTo(...along(s, t, 4, width, height));
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = liveColor(Math.abs(angle) <= CHECK_TOLERANCES.leadArmDegrees);
  context.lineWidth = 2.5 * scale;
  context.beginPath();
  context.moveTo(...along(s, w, 0, width, height));
  context.lineTo(...along(s, w, 1.25, width, height));
  context.stroke();

  const [lx, ly] = along(s, w, 1.3, width, height);
  const rounded = Math.abs(Math.round(angle));
  label(context, rounded === 0 ? "on plane" : `${rounded}° ${angle >= 0 ? "above" : "below"}`, lx + 6 * scale, ly, scale);
  context.restore();
}
