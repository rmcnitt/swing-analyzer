import type { SwingTraces } from "@/lib/pose/swing-check";

export const TRACE_COLORS = {
  head: "#facc15",
} as const;

export interface TraceVisibility {
  head: boolean;
}

/**
 * Draws the swing-check traces into a `width`×`height` region (the video frame). `scale` sizes
 * lines like the on-screen overlay, so PNG exports at native resolution match it.
 */
export function drawSwingTraces(
  context: CanvasRenderingContext2D,
  traces: SwingTraces,
  visible: TraceVisibility,
  width: number,
  height: number,
  scale = 1,
) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0,0,0,0.65)";
  context.shadowBlur = 3 * scale;

  if (visible.head && traces.head) {
    const { points, radius } = traces.head;
    const origin = points[0];

    context.strokeStyle = TRACE_COLORS.head;
    context.lineWidth = 2 * scale;
    context.setLineDash([6 * scale, 4 * scale]);
    context.beginPath();
    context.arc(origin.x * width, origin.y * height, radius * height, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    context.lineWidth = 2.5 * scale;
    context.beginPath();
    points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    const last = points.at(-1)!;
    context.fillStyle = TRACE_COLORS.head;
    context.beginPath();
    context.arc(last.x * width, last.y * height, 3.5 * scale, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}
