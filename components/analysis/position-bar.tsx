"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Crosshair, Pencil, Plus, WandSparkles, X } from "lucide-react";
import { frameIndexAt } from "@/lib/analysis/frames";
import { markerRow, positionKey } from "@/lib/analysis/positions";
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
  /** Re-detects the four positions; returns how many were set, or null when no swing was found. */
  onAutoDetect: () => number | null;
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
 * The pane's marker row, in swing order: Address, Top, Impact and Finish, with custom markers
 * where they fall in the clip. An unmarked position is set at the current frame; a marked chip
 * jumps there. "Set" then a chip moves that marker to the current frame (the quick fix when
 * detection is off). Edit renames custom markers and removes markers. Auto re-runs detection.
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
  const [mode, setMode] = useState<"normal" | "set" | "edit">("normal");
  const [adding, setAdding] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const currentFrame = frameIndexAt(currentTime, fps);
  const isHere = (time: number) => frameIndexAt(time, fps) === currentFrame;
  const setting = mode === "set";
  const editing = mode === "edit";

  // Escape leaves Set without moving anything.
  useEffect(() => {
    if (!setting) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMode("normal");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setting]);

  useEffect(() => {
    if (!autoNote) {
      return;
    }

    const timer = window.setTimeout(() => setAutoNote(null), 3000);
    return () => window.clearTimeout(timer);
  }, [autoNote]);

  const runAuto = () => {
    const count = onAutoDetect();
    setMode("normal");
    setAutoNote(
      count === null ? "No swing found" : `Set ${count} position${count === 1 ? "" : "s"} from pose`,
    );
  };

  const pickable = "border-dashed border-accent text-text hover:bg-accent-dim";

  return (
    <div className={cn("mt-1.5 flex items-center gap-1 overflow-x-auto", className)} role="group" aria-label="Swing positions">
      <button
        type="button"
        onClick={() => setMode(setting ? "normal" : "set")}
        aria-pressed={setting}
        title={setting ? "Cancel (Esc)" : "Set a marker to this frame: press, then pick the marker"}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 border px-1.5 text-xs pointer-coarse:h-9",
          setting
            ? "border-accent bg-accent-dim text-text"
            : "border-border text-text hover:border-border-strong",
        )}
      >
        <Crosshair className="size-3.5" />
        {setting ? "Pick one" : "Set"}
      </button>

      {markerRow(positions, custom).map((item) => {
        if (item.kind === "position") {
          const { label, time } = item;
          const isSet = time !== undefined;
          const isDetected = isSet && detected.has(positionKey(label));

          return (
            <span key={label} className="flex shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (setting || (!editing && !isSet)) {
                    onMark(label);
                    setMode("normal");
                  } else if (!editing) {
                    onJump(label);
                  }
                }}
                title={
                  setting || !isSet
                    ? `Set ${label} to this frame`
                    : `Jump to ${label} (${formatTimecode(time)})${isDetected ? " · detected from pose" : ""}`
                }
                className={cn(
                  chip,
                  "flex items-center gap-1",
                  editing && isSet ? "border-r-0" : null,
                  setting || editing
                    ? pickable
                    : chipState(isSet && isHere(time) ? "current" : isSet ? "marked" : "unmarked"),
                )}
              >
                {isDetected && !setting && !editing ? (
                  // Placed by pose detection; "Set" corrects it.
                  <span className="size-1 rounded-full bg-text-muted" aria-label="detected" />
                ) : null}
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
        }

        const { marker } = item;

        return editing ? (
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
            onClick={() => {
              if (setting) {
                onMoveCustom(marker.id);
                setMode("normal");
              } else {
                onSeekCustom(marker);
              }
            }}
            title={
              setting
                ? `Set ${marker.label} to this frame`
                : `Jump to ${marker.label} (${formatTimecode(marker.time)})`
            }
            className={cn(
              chip,
              setting ? pickable : chipState(isHere(marker.time) ? "current" : "marked"),
            )}
          >
            {marker.label}
          </button>
        );
      })}

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
          onClick={() => {
            setMode("normal");
            setAdding(true);
          }}
          title="Add a named marker at this frame; it takes its place in the row by time"
          className={cn(
            chip,
            "flex items-center gap-1 border-dashed border-border px-1.5 font-sans text-text-muted hover:border-border-strong hover:text-text",
          )}
        >
          <Plus className="size-3.5" />
          Custom
        </button>
      )}

      <button
        type="button"
        onClick={() => setMode(editing ? "normal" : "edit")}
        aria-pressed={editing}
        aria-label={editing ? "Done editing markers" : "Edit markers"}
        title={editing ? "Done" : "Rename custom markers or remove markers"}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 border px-1.5 text-xs pointer-coarse:h-9",
          editing
            ? "border-accent bg-accent-dim text-text"
            : "border-border text-text-muted hover:border-border-strong hover:text-text",
        )}
      >
        {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
        {editing ? "Done" : null}
      </button>

      {canAutoDetect ? (
        <button
          type="button"
          onClick={runAuto}
          title="Detect Address, Top, Impact and Finish from the pose (replaces those four)"
          className="flex h-7 shrink-0 items-center gap-1 border border-border px-1.5 text-xs text-text-muted hover:border-border-strong hover:text-text pointer-coarse:h-9"
        >
          <WandSparkles className="size-3.5" />
          Auto
        </button>
      ) : null}

      {autoNote ? (
        <span role="status" className="shrink-0 whitespace-nowrap px-1 text-sm text-text-muted">
          {autoNote}
        </span>
      ) : null}
    </div>
  );
}
