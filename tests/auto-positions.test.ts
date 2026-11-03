import { describe, expect, it } from "vitest";
import {
  addDetectedPositions,
  applyAutoPositions,
  autoPositionsKey,
  detectedPositionKeys,
} from "@/lib/pose/auto-positions";
import type { AnalysisSession, SnapshotMarker } from "@/lib/types";

let counter = 0;
const createId = () => `m${(counter += 1)}`;

const manualTop: SnapshotMarker = { id: "top", paneId: "primary", videoId: "a", label: "Top", time: 2 };
const detected = { Address: 1, Top: 2.5, Impact: 2.8, Finish: 3.2 };

function session(overrides: Partial<AnalysisSession> = {}): AnalysisSession {
  return {
    id: "s",
    userId: "u",
    title: "t",
    primaryVideoId: "a",
    syncEnabled: false,
    playbackDefaults: { speed: 1 },
    notes: "",
    lastOpenedAt: "2026-11-03T00:00:00.000Z",
    panes: [
      { id: "primary", label: "P", videoId: "a", overlayVisible: true, playbackRate: 1, currentTime: 0 },
      { id: "secondary", label: "S", videoId: "b", overlayVisible: true, playbackRate: 1, currentTime: 0 },
    ],
    annotations: { primary: [], secondary: [] },
    snapshotMarkers: [],
    ...overrides,
  };
}

describe("addDetectedPositions", () => {
  it("fills in unmarked positions and keeps the user's own", () => {
    const { markers, added } = addDetectedPositions([manualTop], { id: "primary", videoId: "a" }, detected, {
      createId,
    });

    expect(added).toBe(3);
    expect(markers.find((marker) => marker.label === "Top")).toBe(manualTop);
    expect(markers.find((marker) => marker.label === "Impact")).toMatchObject({
      time: 2.8,
      source: "pose",
      videoId: "a",
    });
  });

  it("replaces existing marks when overwriting", () => {
    const { markers } = addDetectedPositions([manualTop], { id: "primary", videoId: "a" }, detected, {
      overwrite: true,
      createId,
    });

    expect(markers.filter((marker) => marker.label === "Top")).toEqual([
      expect.objectContaining({ time: 2.5, source: "pose" }),
    ]);
  });
});

describe("applyAutoPositions", () => {
  it("waits for clips whose pose isn't ready", () => {
    const current = session();
    expect(applyAutoPositions(current, () => undefined, createId)).toBe(current);
  });

  it("applies once per clip, even when no swing is found", () => {
    const next = applyAutoPositions(session(), (videoId) => (videoId === "a" ? null : undefined), createId);

    expect(next.panes[0].autoPositionsFor).toBe(autoPositionsKey("a"));
    expect(next.panes[1].autoPositionsFor).toBeUndefined();
    expect(next.snapshotMarkers).toEqual([]);
    expect(applyAutoPositions(next, () => detected, createId).snapshotMarkers).toHaveLength(4);
  });

  it("re-detects after a detection update, keeping the user's own marks", () => {
    const old: SnapshotMarker = { id: "o", paneId: "primary", videoId: "a", label: "Finish", time: 3, source: "pose" };
    const current = session({
      snapshotMarkers: [manualTop, old],
      panes: session().panes.map((pane) => ({ ...pane, autoPositionsFor: `${pane.videoId}@1` })),
    });

    const next = applyAutoPositions(current, (videoId) => (videoId === "a" ? detected : null), createId);
    const labels = (label: string) => next.snapshotMarkers.filter((marker) => marker.label === label);

    expect(labels("Top")).toEqual([manualTop]);
    expect(labels("Finish")).toEqual([expect.objectContaining({ time: 3.2, source: "pose" })]);
    expect(next.panes[0].autoPositionsFor).toBe(autoPositionsKey("a"));
  });

  it("turns sync on when both swings get shared positions", () => {
    const next = applyAutoPositions(session(), () => detected, createId);

    expect(next.snapshotMarkers).toHaveLength(8);
    expect(next.syncEnabled).toBe(true);
  });

  it("leaves sync off when only one swing has positions", () => {
    const next = applyAutoPositions(session(), (videoId) => (videoId === "a" ? detected : null), createId);
    expect(next.syncEnabled).toBe(false);
  });
});

describe("detectedPositionKeys", () => {
  it("lists positions whose current mark came from detection", () => {
    const markers: SnapshotMarker[] = [
      manualTop,
      { id: "i", paneId: "primary", videoId: "a", label: "Impact", time: 2.8, source: "pose" },
    ];

    expect([...detectedPositionKeys(markers)]).toEqual(["impact"]);
  });
});
