"use client";

import { useState, useSyncExternalStore } from "react";
import { Crosshair } from "lucide-react";
import { frameIndexAt } from "@/lib/analysis/frames";
import { positionKey, SWING_POSITIONS } from "@/lib/analysis/positions";
import type { TimeStore } from "@/lib/video/time-store";
import { cn, formatTimecode } from "@/lib/utils";

interface PositionBarProps {
  timeStore: TimeStore;
  fps?: number;
  /** Marked time per position key in this pane's clip. */
  positions: ReadonlyMap<string, number>;
  onJump: (label: string) => void;
  onMark: (label: string) => void;
}

/**
 * One-click swing positions for a pane. An unmarked position is set at the current frame; a
 * marked one jumps there. "Set" re-marks the next position clicked at the current frame.
 */
export function PositionBar({ timeStore, fps, positions, onJump, onMark }: PositionBarProps) {
  const currentTime = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);
  const [markMode, setMarkMode] = useState(false);
  const currentFrame = frameIndexAt(currentTime, fps);

  return (
    // Hidden in very narrow panes (phones); positions stay reachable from the Markers tab.
    <div className="mt-1.5 hidden items-center gap-1 overflow-x-auto @sm:flex" role="group" aria-label="Swing positions">
      <button
        type="button"
        onClick={() => setMarkMode((current) => !current)}
        aria-pressed={markMode}
        title={markMode ? "Cancel" : "Set a position at the current frame"}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 border px-1.5 text-[11px] pointer-coarse:h-9",
          markMode
            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-[color:var(--color-ink)]"
            : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/25 hover:text-white",
        )}
      >
        <Crosshair className="size-3.5" />
        Set
      </button>

      {SWING_POSITIONS.map((label) => {
        const time = positions.get(positionKey(label));
        const isSet = time !== undefined;
        const isHere = isSet && frameIndexAt(time, fps) === currentFrame;

        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (markMode || !isSet) {
                onMark(label);
                setMarkMode(false);
              } else {
                onJump(label);
              }
            }}
            title={
              markMode || !isSet
                ? `Mark ${label} at this frame`
                : `Jump to ${label} (${formatTimecode(time)})`
            }
            className={cn(
              "h-7 shrink-0 border px-2 text-[11px] transition pointer-coarse:h-9",
              markMode
                ? "border-dashed border-[color:var(--color-accent)] text-white hover:bg-[color:var(--color-accent)]/20"
                : isHere
                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/20 text-white"
                  : isSet
                    ? "border-white/20 text-white hover:border-[color:var(--color-accent)]"
                    : "border-dashed border-white/12 text-[color:var(--color-muted)] hover:border-white/30 hover:text-white",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
