import { color } from "@/lib/design/tokens";

/** A captured pane frame (video + drawings) and the caption printed under it. */
export interface FrameCapture {
  canvas: HTMLCanvasElement;
  caption: string;
}

interface Size {
  width: number;
  height: number;
}

export interface TileLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EXPORT_GAP = 8;
export const CAPTION_HEIGHT = 44;

/**
 * Places frames side by side at a common height (the smallest, so nothing is upscaled), each
 * with a caption strip underneath.
 */
export function layoutSideBySide(sizes: Size[], gap = EXPORT_GAP, captionHeight = CAPTION_HEIGHT) {
  const height = Math.min(...sizes.map((size) => size.height));
  let x = 0;
  const tiles: TileLayout[] = sizes.map((size) => {
    const width = Math.round((size.width / size.height) * height);
    const tile = { x, y: 0, width, height };
    x += width + gap;
    return tile;
  });

  return {
    tiles,
    width: Math.max(0, x - gap),
    height: height + captionHeight,
    captionHeight,
  };
}

/** e.g. "my-swing-0m02.48s.png" — safe on every filesystem. */
export function exportFileName(title: string, time: number) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "swing";
  const minutes = Math.floor(time / 60);
  const seconds = (time - minutes * 60).toFixed(2).padStart(5, "0");

  return `${slug}-${minutes}m${seconds}s.png`;
}

/** Draws the captures into one image with captions. Browser-only (uses canvas). */
export function composeCaptures(captures: FrameCapture[]) {
  const layout = layoutSideBySide(captures.map(({ canvas }) => canvas));
  const output = document.createElement("canvas");
  output.width = layout.width;
  output.height = layout.height;
  const context = output.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D is unavailable");
  }

  context.fillStyle = color.bg;
  context.fillRect(0, 0, output.width, output.height);

  captures.forEach(({ canvas, caption }, index) => {
    const tile = layout.tiles[index];
    context.drawImage(canvas, tile.x, tile.y, tile.width, tile.height);
    context.fillStyle = color.text;
    context.font = "600 18px ui-sans-serif, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.fillText(caption, tile.x + 12, tile.height + layout.captionHeight / 2, tile.width - 24);
  });

  return output;
}

export function downloadCanvas(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode PNG"));
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // Give the download a moment to start before releasing the blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}
