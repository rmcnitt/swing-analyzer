import {
  hasPose,
  landmarkAt,
  SKELETON_BONES,
  SKELETON_JOINTS,
  type PoseTrack,
  type Side,
} from "@/lib/pose/landmarks";

/** Below this the model is guessing (often an occluded limb); drawn faded. */
export const MIN_VISIBILITY = 0.5;

const SIDE_COLORS: Record<Side, string> = {
  left: "#ff8a1f",
  right: "#38bdf8",
  center: "#f5f5f4",
};

/**
 * Draws frame `index` of `track` into a `width`×`height` region of `context` (the video frame).
 * `scale` sizes lines/joints, so exports at native resolution look like the on-screen overlay.
 */
export function drawSkeleton(
  context: CanvasRenderingContext2D,
  track: PoseTrack,
  index: number,
  width: number,
  height: number,
  scale = 1,
) {
  if (!hasPose(track, index)) {
    return;
  }

  const at = (landmark: number) => {
    const point = landmarkAt(track, index, landmark);
    return { x: point.x * width, y: point.y * height, visible: point.visibility >= MIN_VISIBILITY };
  };

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [from, to, side] of SKELETON_BONES) {
    const a = at(from);
    const b = at(to);
    const faded = !a.visible || !b.visible;

    context.globalAlpha = faded ? 0.35 : 0.95;
    context.setLineDash(faded ? [4 * scale, 4 * scale] : []);
    context.strokeStyle = SIDE_COLORS[side];
    context.lineWidth = 2.5 * scale;
    context.shadowColor = "rgba(0,0,0,0.6)";
    context.shadowBlur = 3 * scale;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  context.setLineDash([]);
  context.shadowBlur = 0;

  for (const joint of SKELETON_JOINTS) {
    const point = at(joint);
    context.globalAlpha = point.visible ? 1 : 0.4;
    context.fillStyle = "#0b0c0e";
    context.strokeStyle = "#f5f5f4";
    context.lineWidth = 1.5 * scale;
    context.beginPath();
    context.arc(point.x, point.y, 3 * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}
