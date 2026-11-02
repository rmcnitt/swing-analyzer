"use client";

import { useState } from "react";
import {
  BookmarkPlus,
  Check,
  Database,
  FileText,
  ListChecks,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { PaneId, ProSwingReference, SnapshotMarker } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

interface SessionSidebarProps {
  sessionTitle: string;
  notes: string;
  syncEnabled: boolean;
  activePaneId: PaneId;
  markers: SnapshotMarker[];
  proSwings: ProSwingReference[];
  lastSavedAt: string | null;
  onNotesChange: (value: string) => void;
  onToggleSync: () => void;
  onSave: () => void;
  onAddMarker: (label?: string) => void;
  onSeekMarker: (marker: SnapshotMarker) => void;
  onRenameMarker: (markerId: string, label: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onLoadProSwing: (swingId: string) => void;
}

const markerLabels = [
  "Address",
  "Takeaway",
  "P2",
  "Top",
  "Transition",
  "P6",
  "Impact",
  "Finish",
  "Custom",
];

export function SessionSidebar({
  sessionTitle,
  notes,
  syncEnabled,
  activePaneId,
  markers,
  proSwings,
  lastSavedAt,
  onNotesChange,
  onToggleSync,
  onSave,
  onAddMarker,
  onSeekMarker,
  onRenameMarker,
  onDeleteMarker,
  onLoadProSwing,
}: SessionSidebarProps) {
  const [activeTab, setActiveTab] = useState<"notes" | "markers" | "session">("notes");
  const [markerLabel, setMarkerLabel] = useState("Impact");
  const [customMarkerLabel, setCustomMarkerLabel] = useState("");
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editingMarkerLabel, setEditingMarkerLabel] = useState("");
  const tabs = [
    { id: "notes" as const, label: "Notes", icon: FileText },
    { id: "markers" as const, label: "Markers", icon: ListChecks },
    { id: "session" as const, label: "Session", icon: Database },
  ];
  const commitMarkerRename = () => {
    if (!editingMarkerId) {
      return;
    }

    const nextLabel = editingMarkerLabel.trim();

    if (nextLabel) {
      onRenameMarker(editingMarkerId, nextLabel);
    }

    setEditingMarkerId(null);
    setEditingMarkerLabel("");
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[color:var(--color-border)] bg-[#0f1012]">
      <div className="border-b border-[color:var(--color-border)] px-2.5 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          Inspector
        </p>
        <h2 className="mt-1 truncate text-sm font-semibold text-white">{sessionTitle}</h2>
      </div>

      <div className="grid grid-cols-3 border-b border-[color:var(--color-border)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 border-r border-[color:var(--color-border)] text-xs last:border-r-0",
                activeTab === tab.id
                  ? "bg-[color:var(--color-accent)]/14 text-white"
                  : "text-[color:var(--color-muted)] hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {activeTab === "notes" ? (
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            className="h-full min-h-64 w-full resize-none border border-[color:var(--color-border)] bg-black/35 px-2.5 py-2.5 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-[color:var(--color-accent)]"
            placeholder="Session notes..."
          />
        ) : null}

        {activeTab === "markers" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <select
                value={markerLabel}
                onChange={(event) => setMarkerLabel(event.target.value)}
                className="h-9 border border-[color:var(--color-border)] bg-black/35 px-2 text-sm text-white outline-none focus:border-[color:var(--color-accent)]"
                aria-label="Marker label"
              >
                {markerLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>

              {markerLabel === "Custom" ? (
                <input
                  value={customMarkerLabel}
                  onChange={(event) => setCustomMarkerLabel(event.target.value)}
                  placeholder="Custom marker name"
                  className="h-9 border border-[color:var(--color-border)] bg-black/35 px-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[color:var(--color-accent)]"
                />
              ) : null}

              <button
                type="button"
                onClick={() =>
                  onAddMarker(
                    markerLabel === "Custom"
                      ? customMarkerLabel.trim() || "Custom marker"
                      : markerLabel,
                  )
                }
                className="inline-flex h-9 w-full items-center justify-center gap-2 bg-[color:var(--color-accent)] px-3 text-sm font-semibold text-[color:var(--color-ink)]"
              >
                <BookmarkPlus className="size-4" />
                Add at current time
              </button>
            </div>

            {markers.length === 0 ? (
              <p className="pt-2 text-sm text-[color:var(--color-muted)]">
                No markers yet.
              </p>
            ) : (
              [...markers]
                .sort((a, b) => a.time - b.time)
                .map((marker) => (
                  <div
                    key={marker.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-[color:var(--color-border)] bg-white/[0.025] px-2.5 py-2 hover:border-[color:var(--color-accent)] hover:bg-white/[0.04]"
                  >
                    {editingMarkerId === marker.id ? (
                      <input
                        value={editingMarkerLabel}
                        onChange={(event) => setEditingMarkerLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitMarkerRename();
                          }

                          if (event.key === "Escape") {
                            setEditingMarkerId(null);
                            setEditingMarkerLabel("");
                          }
                        }}
                        className="h-8 min-w-0 border border-[color:var(--color-accent)] bg-black/45 px-2 text-sm text-white outline-none"
                        autoFocus
                        aria-label="Rename marker"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSeekMarker(marker)}
                        className="min-w-0 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-white">
                          {marker.label}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] uppercase text-[color:var(--color-muted)]">
                          {marker.paneId} / {formatDuration(marker.time)}
                        </span>
                      </button>
                    )}

                    <span className="flex items-center gap-1">
                      {editingMarkerId === marker.id ? (
                        <>
                          <button
                            type="button"
                            onClick={commitMarkerRename}
                            className="flex size-7 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
                            aria-label="Save marker name"
                            title="Save marker name"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMarkerId(null);
                              setEditingMarkerLabel("");
                            }}
                            className="flex size-7 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
                            aria-label="Cancel marker rename"
                            title="Cancel marker rename"
                          >
                            <X className="size-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-[color:var(--color-accent)]">
                            {formatDuration(marker.time)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMarkerId(marker.id);
                              setEditingMarkerLabel(marker.label);
                            }}
                            className="flex size-7 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
                            aria-label={`Rename ${marker.label}`}
                            title="Rename marker"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMarker(marker.id)}
                            className="flex size-7 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
                            aria-label={`Delete ${marker.label}`}
                            title="Delete marker"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                ))
            )}
          </div>
        ) : null}

        {activeTab === "session" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleSync}
                className={cn(
                  "h-9 border px-3 text-sm font-medium",
                  syncEnabled
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/14 text-white"
                    : "border-[color:var(--color-border)] bg-white/[0.03] text-[color:var(--color-muted)]",
                )}
              >
                {syncEnabled ? "Sync on" : "Sync off"}
              </button>
              <button
                type="button"
                onClick={onSave}
                className="inline-flex h-9 items-center justify-center gap-2 bg-[color:var(--color-accent)] px-3 text-sm font-semibold text-[color:var(--color-ink)]"
              >
                <Save className="size-4" />
                Save
              </button>
            </div>

            <div className="border border-[color:var(--color-border)] bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                State
              </p>
              <p className="mt-2 text-sm text-white">Active pane: {activePaneId}</p>
              <p className="mt-1 text-sm text-[color:var(--color-muted)]">
                {lastSavedAt
                  ? `Saved locally ${new Date(lastSavedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Autosave ready"}
              </p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                Load reference
              </p>
              <div className="mt-2 space-y-2">
                {proSwings.map((swing) => (
                  <button
                    key={swing.id}
                    type="button"
                    onClick={() => onLoadProSwing(swing.id)}
                    className="w-full border border-[color:var(--color-border)] bg-white/[0.025] p-2.5 text-left hover:border-[color:var(--color-accent)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{swing.player}</p>
                        <p className="truncate text-xs text-[color:var(--color-muted)]">
                          {swing.club} / {swing.viewAngle}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-[color:var(--color-muted)]">
                        {formatDuration(swing.duration)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
