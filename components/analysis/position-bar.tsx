"use client";

import { useState, useSyncExternalStore } from "react";
import { Crosshair, Pencil, Plus, WandSparkles, X } from "lucide-react";
import { frameIndexAt } from "@/lib/analysis/frames";
import { positionKey, SWING_POSITIONS } from "@/lib/analysis/positions";
import type { SnapshotMarker } from "@/lib/types";
import type { TimeStore } from "@/lib/video/time-store";
import { cn, formatTimecode } from "@/lib/utils";

interface PositionBarProps {
  timeStore: TimeStore;
  fps?: number;
  /** Marked time per position key in this pane's clip. */
  positions: ReadonlyMap<string, number>;
  /** Position keys that were detected from the pose rather than marked by hand. */
  detected: ReadonlySet<string>;
  /** User-named markers on this pane's clip, earliest first. */
  custom: SnapshotMarker[];
  /** Name offered for the next custom marker. */
  nextCustomLabel: string;
  canAutoDetect: boolean;
  onAutoDetect: () => void;
  onJump: (label: string) => void;
  /** Sets (or moves) a swing position to the current frame. */
  onMark: (label: string) => void;
  onClearPosition: (label: string) => void;
  onAddCustom: (label: string) => void;
  onSeekCustom: (marker: SnapshotMarker) => void;
  /** Moves a custom marker to the current frame. */
  onMoveCustom: (markerId: string) => void;
  onRenameCustom: (markerId: string, label: string) => void;
  onDeleteCustom: (markerId: string) => void;
  className?: string;
}

/** Position chips (DESIGN.md): 28px, mono; unmarked faint outline, marked text, current accent. */
const chip = "h-7 shrink-0 border px-2 font-mono text-xs pointer-coarse:h-9";
const chipState = (state: "unmarked" | "marked" | "current") =>
  state === "current"
    ? "border-accent bg-accent-dim text-text"
    : state === "marked"
      ? "border-border-strong text-text hover:border-text-muted"
      : "border-text-faint/60 text-text-muted hover:border-text-muted hover:text-text";
const iconButton =
  "flex h-7 w-6 shrink-0 items-center justify-center border text-text-muted hover:text-text pointer-coarse:h-9 pointer-coarse:w-8";

/**
 * The pane's marker row: the six swing positions, then any custom markers, then "Custom" to add
 * one. An unmarked position is set at the current frame; a marked chip jumps there. In Edit mode a
 * chip click moves it to the current frame, × clears it, and custom names can be changed.
 */
export function PositionBar({
  timeStore,
  fps,
  positions,
  detected,
  custom,
  nextCustomLabel,
  canAutoDetect,
  onAutoDetect,
  onJump,
  onMark,
  onClearPosition,
  onAddCustom,
  onSeekCustom,
  onMoveCustom,
  onRenameCustom,
  onDeleteCustom,
  className,
}: PositionBarProps) {
  const currentTime = useSyncExternalStore(timeStore.subscribe, timeStore.get, () => 0);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const currentFrame = frameIndexAt(currentTime, fps);
  const isHere = (time: number) => frameIndexAt(time, fps) === currentFrame;

  return (
    <div className={cn("mt-1.5 flex items-center gap-1 overflow-x-auto", className)} role="group" aria-label="Swing positions">
      <button
        type="button"
        onClick={() => setEditing((current) => !current)}
        aria-pressed={editing}
        title={editing ? "Done editing" : "Edit markers: move to this frame, rename or remove"}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 border px-1.5 text-xs pointer-coarse:h-9",
          editing
            ? "border-accent bg-accent-dim text-text"
            : "border-border text-text-muted hover:border-border-strong hover:text-text",
        )}
      >
        <Pencil className="size-3.5" />
        {editing ? "Done" : "Edit"}
      </button>

      {SWING_POSITIONS.map((label) => {
        const time = positions.get(positionKey(label));
        const isSet = time !== undefined;
        const here = isSet && isHere(time);
        const isDetected = isSet && detected.has(positionKey(label));

        return (
          <span key={label} className="flex shrink-0">
            <button
              type="button"
              onClick={() => (editing || !isSet ? onMark(label) : onJump(label))}
              title={
                editing || !isSet
                  ? `Mark ${label} at this frame`
                  : `Jump to ${label} (${formatTimecode(time)})${isDetected ? " · detected from pose" : ""}`
              }
              className={cn(
                chip,
                editing && isSet ? "border-r-0" : null,
                editing
                  ? "border-dashed border-accent text-text hover:bg-accent-dim"
                  : chipState(here ? "current" : isSet ? "marked" : "unmarked"),
              )}
            >
              {label}
            </button>
            {editing && isSet ? (
              <button
                type="button"
                onClick={() => onClearPosition(label)}
                className={cn(iconButton, "border-dashed border-accent")}
                aria-label={`Clear ${label}`}
                title={`Clear ${label}`}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}

      {custom.length > 0 ? <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden /> : null}

      {custom.map((marker) =>
        editing ? (
          <span key={marker.id} className="flex shrink-0">
            <input
              defaultValue={marker.label}
              size={Math.max(4, marker.label.length)}
              aria-label={`Rename ${marker.label}`}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== marker.label) {
                  onRenameCustom(marker.id, next);
                } else {
                  event.target.value = marker.label;
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.currentTarget.value = marker.label;
                  event.currentTarget.blur();
                }
              }}
              className={cn(chip, "border-r-0 border-dashed border-accent bg-bg text-text")}
            />
            <button
              type="button"
              onClick={() => onMoveCustom(marker.id)}
              className={cn(iconButton, "border-x-0 border-dashed border-accent")}
              aria-label={`Move ${marker.label} to this frame`}
              title={`Move ${marker.label} to this frame`}
            >
              <Crosshair className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteCustom(marker.id)}
              className={cn(iconButton, "border-dashed border-accent")}
              aria-label={`Delete ${marker.label}`}
              title={`Delete ${marker.label}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <button
            key={marker.id}
            type="button"
            onClick={() => onSeekCustom(marker)}
            title={`Jump to ${marker.label} (${formatTimecode(marker.time)})`}
            className={cn(chip, chipState(isHere(marker.time) ? "current" : "marked"))}
          >
            {marker.label}
          </button>
        ),
      )}

      {adding ? (
        <input
          autoFocus
          placeholder={nextCustomLabel}
          size={Math.max(8, nextCustomLabel.length)}
          aria-label="New marker name"
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name) {
              onAddCustom(name);
            }
            setAdding(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onAddCustom(event.currentTarget.value.trim() || nextCustomLabel);
              event.currentTarget.value = "";
              setAdding(false);
            } else if (event.key === "Escape") {
              event.currentTarget.value = "";
              setAdding(false);
            }
          }}
          className={cn(chip, "border-accent bg-bg text-text placeholder:text-text-faint")}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add a named marker at this frame"
          className={cn(
            chip,
            "flex items-center gap-1 border-dashed border-border px-1.5 font-sans text-text-muted hover:border-border-strong hover:text-text",
          )}
        >
          <Plus className="size-3.5" />
          Custom
        </button>
      )}

      {canAutoDetect ? (
        <button
          type="button"
          onClick={onAutoDetect}
          title="Detect Address, Top, Impact and Finish from the pose (replaces those marks)"
          className="flex h-7 shrink-0 items-center gap-1 border border-border px-1.5 text-xs text-text-muted hover:border-border-strong hover:text-text pointer-coarse:h-9"
        >
          <WandSparkles className="size-3.5" />
          Auto
        </button>
      ) : null}
    </div>
  );
}
