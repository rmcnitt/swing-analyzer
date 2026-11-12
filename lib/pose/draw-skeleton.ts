import {
  hasPose,
  landmarkAt,
  SKELETON_BONES,
  SKELETON_JOINTS,
  type PoseTrack,
} from "@/lib/pose/landmarks";
import { color } from "@/lib/design/tokens";

/** Below this the model is guessing (often an occluded limb); drawn faded. */
export const MIN_VISIBILITY = 0.5;

/** Skeleton lines and joints: neutral, so the check marks (accent/warn) stand out on top. */
const SKELETON_ALPHA = 0.7;
const FADED_ALPHA = 0.3;

/**
 * Draws frame `index` of `track` into a `width`×`height` region of `context` (the video frame), in
 * `--text` at 70% with a 1px `--bg` outline. `scale` sizes lines/joints, so exports at native
 * resolution look like the on-screen overlay.
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
  const lineWidth = 2 * scale;
  const outline = 1 * scale;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  // Outlines first, then the lines over them, so a joint where bones meet stays one clean shape.
  for (const pass of ["outline", "line"] as const) {
    for (const [from, to] of SKELETON_BONES) {
      const a = at(from);
      const b = at(to);
      const faded = !a.visible || !b.visible;

      context.globalAlpha = faded ? FADED_ALPHA : SKELETON_ALPHA;
      context.setLineDash(faded ? [4 * scale, 4 * scale] : []);
      context.strokeStyle = pass === "outline" ? color.bg : color.text;
      context.lineWidth = pass === "outline" ? lineWidth + outline * 2 : lineWidth;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  context.setLineDash([]);

  for (const joint of SKELETON_JOINTS) {
    const point = at(joint);
    context.globalAlpha = point.visible ? SKELETON_ALPHA : FADED_ALPHA;
    context.fillStyle = color.text;
    context.strokeStyle = color.bg;
    context.lineWidth = outline;
    context.beginPath();
    context.arc(point.x, point.y, 2.5 * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.restore();
}
