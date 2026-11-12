"use client";

import { Link2, Link2Off, ScanSearch } from "lucide-react";
import { positionKey, SWING_POSITIONS } from "@/lib/analysis/positions";
import type { MatchedCheckpoint } from "@/lib/analysis/sync";
import type { PaneId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ComparePositionBarProps {
  syncEnabled: boolean;
  positionsByPane: Record<PaneId, ReadonlyMap<string, number>>;
  checkpoints: MatchedCheckpoint[];
  onJumpBoth: (label: string) => void;
  onToggleSync: () => void;
  /** Panes whose clip has a golfer box (so "fit" can frame it). */
  framedPaneCount: number;
  onFitBoth: () => void;
}

function syncSummary(syncEnabled: boolean, checkpoints: MatchedCheckpoint[]) {
  if (!syncEnabled) {
    return "Sync off: panes play independently";
  }

  if (checkpoints.length >= 2) {
    return `Timing matched at ${checkpoints.length} positions`;
  }

  if (checkpoints.length === 1) {
    const label = SWING_POSITIONS.find((position) => positionKey(position) === checkpoints[0].key);
    return `Aligned at ${label ?? checkpoints[0].key}. Mark one more position in both to match tempo`;
  }

  return "Mark the same positions in both swings to line them up";
}

/** Compare-mode strip: sync status plus buttons that put both panes on the same position. */
export function ComparePositionBar({
  syncEnabled,
  positionsByPane,
  checkpoints,
  onJumpBoth,
  onToggleSync,
  framedPaneCount,
  onFitBoth,
}: ComparePositionBarProps) {
  const matchedKeys = new Set(checkpoints.map((checkpoint) => checkpoint.key));

  return (
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-panel border border-border bg-surface-1 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSync}
          aria-pressed={syncEnabled}
          title={syncEnabled ? "Turn sync off" : "Turn sync on"}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center border",
            syncEnabled
              ? "border-accent bg-accent-dim text-text"
              : "border-border text-text-muted hover:text-text",
          )}
        >
          {syncEnabled ? <Link2 className="size-3.5" /> : <Link2Off className="size-3.5" />}
        </button>
        <p className="truncate text-xs text-text-muted">
          {syncSummary(syncEnabled, checkpoints)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Jump both panes to a position">
          <span className="mr-1 hidden text-xs uppercase tracking-caps text-text-muted md:inline">
            Both to
          </span>
          {SWING_POSITIONS.map((label) => {
            const key = positionKey(label);
            const inPrimary = positionsByPane.primary.has(key);
            const inSecondary = positionsByPane.secondary.has(key);
            const available = inPrimary || inSecondary;
            const matched = matchedKeys.has(key);

            return (
              <button
                key={label}
                type="button"
                disabled={!available}
                onClick={() => onJumpBoth(label)}
                title={
                  matched
                    ? `Show ${label} in both swings`
                    : available
                      ? `${label} is only marked in the ${inPrimary ? "left" : "right"} swing`
                      : `Mark ${label} in a swing first`
                }
                className={cn(
                  "h-7 shrink-0 border px-2 text-xs pointer-coarse:h-9",
                  matched
                    ? "border-border-strong text-text hover:border-accent hover:bg-accent-dim"
                    : "border-dashed border-border text-text-muted hover:text-text",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onFitBoth}
          disabled={framedPaneCount === 0}
          title={
            framedPaneCount === 2
              ? "Zoom both panes so the golfers appear the same size"
              : "Use Fit in each pane's header to box the golfer first"
          }
          className="flex h-7 shrink-0 items-center gap-1 border border-border-strong px-2 text-xs text-text hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ScanSearch className="size-3.5" />
          Fit both
        </button>
      </div>
    </div>
  );
}
