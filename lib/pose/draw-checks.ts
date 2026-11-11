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
import type { SwingCheckId } from "@/lib/types";

export const CHECK_COLORS = {
  head: "#facc15",
  posture: "#34d399",
  extension: "#f472b6",
  shoulderPlane: "#38bdf8",
  leadArm: "#ff8a1f",
  warn: "#fbbf24",
} as const;

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
    drawHead(context, track, index, guides.head, width, height, scale);
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

/** Dashed ring where the head was at Address, solid ring where it is now, joined when apart. */
function drawHead(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { origin, radius, source }: NonNullable<CheckGuides["head"]>,
  width: number,
  height: number,
  scale: number,
) {
  const r = radius * height;
  const ox = origin.x * width;
  const oy = origin.y * height;

  context.strokeStyle = CHECK_COLORS.head;
  context.lineWidth = 2 * scale;
  context.setLineDash([6 * scale, 4 * scale]);
  context.beginPath();
  context.arc(ox, oy, r, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);

  if (!hasPose(track, index)) {
    return;
  }

  const now = headAt(track, index, source);
  const nx = now.x * width;
  const ny = now.y * height;

  context.lineWidth = 2.5 * scale;
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

  context.fillStyle = CHECK_COLORS.head;
  for (const [x, y] of [
    [ox, oy],
    [nx, ny],
  ]) {
    context.beginPath();
    context.arc(x, y, 2.5 * scale, 0, Math.PI * 2);
    context.fill();
  }
}

/** Point `t` of the way from `a` to `b` (beyond `b` when t > 1), in pixels. */
function along(a: Point2, b: Point2, t: number, width: number, height: number): [number, number] {
  return [(a.x + (b.x - a.x) * t) * width, (a.y + (b.y - a.y) * t) * height];
}

function label(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number) {
  context.font = `600 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
  context.textBaseline = "middle";
  const padding = 3 * scale;
  const textWidth = context.measureText(text).width;
  context.shadowBlur = 0;
  context.fillStyle = "rgba(0,0,0,0.7)";
  context.fillRect(x - padding, y - 8 * scale, textWidth + padding * 2, 16 * scale);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

/** Dashed line along the Address spine, solid line along the current spine with its angle. */
function drawPosture(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  { hips, shoulders }: NonNullable<CheckGuides["posture"]>,
  aspect: number,
  width: number,
  height: number,
  scale: number,
) {
  context.save();
  context.strokeStyle = CHECK_COLORS.posture;
  context.lineWidth = 2 * scale;
  context.setLineDash([7 * scale, 5 * scale]);
  context.beginPath();
  context.moveTo(...along(hips, shoulders, -0.15, width, height));
  context.lineTo(...along(hips, shoulders, 1.35, width, height));
  context.stroke();
  context.setLineDash([]);

  const angle = spineAngle(track, index, aspect);

  if (angle !== undefined) {
    const nowHips = midpoint(track, index, LM.leftHip, LM.rightHip);
    const nowShoulders = midpoint(track, index, LM.leftShoulder, LM.rightShoulder);
    context.lineWidth = 3 * scale;
    context.beginPath();
    context.moveTo(...along(nowHips, nowShoulders, 0, width, height));
    context.lineTo(...along(nowHips, nowShoulders, 1, width, height));
    context.stroke();

    // Label off the middle of the back (the side away from the lean), over the background.
    const [hx, hy] = along(nowHips, nowShoulders, 0.5, width, height);
    const leansRight = nowShoulders.x > nowHips.x;
    const text = `${Math.round(angle)}°`;
    context.font = `600 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
    const textWidth = context.measureText(text).width;
    label(context, text, leansRight ? hx - 26 * scale - textWidth : hx + 26 * scale, hy, CHECK_COLORS.posture, scale);
  }

  context.restore();
}

/**
 * The wall: a dashed vertical line at the butt at Address, and the butt now (a dot at hip height).
 * When the butt has come off the wall toward the ball, the gap is drawn, amber past tolerance.
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
  context.strokeStyle = CHECK_COLORS.extension;
  context.lineWidth = 2 * scale;
  context.setLineDash([7 * scale, 5 * scale]);
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
    const color = off > tolerance ? CHECK_COLORS.warn : CHECK_COLORS.extension;
    const y = hips.y * height;

    if (off > 0.002) {
      context.strokeStyle = color;
      context.lineWidth = 3 * scale;
      context.beginPath();
      context.moveTo(wallX * width, y);
      context.lineTo(buttX * width, y);
      context.stroke();
    }

    context.fillStyle = color;
    context.strokeStyle = "#0b0c0e";
    context.lineWidth = 1.5 * scale;
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
 * Around the top: the shoulder plane (a line through both shoulders, extended) and the lead arm
 * (lead shoulder to wrist), with the angle between them.
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
  context.strokeStyle = CHECK_COLORS.shoulderPlane;
  context.lineWidth = 2 * scale;
  context.setLineDash([7 * scale, 5 * scale]);
  context.beginPath();
  context.moveTo(...along(s, t, -0.8, width, height));
  context.lineTo(...along(s, t, 4, width, height));
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = CHECK_COLORS.leadArm;
  context.lineWidth = 3 * scale;
  context.beginPath();
  context.moveTo(...along(s, w, 0, width, height));
  context.lineTo(...along(s, w, 1.25, width, height));
  context.stroke();

  const tone = Math.abs(angle) <= CHECK_TOLERANCES.leadArmDegrees ? CHECK_COLORS.leadArm : CHECK_COLORS.warn;
  const [lx, ly] = along(s, w, 1.3, width, height);
  label(context, `${Math.abs(Math.round(angle))}° ${angle >= 0 ? "above" : "below"}`, lx + 6 * scale, ly, tone, scale);
  context.restore();
}
