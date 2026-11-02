import { describe, expect, it } from "vitest";
import {
  isSwingPosition,
  paneMarkers,
  positionTimes,
  upsertPositionMarker,
} from "@/lib/analysis/positions";
import type { SnapshotMarker } from "@/lib/types";

const marker = (overrides: Partial<SnapshotMarker>): SnapshotMarker => ({
  id: "m",
  paneId: "primary",
  label: "Top",
  time: 1,
  ...overrides,
});

describe("positions", () => {
  it("recognises swing positions regardless of case and spacing", () => {
    expect(isSwingPosition(" top ")).toBe(true);
    expect(isSwingPosition("P6")).toBe(false);
  });

  it("keeps only markers for the pane's current clip (and legacy ones)", () => {
    const markers = [
      marker({ id: "a", videoId: "clip-1" }),
      marker({ id: "b", videoId: "clip-2" }),
      marker({ id: "c" }),
      marker({ id: "d", paneId: "secondary", videoId: "clip-1" }),
    ];

    expect(paneMarkers(markers, { id: "primary", videoId: "clip-1" }).map((m) => m.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("uses the earliest marker when a label repeats", () => {
    const times = positionTimes([
      marker({ label: "Top", time: 2.5 }),
      marker({ label: "top", time: 2.4 }),
      marker({ label: "Impact", time: 2.8 }),
    ]);

    expect(times.get("top")).toBe(2.4);
    expect(times.get("impact")).toBe(2.8);
  });

  it("replaces the same position in the same pane and clip only", () => {
    const markers = [
      marker({ id: "old", videoId: "clip-1", time: 1 }),
      marker({ id: "other-pane", paneId: "secondary", videoId: "clip-2" }),
      marker({ id: "other-clip", videoId: "clip-3" }),
      marker({ id: "impact", label: "Impact", videoId: "clip-1" }),
    ];

    const next = upsertPositionMarker(markers, marker({ id: "new", label: "TOP", videoId: "clip-1", time: 1.2 }));

    expect(next.map((m) => m.id)).toEqual(["other-pane", "other-clip", "impact", "new"]);
  });
});
