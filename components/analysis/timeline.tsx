"use client";

import type { SnapshotMarker } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface TimelineProps {
  currentTime: number;
  duration: number;
  markers: SnapshotMarker[];
  onSeek: (time: number) => void;
}

export function Timeline({ currentTime, duration, markers, onSeek }: TimelineProps) {
  const safeDuration = duration || 1;
  const progress = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  return (
    <div className="min-w-0 flex-1">
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-2 h-px bg-white/15" />
        <div
          className="absolute left-0 top-2 h-px bg-[color:var(--color-accent)]"
          style={{ width: `${progress}%` }}
        />
        {markers.map((marker) => {
          const left = Math.min(100, Math.max(0, (marker.time / safeDuration) * 100));
          const isActive = Math.abs(marker.time - currentTime) < 0.08;

          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => onSeek(marker.time)}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border border-black/60 hover:bg-[color:var(--color-accent)] ${
                isActive
                  ? "size-2.5 bg-[color:var(--color-accent)]"
                  : "size-1.5 bg-white/55"
              }`}
              style={{ left: `${left}%` }}
              title={`${marker.label} - ${formatDuration(marker.time)}`}
              aria-label={`Seek to ${marker.label}`}
            >
              <span className="sr-only">
                {marker.label} {formatDuration(marker.time)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
