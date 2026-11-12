import { describe, expect, it } from "vitest";
import { isTypingTarget, resolveShortcut, type KeyInput } from "@/lib/analysis/shortcuts";

const press = (key: string, modifiers: Partial<KeyInput> = {}) =>
  resolveShortcut({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...modifiers });

describe("resolveShortcut", () => {
  it("maps transport keys", () => {
    expect(press(" ")).toEqual({ type: "toggle-play" });
    expect(press("ArrowLeft")).toEqual({ type: "step", frames: -1 });
    expect(press("ArrowRight", { shiftKey: true })).toEqual({ type: "step", frames: 10 });
    expect(press("1")).toEqual({ type: "position", label: "Address" });
    expect(press("4")).toEqual({ type: "position", label: "Finish" });
    expect(press("5")).toBeNull();
    // Shift+digit reports "!" etc., so speeds read the physical key.
    expect(press("!", { code: "Digit1", shiftKey: true })).toEqual({ type: "speed", rate: 0.1 });
    expect(press("%", { code: "Digit5", shiftKey: true })).toEqual({ type: "speed", rate: 1 });
    expect(press("^", { code: "Digit6", shiftKey: true })).toBeNull();
    expect(press("2", { code: "Numpad2" })).toEqual({ type: "position", label: "Top" });
  });

  it("maps tool hotkeys case-insensitively, but not with modifiers", () => {
    expect(press("l")).toEqual({ type: "tool", tool: "line" });
    expect(press("G")).toEqual({ type: "tool", tool: "angle" });
    expect(press("l", { altKey: true })).toBeNull();
    expect(press("c", { metaKey: true })).toBeNull();
  });

  it("maps undo/redo on both platforms", () => {
    expect(press("z", { metaKey: true })).toEqual({ type: "undo" });
    expect(press("Z", { metaKey: true, shiftKey: true })).toEqual({ type: "redo" });
    expect(press("z", { ctrlKey: true })).toEqual({ type: "undo" });
    expect(press("y", { ctrlKey: true })).toEqual({ type: "redo" });
  });

  it("maps help, delete and escape", () => {
    expect(press("?", { shiftKey: true })).toEqual({ type: "toggle-help" });
    expect(press("Backspace")).toEqual({ type: "delete-selected" });
    expect(press("Escape")).toEqual({ type: "escape" });
  });
});

describe("isTypingTarget", () => {
  it("lets text fields keep their keys but not sliders or buttons", () => {
    const text = document.createElement("input");
    const range = document.createElement("input");
    range.type = "range";

    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(range)).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
