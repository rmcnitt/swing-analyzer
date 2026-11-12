"use client";

import { useRef, type PointerEvent } from "react";
import { setLoopPoint } from "@/lib/analysis/loop";
import { layoutPoint, layoutRect } from "@/lib/analysis/screen-rotation";
import type { LoopRange, SnapshotMarker } from "@/lib/types";
import { frameDuration } from "@/lib/analysis/frames";
import { clamp, cn, formatDuration, formatTimecode } from "@/lib/utils";

interface TimelineProps {
  currentTime: number;
  duration: number;
  fps?: number;
  markers: SnapshotMarker[];
  /** Shown (with draggable in/out handles) while looping is on. */
  loop?: LoopRange;
  onSeek: (time: number) => void;
  onLoopChange: (loop: LoopRange) => void;
}

/**
 * The scrubber: a 2px track (played part muted), an accent playhead and loop handles, and swing
 * markers as small ticks. A native range input sits on top for dragging and keyboard seeking.
 */
export function Timeline({ currentTime, duration, fps, markers, loop, onSeek, onLoopChange }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const safeDuration = duration || 1;
  const percent = (time: number) => clamp((time / safeDuration) * 100, 0, 100);
  const progress = percent(currentTime);

  /** Time under the pointer; layout coordinates, so the handles also work in turned phone compare. */
  const timeAt = (x: number) => {
    const rect = trackRef.current ? layoutRect(trackRef.current) : null;
    return rect && rect.width ? clamp((x - rect.left) / rect.width, 0, 1) * safeDuration : 0;
  };

  const handleProps = (point: "start" | "end") => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = point;
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingRef.current === point && loop) {
        onLoopChange(setLoopPoint(loop, point, timeAt(layoutPoint(event.clientX, event.clientY).x), safeDuration));
      }
    },
    onPointerUp: () => {
      draggingRef.current = null;
    },
  });

  return (
    <div className="min-w-0 flex-1">
      <div ref={trackRef} className="relative h-6 pointer-coarse:h-10">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border" />
        {loop ? (
          <div
            className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 bg-accent-dim"
            style={{ left: `${percent(loop.start)}%`, width: `${percent(loop.end) - percent(loop.start)}%` }}
          />
        ) : null}
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-text-muted"
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={frameDuration(fps)}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="timeline-scrubber absolute inset-0 h-full w-full cursor-pointer"
          aria-label="Scrub video"
        />
        {markers.map((marker) => {
          const isActive = Math.abs(marker.time - currentTime) < 0.08;

          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSeek(marker.time)}
              className="group absolute top-1/2 flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 justify-center rounded-none pointer-coarse:h-5"
              style={{ left: `${percent(marker.time)}%` }}
              title={`${marker.label} - ${formatDuration(marker.time)}`}
              aria-label={`Seek to ${marker.label}`}
            >
              <span
                className={cn(
                  "block h-full w-px",
                  isActive ? "bg-accent" : "bg-text-muted group-hover:bg-text",
                )}
              />
              <span className="sr-only">
                {marker.label} {formatDuration(marker.time)}
              </span>
            </button>
          );
        })}
        {loop
          ? (["start", "end"] as const).map((point) => (
              <button
                key={point}
                type="button"
                {...handleProps(point)}
                className="absolute top-0 h-full w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded-none"
                style={{ left: `${percent(loop[point])}%` }}
                aria-label={point === "start" ? "Loop in point" : "Loop out point"}
                title={`Loop ${point === "start" ? "in" : "out"} ${formatTimecode(loop[point])} (drag, or ${point === "start" ? "[" : "]"} at current frame)`}
              >
                <span className="mx-auto block h-full w-0.5 bg-accent" />
              </button>
            ))
          : null}
      </div>
    </div>
  );
}
