import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readContainerMetadata } from "@/lib/video/container";

function readerFor(file: string) {
  const bytes = new Uint8Array(readFileSync(path.join(__dirname, "..", file)));
  return {
    size: bytes.byteLength,
    read: async (offset: number, length: number) => bytes.subarray(offset, offset + length),
  };
}

describe("readContainerMetadata", () => {
  it("reads a portrait iPhone-style .mov (rotated, moov at the end)", async () => {
    const { read, size } = readerFor("tests/fixtures/video/rotated-60fps.mov");

    expect(await readContainerMetadata(read, size)).toEqual({
      duration: 1,
      width: 48,
      height: 64,
      fps: 60,
    });
  });

  it("reads the bundled sample MP4", async () => {
    const { read, size } = readerFor("public/samples/sample-down-the-line.mp4");
    const metadata = await readContainerMetadata(read, size);

    expect(metadata).toMatchObject({ width: 720, height: 1280, fps: 60 });
    expect(metadata?.duration).toBeCloseTo(5.58, 1);
  });

  it("returns null for data that isn't a container", async () => {
    const bytes = new TextEncoder().encode("definitely not a video file");

    expect(
      await readContainerMetadata(async (o, l) => bytes.subarray(o, o + l), bytes.byteLength),
    ).toBeNull();
  });
});
