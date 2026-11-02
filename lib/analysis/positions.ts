import type { AnalysisPane, SnapshotMarker } from "@/lib/types";

/** The swing positions offered as one-click checkpoints in each pane. */
export const SWING_POSITIONS = [
  "Address",
  "Takeaway",
  "Top",
  "Transition",
  "Impact",
  "Finish",
] as const;

export type SwingPosition = (typeof SWING_POSITIONS)[number];

/** Labels compare case- and whitespace-insensitively ("top " matches "Top"). */
export function positionKey(label: string) {
  return label.trim().toLowerCase();
}

export function isSwingPosition(label: string) {
  return SWING_POSITIONS.some((position) => positionKey(position) === positionKey(label));
}

/**
 * Markers that belong to the clip currently loaded in `pane`. Markers record the video they
 * were placed on; legacy markers without one always count.
 */
export function paneMarkers(markers: SnapshotMarker[], pane: Pick<AnalysisPane, "id" | "videoId">) {
  return markers.filter(
    (marker) => marker.paneId === pane.id && (!marker.videoId || marker.videoId === pane.videoId),
  );
}

/** Earliest marker time per label (by position key) in one pane's markers. */
export function positionTimes(markers: SnapshotMarker[]) {
  const times = new Map<string, number>();

  for (const marker of [...markers].sort((a, b) => a.time - b.time)) {
    const key = positionKey(marker.label);

    if (!times.has(key)) {
      times.set(key, marker.time);
    }
  }

  return times;
}

/**
 * Sets a swing position in a pane, replacing any marker with the same label there so each
 * position has a single time per clip.
 */
export function upsertPositionMarker(
  markers: SnapshotMarker[],
  marker: SnapshotMarker,
): SnapshotMarker[] {
  const key = positionKey(marker.label);
  const kept = markers.filter(
    (existing) =>
      !(
        existing.paneId === marker.paneId &&
        positionKey(existing.label) === key &&
        (!existing.videoId || !marker.videoId || existing.videoId === marker.videoId)
      ),
  );

  return [...kept, marker];
}
