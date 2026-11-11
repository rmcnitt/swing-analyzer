import { describe, expect, it } from "vitest";
import { nearestCorner } from "@/lib/analysis/corner";

describe("nearestCorner", () => {
  it("picks the quadrant the point is in", () => {
    expect(nearestCorner(10, 10, 400, 300)).toBe("top-left");
    expect(nearestCorner(390, 20, 400, 300)).toBe("top-right");
    expect(nearestCorner(30, 280, 400, 300)).toBe("bottom-left");
    expect(nearestCorner(250, 200, 400, 300)).toBe("bottom-right");
  });
});
