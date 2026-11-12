"use client";

import { useRef, type PointerEvent } from "react";
import { setLoopPoint } from "@/lib/analysis/loop";
import type { LoopRange, SnapshotMarker } from "@/lib/types";
import { clamp, formatDuration, formatTimecode } from "@/lib/utils";

interface TimelineProps {
  currentTime: number;
  duration: number;
  markers: SnapshotMarker[];
  /** Shown (with draggable in/out handles) while looping is on. */
  loop?: LoopRange;
  onSeek: (time: number) => void;
  onLoopChange: (loop: LoopRange) => void;
}

export function Timeline({ currentTime, duration, markers, loop, onSeek, onLoopChange }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const safeDuration = duration || 1;
  const percent = (time: number) => clamp((time / safeDuration) * 100, 0, 100);
  const progress = percent(currentTime);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect && rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) * safeDuration : 0;
  };

  const handleProps = (point: "start" | "end") => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = point;
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (draggingRef.current === point && loop) {
        onLoopChange(setLoopPoint(loop, point, timeAt(event.clientX), safeDuration));
      }
    },
    onPointerUp: () => {
      draggingRef.current = null;
    },
  });

  return (
    <div className="min-w-0 flex-1">
      <div ref={trackRef} className="relative h-5">
        <div className="absolute left-0 right-0 top-2 h-px bg-border-strong" />
        {loop ? (
          <div
            className="absolute top-1 h-2 bg-accent-dim"
            style={{ left: `${percent(loop.start)}%`, width: `${percent(loop.end) - percent(loop.start)}%` }}
          />
        ) : null}
        <div
          className="absolute left-0 top-2 h-px bg-accent"
          style={{ width: `${progress}%` }}
        />
        {markers.map((marker) => {
          const isActive = Math.abs(marker.time - currentTime) < 0.08;

          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSeek(marker.time)}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border border-bg/60 hover:bg-accent ${
                isActive
                  ? "size-2.5 bg-accent"
                  : "size-1.5 bg-text-muted"
              }`}
              style={{ left: `${percent(marker.time)}%` }}
              title={`${marker.label} - ${formatDuration(marker.time)}`}
              aria-label={`Seek to ${marker.label}`}
            >
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
                className="absolute top-0 h-5 w-3 -translate-x-1/2 cursor-ew-resize touch-none"
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
