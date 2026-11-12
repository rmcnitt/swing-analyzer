import type { AnalysisPane, SnapshotMarker } from "@/lib/types";

/**
 * The swing positions every clip starts with (the ones pose detection can find). Anything else
 * is a custom marker the user adds by name.
 */
export const SWING_POSITIONS = ["Address", "Top", "Impact", "Finish"] as const;

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

/** Markers that aren't one of the standard swing positions (user-named), earliest first. */
export function customMarkers(markers: SnapshotMarker[]) {
  return markers.filter((marker) => !isSwingPosition(marker.label)).sort((a, b) => a.time - b.time);
}

/** A name for the next custom marker in a pane: "Custom 1", "Custom 2", … skipping names in use. */
export function nextCustomLabel(markers: SnapshotMarker[]) {
  const used = new Set(markers.map((marker) => positionKey(marker.label)));
  let index = 1;

  while (used.has(positionKey(`Custom ${index}`))) {
    index += 1;
  }

  return `Custom ${index}`;
}

/** Removes a swing position's marker(s) from one pane's clip (the inverse of upsertPositionMarker). */
export function clearPositionMarker(
  markers: SnapshotMarker[],
  pane: Pick<AnalysisPane, "id" | "videoId">,
  label: string,
): SnapshotMarker[] {
  const key = positionKey(label);
  const onClip = new Set(paneMarkers(markers, pane).map((marker) => marker.id));
  return markers.filter((marker) => !(onClip.has(marker.id) && positionKey(marker.label) === key));
}

export type MarkerRowItem =
  | { kind: "position"; label: SwingPosition; time?: number }
  | { kind: "custom"; marker: SnapshotMarker };

/**
 * The pane's marker row in swing order: the four positions, with each custom marker placed
 * after the last marked position at or before its time (unmarked positions keep their place).
 */
export function markerRow(
  positions: ReadonlyMap<string, number>,
  custom: SnapshotMarker[],
): MarkerRowItem[] {
  const row: MarkerRowItem[] = SWING_POSITIONS.map((label) => ({
    kind: "position",
    label,
    time: positions.get(positionKey(label)),
  }));

  for (const marker of [...custom].sort((a, b) => a.time - b.time)) {
    let index = 0;

    row.forEach((item, at) => {
      const time = item.kind === "position" ? item.time : item.marker.time;

      if (time !== undefined && time <= marker.time) {
        index = at + 1;
      }
    });

    row.splice(index, 0, { kind: "custom", marker });
  }

  return row;
}

/** Positions the app used to offer: never detected, and tapping one marked wherever the playhead was. */
const RETIRED_POSITIONS = new Set(["takeaway", "transition"]);
/** Closer than this (seconds, under a frame at 50 fps) counts as the same frame. */
const SAME_FRAME = 0.02;

/**
 * Old Takeaway / Transition marks: dropped from the bundled samples and wherever they sit on the
 * same frame as another marker on that clip (set by accident); any others stay as custom markers.
 */
export function retireLegacyPositions(markers: SnapshotMarker[], { sample = false } = {}) {
  const retired = (marker: SnapshotMarker) => RETIRED_POSITIONS.has(positionKey(marker.label));

  return markers.filter((marker) => {
    if (!retired(marker)) {
      return true;
    }

    if (sample) {
      return false;
    }

    return !markers.some(
      (other) =>
        other !== marker &&
        !retired(other) &&
        other.paneId === marker.paneId &&
        (!other.videoId || !marker.videoId || other.videoId === marker.videoId) &&
        Math.abs(other.time - marker.time) < SAME_FRAME,
    );
  });
}
