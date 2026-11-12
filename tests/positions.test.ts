import { describe, expect, it } from "vitest";
import {
  clearPositionMarker,
  customMarkers,
  isSwingPosition,
  markerRow,
  nextCustomLabel,
  paneMarkers,
  positionTimes,
  retireLegacyPositions,
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

describe("custom markers", () => {
  it("lists only non-position markers, earliest first", () => {
    const markers = [
      marker({ id: "a", label: "Lag", time: 2 }),
      marker({ id: "b", label: "Top", time: 1 }),
      marker({ id: "c", label: "P2", time: 0.5 }),
    ];
    expect(customMarkers(markers).map((m) => m.id)).toEqual(["c", "a"]);
  });

  it("names the next custom marker without reusing a name", () => {
    expect(nextCustomLabel([])).toBe("Custom 1");
    expect(nextCustomLabel([marker({ label: "Custom 1" }), marker({ label: "custom 2 " })])).toBe("Custom 3");
  });

  it("clears a position only on the pane's current clip", () => {
    const markers = [
      marker({ id: "a", label: "Top", videoId: "v1" }),
      marker({ id: "b", label: "Top", videoId: "v2" }),
      marker({ id: "c", label: "Top", paneId: "secondary", videoId: "v1" }),
      marker({ id: "d", label: "Impact", videoId: "v1" }),
    ];
    const kept = clearPositionMarker(markers, { id: "primary", videoId: "v1" }, "top");
    expect(kept.map((m) => m.id)).toEqual(["b", "c", "d"]);
  });
});

describe("markerRow", () => {
  const label = (item: ReturnType<typeof markerRow>[number]) =>
    item.kind === "position" ? item.label : item.marker.label;

  it("starts every clip with Address, Top, Impact and Finish", () => {
    expect(markerRow(new Map(), []).map(label)).toEqual(["Address", "Top", "Impact", "Finish"]);
  });

  it("puts custom markers where they fall in the swing", () => {
    const positions = new Map([
      ["address", 1.5],
      ["top", 2.5],
      ["impact", 2.8],
      ["finish", 3.5],
    ]);
    const row = markerRow(positions, [
      marker({ id: "a", label: "Halfway back", time: 2.0 }),
      marker({ id: "b", label: "Waggle", time: 0.5 }),
      marker({ id: "c", label: "Release", time: 2.9 }),
    ]);
    expect(row.map(label)).toEqual(["Waggle", "Address", "Halfway back", "Top", "Impact", "Release", "Finish"]);
  });

  it("keeps unmarked positions in their place", () => {
    const row = markerRow(new Map([["address", 1.5]]), [marker({ id: "a", label: "P2", time: 2 })]);
    expect(row.map(label)).toEqual(["Address", "P2", "Top", "Impact", "Finish"]);
  });
});

describe("retireLegacyPositions", () => {
  it("drops an old Takeaway / Transition sitting on another marker's frame", () => {
    const markers = [
      marker({ id: "address", label: "Address", time: 1.5 }),
      marker({ id: "takeaway", label: "Takeaway", time: 1.505 }),
      marker({ id: "impact", label: "Impact", time: 2.8 }),
      marker({ id: "transition", label: "Transition", time: 2.8 }),
    ];
    expect(retireLegacyPositions(markers).map((item) => item.id)).toEqual(["address", "impact"]);
  });

  it("keeps a deliberate one, which then shows as a custom marker", () => {
    const markers = [
      marker({ id: "address", label: "Address", time: 1.5 }),
      marker({ id: "takeaway", label: "Takeaway", time: 1.85 }),
    ];
    expect(retireLegacyPositions(markers)).toHaveLength(2);
    expect(customMarkers(markers).map((item) => item.id)).toEqual(["takeaway"]);
  });

  it("only compares markers on the same pane", () => {
    const markers = [
      marker({ id: "address", label: "Address", time: 1.5, paneId: "secondary" }),
      marker({ id: "takeaway", label: "Takeaway", time: 1.5 }),
    ];
    expect(retireLegacyPositions(markers)).toHaveLength(2);
  });

  it("removes them all from the bundled samples", () => {
    const markers = [marker({ id: "takeaway", label: "Takeaway", time: 1.85 })];
    expect(retireLegacyPositions(markers, { sample: true })).toEqual([]);
  });
});
