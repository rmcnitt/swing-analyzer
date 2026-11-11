import { hasPose, type PoseTrack } from "@/lib/pose/landmarks";
import { headAt, type CheckGuides } from "@/lib/pose/swing-check";
import type { SwingCheckId } from "@/lib/types";

export const CHECK_COLORS = {
  head: "#facc15",
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
