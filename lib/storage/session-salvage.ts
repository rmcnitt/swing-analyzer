import { clampGeometry } from "@/lib/analysis/annotations";
import { retireLegacyPositions } from "@/lib/analysis/positions";
import type { AnalysisSession, AnnotationObject } from "@/lib/types";
import {
  annotationSchema,
  looseAnnotationSchema,
  markerSchema,
  sessionSchema,
} from "@/lib/validation";

export interface SalvageResult {
  session: AnalysisSession;
  /** Annotations and markers that could not be repaired and were dropped. */
  droppedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repairAnnotation(value: unknown): AnnotationObject | null {
  const strict = annotationSchema.safeParse(value);

  if (strict.success) {
    return strict.data;
  }

  const loose = looseAnnotationSchema.safeParse(value);

  if (!loose.success) {
    return null;
  }

  const repaired = annotationSchema.safeParse({
    ...loose.data,
    geometry: clampGeometry(loose.data.geometry),
  });

  return repaired.success ? repaired.data : null;
}

/**
 * Validates a stored session record. If the record as a whole is invalid, repairs or drops
 * individual annotations/markers rather than discarding the session (which used to make the
 * workspace fall back to a blank shell and autosave over the user's work).
 *
 * Returns null only when the session's own fields (ids, panes, etc.) are unusable.
 */
export function salvageSession(record: unknown): SalvageResult | null {
  const direct = sessionSchema.safeParse(record);

  if (direct.success) {
    return { session: withCurrentPositions(direct.data), droppedCount: 0 };
  }

  if (!isRecord(record)) {
    return null;
  }

  let droppedCount = 0;
  const annotations = isRecord(record.annotations) ? record.annotations : {};
  const repairPane = (value: unknown) => {
    const items = Array.isArray(value) ? value : [];
    const repaired = items.map(repairAnnotation).filter((item) => item !== null);
    droppedCount += items.length - repaired.length;
    return repaired;
  };
  const markers = Array.isArray(record.snapshotMarkers) ? record.snapshotMarkers : [];
  const validMarkers = markers.filter((marker) => markerSchema.safeParse(marker).success);
  droppedCount += markers.length - validMarkers.length;

  const repaired = sessionSchema.safeParse({
    ...record,
    annotations: {
      primary: repairPane(annotations.primary),
      secondary: repairPane(annotations.secondary),
    },
    snapshotMarkers: validMarkers,
    panes: Array.isArray(record.panes)
      ? record.panes.map((pane) =>
          isRecord(pane) && typeof pane.currentTime === "number" && pane.currentTime < 0
            ? { ...pane, currentTime: 0 }
            : pane,
        )
      : record.panes,
  });

  return repaired.success ? { session: withCurrentPositions(repaired.data), droppedCount } : null;
}

/** Sessions saved before Takeaway / Transition were retired (see retireLegacyPositions). */
function withCurrentPositions(session: AnalysisSession): AnalysisSession {
  const snapshotMarkers = retireLegacyPositions(session.snapshotMarkers, {
    sample: session.userId === "sample",
  });
  return snapshotMarkers.length === session.snapshotMarkers.length ? session : { ...session, snapshotMarkers };
}
