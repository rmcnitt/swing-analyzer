import { describe, expect, it } from "vitest";
import { checksPanelPlacement } from "@/lib/analysis/checks-placement";

describe("checksPanelPlacement", () => {
  it("docks in narrow panes (phone, iPad compare)", () => {
    expect(checksPanelPlacement(390, 500, 9 / 16)).toBe("dock");
    expect(checksPanelPlacement(478, 1000, 9 / 16)).toBe("dock");
  });

  it("floats beside a portrait clip when the side margin fits the panel", () => {
    // Desktop single pane: 1030 wide, 620 tall → stage ~349 wide, ~340 px margin each side.
    expect(checksPanelPlacement(1030, 620, 9 / 16)).toBe("float");
  });

  it("docks when a portrait clip leaves no room beside it (desktop compare)", () => {
    expect(checksPanelPlacement(535, 620, 9 / 16)).toBe("dock");
    expect(checksPanelPlacement(685, 620, 9 / 16)).toBe("dock");
  });

  it("floats over a landscape clip's corner", () => {
    expect(checksPanelPlacement(685, 620, 16 / 9)).toBe("float");
  });

  it("floats until the pane has been measured", () => {
    expect(checksPanelPlacement(0, 0, 9 / 16)).toBe("float");
  });
});
