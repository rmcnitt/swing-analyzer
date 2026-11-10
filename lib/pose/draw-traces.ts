import type { SwingTraces } from "@/lib/pose/swing-check";

export const TRACE_COLORS = {
  backswing: "#ff8a1f",
  downswing: "#38bdf8",
  followThrough: "rgba(245,245,244,0.45)",
  head: "#facc15",
} as const;

export interface TraceVisibility {
  hands: boolean;
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

  if (visible.hands && traces.hands) {
    const { points, top, impact } = traces.hands;
    const colorAt = (t: number) =>
      top === undefined || t <= top
        ? TRACE_COLORS.backswing
        : impact === undefined || t <= impact
          ? TRACE_COLORS.downswing
          : TRACE_COLORS.followThrough;

    context.lineWidth = 3 * scale;

    for (let i = 1; i < points.length; i += 1) {
      context.strokeStyle = colorAt(points[i].t);
      context.beginPath();
      context.moveTo(points[i - 1].x * width, points[i - 1].y * height);
      context.lineTo(points[i].x * width, points[i].y * height);
      context.stroke();
    }

    // Mark where the hands were at Top and Impact.
    for (const [time, color] of [
      [top, TRACE_COLORS.backswing],
      [impact, TRACE_COLORS.downswing],
    ] as const) {
      if (time === undefined) {
        continue;
      }

      const point = points.reduce((best, candidate) =>
        Math.abs(candidate.t - time) < Math.abs(best.t - time) ? candidate : best,
      );
      context.fillStyle = color;
      context.strokeStyle = "#0b0c0e";
      context.lineWidth = 1.5 * scale;
      context.beginPath();
      context.arc(point.x * width, point.y * height, 4.5 * scale, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

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
