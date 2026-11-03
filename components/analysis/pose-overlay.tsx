"use client";

import { useEffect, useRef } from "react";
import { drawSkeleton } from "@/lib/pose/draw-skeleton";
import { frameIndexNear, type PoseTrack } from "@/lib/pose/landmarks";
import type { TimeStore } from "@/lib/video/time-store";

interface PoseOverlayProps {
  track: PoseTrack;
  timeStore: TimeStore;
  width: number;
  height: number;
}

/**
 * Skeleton for the current frame, drawn on a canvas that sits over the video inside the
 * zoom/pan transform (so it lines up the same way annotations do). Redraws on every playhead
 * update without re-rendering React.
 */
export function PoseOverlay({ track, timeStore, width, height }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || width <= 0 || height <= 0) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    let lastIndex = -2;

    const draw = () => {
      const index = frameIndexNear(track, timeStore.get());

      if (index === lastIndex) {
        return;
      }

      lastIndex = index;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (index >= 0) {
        drawSkeleton(context, track, index, width, height);
      }
    };

    draw();
    return timeStore.subscribe(draw);
  }, [track, timeStore, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
}
