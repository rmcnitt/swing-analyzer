import { paneMarkers, positionKey, positionTimes, upsertPositionMarker } from "@/lib/analysis/positions";
import { matchCheckpoints } from "@/lib/analysis/sync";
import type { DetectedPositions } from "@/lib/pose/swing-positions";
import type { AnalysisSession, PaneId, SnapshotMarker } from "@/lib/types";

/** Shared positions needed before turning sync on by itself (one is only an offset). */
const AUTO_SYNC_MIN_CHECKPOINTS = 2;

/**
 * Bump when detection changes: clips detected with an older version are re-detected, and the
 * marks detection placed (never the user's own) are updated.
 */
export const DETECTION_VERSION = 2;

/** What `AnalysisPane.autoPositionsFor` holds once a clip's positions were detected. */
export const autoPositionsKey = (videoId: string) => `${videoId}@${DETECTION_VERSION}`;

/**
 * Adds detected positions to a pane's clip as markers tagged `source: "pose"`. By default only
 * positions that are unmarked or were themselves detected are set, so the user's own marks
 * always win; `overwrite` replaces those too (the "Auto" button).
 */
export function addDetectedPositions(
  markers: SnapshotMarker[],
  pane: { id: PaneId; videoId: string },
  detected: DetectedPositions,
  { overwrite = false, createId }: { overwrite?: boolean; createId: () => string },
) {
  const current = paneMarkers(markers, pane);
  const marked = positionTimes(current);
  const detectedKeys = detectedPositionKeys(current);
  let next = markers;
  let added = 0;

  for (const [label, time] of Object.entries(detected)) {
    const key = positionKey(label);
    const markedByHand = marked.has(key) && !detectedKeys.has(key);

    if (time === undefined || (!overwrite && markedByHand)) {
      continue;
    }

    next = upsertPositionMarker(next, {
      id: createId(),
      paneId: pane.id,
      videoId: pane.videoId,
      label,
      time: Number(time.toFixed(4)),
      source: "pose",
    });
    added += 1;
  }

  return { markers: next, added };
}

/**
 * Applies detection to every pane whose clip hasn't had it yet (`detect` returns undefined while
 * a clip's pose isn't ready). Records each clip as done, and turns sync on when this gave both
 * swings enough shared positions to match their timing.
 */
export function applyAutoPositions(
  session: AnalysisSession,
  detect: (videoId: string) => DetectedPositions | null | undefined,
  createId: () => string,
): AnalysisSession {
  let markers = session.snapshotMarkers;
  let added = 0;
  let changed = false;

  const panes = session.panes.map((pane) => {
    if (!pane.videoId || pane.autoPositionsFor === autoPositionsKey(pane.videoId)) {
      return pane;
    }

    const detected = detect(pane.videoId);

    if (detected === undefined) {
      return pane;
    }

    changed = true;

    if (detected) {
      const result = addDetectedPositions(markers, { id: pane.id, videoId: pane.videoId }, detected, {
        createId,
      });
      markers = result.markers;
      added += result.added;
    }

    return { ...pane, autoPositionsFor: autoPositionsKey(pane.videoId) };
  });

  if (!changed) {
    return session;
  }

  const positionsFor = (paneId: PaneId) => {
    const pane = panes.find((candidate) => candidate.id === paneId);
    return positionTimes(pane ? paneMarkers(markers, pane) : []);
  };
  const shared = matchCheckpoints(positionsFor("primary"), positionsFor("secondary")).length;

  return {
    ...session,
    panes,
    snapshotMarkers: markers,
    syncEnabled: session.syncEnabled || (added > 0 && shared >= AUTO_SYNC_MIN_CHECKPOINTS),
  };
}

/** Position keys in a pane's markers that were detected rather than marked by hand. */
export function detectedPositionKeys(markers: SnapshotMarker[]) {
  const times = positionTimes(markers);
  return new Set(
    markers
      .filter((marker) => marker.source === "pose" && times.get(positionKey(marker.label)) === marker.time)
      .map((marker) => positionKey(marker.label)),
  );
}
