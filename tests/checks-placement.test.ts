import { describe, expect, it } from "vitest";
import { checksPanelPlacement } from "@/lib/analysis/checks-placement";

describe("checksPanelPlacement", () => {
  it("docks in narrow panes (phone, iPad compare)", () => {
    expect(checksPanelPlacement(390, 500, 9 / 16)).toBe("below");
    expect(checksPanelPlacement(478, 1000, 9 / 16)).toBe("below");
  });

  it("floats beside a portrait clip when the side margin fits the panel", () => {
    // Desktop single pane: 1030 wide, 620 tall → stage ~349 wide, ~340 px margin each side.
    expect(checksPanelPlacement(1030, 620, 9 / 16)).toBe("float");
  });

  it("docks beside a portrait clip when the margins together fit the panel (desktop compare)", () => {
    // 685 wide, 745 tall → stage ~419 wide, 266 px spare: not enough; 700 tall → 394, 291 spare.
    expect(checksPanelPlacement(685, 700, 9 / 16)).toBe("side");
    expect(checksPanelPlacement(685, 745, 9 / 16)).toBe("below");
  });

  it("docks below when a portrait clip leaves no room beside it", () => {
    expect(checksPanelPlacement(535, 620, 9 / 16)).toBe("below");
  });

  it("floats over a landscape clip's corner", () => {
    expect(checksPanelPlacement(685, 620, 16 / 9)).toBe("float");
  });

  it("on a phone on its side, docks beside a portrait clip to keep the video's height", () => {
    // Half of an 844×390 landscape phone in compare: a 9:16 clip is ~138px wide.
    expect(checksPanelPlacement(416, 245, 9 / 16, { compact: true })).toBe("side");
    // Too little margin (or a landscape clip): below.
    expect(checksPanelPlacement(300, 245, 9 / 16, { compact: true })).toBe("below");
    expect(checksPanelPlacement(416, 245, 16 / 9, { compact: true })).toBe("below");
  });

  it("floats until the pane has been measured", () => {
    expect(checksPanelPlacement(0, 0, 9 / 16)).toBe("float");
  });
});
