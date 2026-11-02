import { describe, expect, it } from "vitest";
import { clampGeometry, createAnnotationBase } from "@/lib/analysis/annotations";
import { sampleSessions } from "@/lib/data/seed";
import { salvageSession } from "@/lib/storage/session-salvage";

const baseSession = sampleSessions[0];

function withPrimaryAnnotations(annotations: unknown[]) {
  return {
    ...baseSession,
    annotations: { primary: annotations, secondary: [] },
  };
}

const validLine = createAnnotationBase(
  "line",
  "primary",
  { kind: "line", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] },
  "#f97316",
  1,
);

describe("clampGeometry", () => {
  it("clamps points into the frame", () => {
    const geometry = clampGeometry({
      kind: "line",
      points: [{ x: -0.2, y: 0.5 }, { x: 1.3, y: 1.0001 }],
    });

    expect(geometry).toEqual({ kind: "line", points: [{ x: 0, y: 0.5 }, { x: 1, y: 1 }] });
  });

  it("keeps rectangles inside the frame", () => {
    const geometry = clampGeometry({
      kind: "rectangle",
      origin: { x: 0.8, y: -0.1 },
      size: { width: 0.5, height: 0.3 },
    });

    expect(geometry).toEqual({
      kind: "rectangle",
      origin: { x: 0.8, y: 0 },
      size: { width: expect.closeTo(0.2), height: 0.3 },
    });
  });

  it("allows circle radius above 1 (portrait clips) but caps it", () => {
    expect(clampGeometry({ kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 1.4 })).toMatchObject({
      radius: 1.4,
    });
    expect(clampGeometry({ kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 9 })).toMatchObject({
      radius: 2,
    });
  });

  it("is applied when creating annotations", () => {
    const annotation = createAnnotationBase(
      "freehand",
      "primary",
      { kind: "freehand", points: [{ x: -1, y: 0.2 }, { x: 0.4, y: 2 }] },
      "#fff",
      1,
    );

    expect(annotation.geometry).toEqual({
      kind: "freehand",
      points: [{ x: 0, y: 0.2 }, { x: 0.4, y: 1 }],
    });
  });
});

describe("salvageSession", () => {
  it("returns valid sessions untouched", () => {
    expect(salvageSession(baseSession)).toEqual({ session: baseSession, droppedCount: 0 });
  });

  it("repairs out-of-range shapes instead of rejecting the session", () => {
    const outOfRange = {
      ...validLine,
      id: "oob",
      geometry: { kind: "line", points: [{ x: 1.02, y: 0.4 }, { x: 0.3, y: -0.01 }] },
    };
    const result = salvageSession(withPrimaryAnnotations([validLine, outOfRange]));

    expect(result?.droppedCount).toBe(0);
    expect(result?.session.annotations.primary).toHaveLength(2);
    expect(result?.session.annotations.primary[1].geometry).toEqual({
      kind: "line",
      points: [{ x: 1, y: 0.4 }, { x: 0.3, y: 0 }],
    });
  });

  it("keeps large circles from portrait clips", () => {
    const circle = {
      ...validLine,
      id: "circle",
      type: "circle",
      geometry: { kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 1.3 },
    };

    expect(salvageSession(withPrimaryAnnotations([circle]))?.session.annotations.primary).toHaveLength(1);
  });

  it("drops only structurally broken annotations and markers", () => {
    const result = salvageSession({
      ...withPrimaryAnnotations([validLine, { id: "broken", geometry: null }]),
      snapshotMarkers: [...baseSession.snapshotMarkers, { id: "bad-marker", time: -5 }],
    });

    expect(result?.droppedCount).toBe(2);
    expect(result?.session.annotations.primary.map((a) => a.id)).toEqual([validLine.id]);
    expect(result?.session.snapshotMarkers).toHaveLength(baseSession.snapshotMarkers.length);
    expect(result?.session.title).toBe(baseSession.title);
  });

  it("returns null when the session itself is unusable", () => {
    expect(salvageSession(null)).toBeNull();
    expect(salvageSession({ ...baseSession, id: 42 })).toBeNull();
  });
});
