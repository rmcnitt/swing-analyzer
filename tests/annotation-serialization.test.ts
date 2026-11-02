import { describe, expect, it } from "vitest";
import {
  createAnnotationBase,
  parseAnnotations,
  serializeAnnotations,
} from "@/lib/analysis/annotations";

describe("annotation serialization", () => {
  it("round-trips saved annotation data", () => {
    const annotations = [
      createAnnotationBase(
        "line",
        "primary",
        {
          kind: "line",
          points: [
            { x: 0.2, y: 0.1 },
            { x: 0.7, y: 0.9 },
          ],
        },
        "#f97316",
        1,
      ),
    ];

    const payload = serializeAnnotations(annotations);
    const restored = parseAnnotations(payload);

    expect(restored).toHaveLength(1);
    expect(restored[0].geometry.kind).toBe("line");
    expect(restored[0].geometry.points[0].x).toBeCloseTo(0.2);
  });
});
