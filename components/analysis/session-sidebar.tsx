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
import type { PaneId, SnapshotMarker, VideoAsset } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

interface SessionSidebarProps {
  sessionTitle: string;
  notes: string;
  syncEnabled: boolean;
  activePaneId: PaneId;
  markers: SnapshotMarker[];
  references: VideoAsset[];
  lastSavedAt: string | null;
  onNotesChange: (value: string) => void;
  onToggleSync: () => void;
  onSave: () => void;
  onAddMarker: (label?: string) => void;
  onSeekMarker: (marker: SnapshotMarker) => void;
  onRenameMarker: (markerId: string, label: string) => void;
  onDeleteMarker: (markerId: string) => void;
  onLoadReference: (videoId: string) => void;
  /** Shown as a close button when the inspector is a drawer (below xl). */
  onClose: () => void;
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
  references,
  lastSavedAt,
  onNotesChange,
  onToggleSync,
  onSave,
  onAddMarker,
  onSeekMarker,
  onRenameMarker,
  onDeleteMarker,
  onLoadReference,
  onClose,
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
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-surface-1">
      <div className="flex items-start justify-between gap-2 border-b border-border px-2.5 py-2.5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-caps text-text-muted">
            Inspector
          </p>
          <h2 className="mt-1 truncate text-sm font-semibold text-text">{sessionTitle}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text xl:hidden"
          aria-label="Close inspector"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 border-r border-border text-xs last:border-r-0",
                activeTab === tab.id
                  ? "bg-accent-dim text-text"
                  : "text-text-muted hover:bg-surface-2 hover:text-text",
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
            className="h-full min-h-64 w-full resize-none border border-border bg-bg px-2.5 py-2.5 text-sm leading-6 text-text placeholder:text-text-muted focus:border-border-strong"
            placeholder="Session notes..."
          />
        ) : null}

        {activeTab === "markers" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <select
                value={markerLabel}
                onChange={(event) => setMarkerLabel(event.target.value)}
                className="h-9 border border-border bg-bg px-2 text-sm text-text focus:border-border-strong"
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
                  className="h-9 border border-border bg-bg px-2 text-sm text-text placeholder:text-text-muted focus:border-border-strong"
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
                className="inline-flex h-9 w-full items-center justify-center gap-2 bg-accent px-3 text-sm font-semibold text-bg"
              >
                <BookmarkPlus className="size-4" />
                Add at current time
              </button>
            </div>

            {markers.length === 0 ? (
              <p className="pt-2 text-sm text-text-muted">
                No markers yet.
              </p>
            ) : (
              [...markers]
                .sort((a, b) => a.time - b.time)
                .map((marker) => (
                  <div
                    key={marker.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-border bg-surface-2 px-2.5 py-2 hover:border-accent hover:bg-surface-2"
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
                        className="h-8 min-w-0 border border-accent bg-bg px-2 text-sm text-text"
                        autoFocus
                        aria-label="Rename marker"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSeekMarker(marker)}
                        className="min-w-0 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-text">
                          {marker.label}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs uppercase text-text-muted">
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
                            className="flex size-7 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text"
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
                            className="flex size-7 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text"
                            aria-label="Cancel marker rename"
                            title="Cancel marker rename"
                          >
                            <X className="size-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-accent">
                            {formatDuration(marker.time)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMarkerId(marker.id);
                              setEditingMarkerLabel(marker.label);
                            }}
                            className="flex size-7 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text"
                            aria-label={`Rename ${marker.label}`}
                            title="Rename marker"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMarker(marker.id)}
                            className="flex size-7 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text"
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
                    ? "border-accent bg-accent-dim text-text"
                    : "border-border bg-surface-2 text-text-muted",
                )}
              >
                {syncEnabled ? "Sync on" : "Sync off"}
              </button>
              <button
                type="button"
                onClick={onSave}
                className="inline-flex h-9 items-center justify-center gap-2 bg-accent px-3 text-sm font-semibold text-bg"
              >
                <Save className="size-4" />
                Save
              </button>
            </div>

            <div className="border border-border bg-surface-2 p-3">
              <p className="text-xs uppercase tracking-caps text-text-muted">
                State
              </p>
              <p className="mt-2 text-sm text-text">Active pane: {activePaneId}</p>
              <p className="mt-1 text-sm text-text-muted">
                {lastSavedAt
                  ? `Saved locally ${new Date(lastSavedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Autosave ready"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-caps text-text-muted">
                Load reference
              </p>
              <div className="mt-2 space-y-2">
                {references.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    No references yet. Import a clip on the home screen with &ldquo;Save as
                    reference&rdquo; turned on.
                  </p>
                ) : null}
                {references.map((swing) => (
                  <button
                    key={swing.id}
                    type="button"
                    onClick={() => onLoadReference(swing.id)}
                    className="w-full border border-border bg-surface-2 p-2.5 text-left hover:border-accent"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{swing.title}</p>
                        <p className="truncate text-xs text-text-muted">
                          {swing.clubTag} / {swing.orientation}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-text-muted">
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
