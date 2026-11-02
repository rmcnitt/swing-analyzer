import type { AnnotationTool } from "@/lib/types";

/** Playback speeds offered in each pane; keys 1–5 pick them in order. */
export const SPEED_OPTIONS = [0.1, 0.25, 0.5, 0.75, 1] as const;

export const TOOL_HOTKEYS: Record<AnnotationTool, string> = {
  select: "V",
  "zoom-pan": "H",
  line: "L",
  arrow: "A",
  plane: "P",
  rectangle: "B",
  circle: "C",
  angle: "G",
  freehand: "D",
};

export type ShortcutAction =
  | { type: "toggle-play" }
  | { type: "step"; frames: number }
  | { type: "speed"; rate: number }
  | { type: "tool"; tool: AnnotationTool }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete-selected" }
  | { type: "toggle-overlay" }
  | { type: "toggle-help" }
  | { type: "escape" };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const toolsByKey = new Map(
  Object.entries(TOOL_HOTKEYS).map(([tool, key]) => [key.toLowerCase(), tool as AnnotationTool]),
);

/** Resolves a keydown to a workspace action, or null if the key isn't a shortcut. */
export function resolveShortcut({ key, shiftKey, metaKey, ctrlKey, altKey }: KeyInput): ShortcutAction | null {
  const command = metaKey || ctrlKey;
  const lower = key.toLowerCase();

  if (command) {
    if (lower === "z") {
      return shiftKey ? { type: "redo" } : { type: "undo" };
    }

    if (lower === "y" && ctrlKey) {
      return { type: "redo" };
    }

    return null;
  }

  if (altKey) {
    return null;
  }

  switch (key) {
    case " ":
      return { type: "toggle-play" };
    case "ArrowLeft":
      return { type: "step", frames: shiftKey ? -10 : -1 };
    case "ArrowRight":
      return { type: "step", frames: shiftKey ? 10 : 1 };
    case "Delete":
    case "Backspace":
      return { type: "delete-selected" };
    case "?":
      return { type: "toggle-help" };
    case "Escape":
      return { type: "escape" };
  }

  if (/^[1-9]$/.test(key)) {
    const rate = SPEED_OPTIONS[Number(key) - 1];
    return rate === undefined ? null : { type: "speed", rate };
  }

  if (shiftKey) {
    return null;
  }

  if (lower === "o") {
    return { type: "toggle-overlay" };
  }

  const tool = toolsByKey.get(lower);
  return tool ? { type: "tool", tool } : null;
}

/** Elements where keys should type rather than trigger shortcuts. */
export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof (target as HTMLElement).tagName !== "string") {
    return false;
  }

  const element = target as HTMLElement;
  const tag = element.tagName;

  if (tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable) {
    return true;
  }

  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type;
    return !["range", "checkbox", "radio", "button", "submit", "file"].includes(type);
  }

  return false;
}

/** Shown in the `?` overlay. */
export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[keys: string, label: string]> }> = [
  {
    title: "Playback",
    items: [
      ["Space", "Play / pause"],
      ["← / →", "Previous / next frame"],
      ["⇧ ← / ⇧ →", "Back / forward 10 frames"],
      ["1 – 5", `Speed ${SPEED_OPTIONS.map((rate) => `${rate}x`).join(", ")}`],
    ],
  },
  {
    title: "Drawing",
    items: [
      [TOOL_HOTKEYS.select, "Move / select"],
      [TOOL_HOTKEYS["zoom-pan"], "Zoom / pan"],
      [TOOL_HOTKEYS.line, "Line"],
      [TOOL_HOTKEYS.arrow, "Arrow"],
      [TOOL_HOTKEYS.plane, "Plane line (edge to edge)"],
      [TOOL_HOTKEYS.rectangle, "Box"],
      [TOOL_HOTKEYS.circle, "Circle"],
      [TOOL_HOTKEYS.angle, "Angle"],
      [TOOL_HOTKEYS.freehand, "Freehand"],
      ["O", "Show / hide drawings"],
    ],
  },
  {
    title: "Edit",
    items: [
      ["⌘Z", "Undo"],
      ["⇧⌘Z", "Redo"],
      ["Delete", "Delete selected shape"],
      ["Drag", "Move a shape or its handles (Move tool)"],
      ["Esc", "Deselect / close"],
      ["?", "Show this list"],
    ],
  },
];
