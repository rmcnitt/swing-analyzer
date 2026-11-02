import { describe, expect, it } from "vitest";
import { exportFileName, layoutSideBySide } from "@/lib/video/frame-export";

describe("layoutSideBySide", () => {
  it("scales frames to the shortest height without upscaling", () => {
    const layout = layoutSideBySide(
      [
        { width: 720, height: 1280 },
        { width: 1080, height: 1920 },
      ],
      8,
      40,
    );

    expect(layout.tiles).toEqual([
      { x: 0, y: 0, width: 720, height: 1280 },
      { x: 728, y: 0, width: 720, height: 1280 },
    ]);
    expect(layout.width).toBe(1448);
    expect(layout.height).toBe(1320);
  });

  it("handles a single frame", () => {
    const layout = layoutSideBySide([{ width: 1920, height: 1080 }], 8, 40);

    expect(layout.width).toBe(1920);
    expect(layout.tiles[0]).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});

describe("exportFileName", () => {
  it("slugs the title and stamps the time", () => {
    expect(exportFileName("Sample: face-on 7 iron", 2.4833)).toBe("sample-face-on-7-iron-0m02.48s.png");
    expect(exportFileName("???", 65.5)).toBe("swing-1m05.50s.png");
  });
});
