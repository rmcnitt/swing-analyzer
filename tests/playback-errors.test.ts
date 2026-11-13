import { describe, expect, it } from "vitest";
import {
  classifyMediaError,
  describePlaybackProblem,
  isLikelyHevc,
} from "@/lib/video/playback-errors";

describe("classifyMediaError", () => {
  it.each([
    [1, "network"],
    [2, "network"],
    [3, "decode"],
    [4, "unsupported"],
    [undefined, "unsupported"],
  ] as const)("code %s -> %s", (code, expected) => {
    expect(classifyMediaError(code)).toBe(expected);
  });
});

describe("describePlaybackProblem", () => {
  it("gives HEVC-specific guidance for iPhone .mov files", () => {
    expect(isLikelyHevc({ fileName: "IMG_4021.MOV" })).toBe(true);
    expect(describePlaybackProblem("unsupported", { fileName: "IMG_4021.MOV" }).detail).toContain(
      "HEVC",
    );
  });

  it("gives generic conversion advice otherwise", () => {
    const { detail } = describePlaybackProblem("unsupported", {
      fileName: "swing.webm",
      mimeType: "video/webm",
    });

    expect(detail).not.toContain("HEVC");
    expect(detail).toContain("H.264");
  });

  it("tells the user to trim a clip the browser couldn't store", () => {
    const { title, detail } = describePlaybackProblem("storage", { fileName: "IMG_4021.MOV" });

    expect(title).toContain("saved");
    expect(detail).toContain("Trim");
  });
});
