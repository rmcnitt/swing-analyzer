/**
 * Reads duration, display size and frame rate straight from an MP4/MOV (ISO BMFF / QuickTime)
 * header, without decoding. Used when the browser won't load a detached <video> to report
 * metadata (iOS Safari, especially in Low Power Mode), so a phone import never stalls.
 */

export interface ContainerMetadata {
  duration: number;
  /** Display size, with the track's rotation applied (iPhone portrait clips are stored landscape). */
  width: number;
  height: number;
  /** Average frame rate of the video track, or null if it couldn't be computed. */
  fps: number | null;
}

/** Reads `length` bytes at `offset` (fewer at end of file). */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

// The moov box holds only the index (a few hundred KB even for long clips); cap it defensively.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

interface Box {
  type: string;
  /** Payload start and end (exclusive), relative to the buffer it was read from. */
  start: number;
  end: number;
}

function fourcc(bytes: Uint8Array, at: number) {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function u64(view: DataView, at: number) {
  return view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);
}

/** Parses box headers in `bytes[from, to)`. */
function childBoxes(bytes: Uint8Array, from: number, to: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let at = from;

  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let header = 8;

    if (size === 1) {
      if (at + 16 > to) break;
      size = u64(view, at + 8);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }

    if (size < header || at + size > to) break;
    boxes.push({ type: fourcc(bytes, at + 4), start: at + header, end: at + size });
    at += size;
  }

  return boxes;
}

function find(bytes: Uint8Array, parent: Box, type: string) {
  return childBoxes(bytes, parent.start, parent.end).find((box) => box.type === type);
}

function readTrack(bytes: Uint8Array, trak: Box) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mdia = find(bytes, trak, "mdia");
  const hdlr = mdia && find(bytes, mdia, "hdlr");

  // hdlr: version/flags (4), pre_defined (4), handler_type (4).
  if (!hdlr || hdlr.end - hdlr.start < 12 || fourcc(bytes, hdlr.start + 8) !== "vide") {
    return null;
  }

  let width = 0;
  let height = 0;
  const tkhd = find(bytes, trak, "tkhd");

  if (tkhd) {
    const version = bytes[tkhd.start];
    // After version/flags: times + track id + reserved + duration (v0: 20 bytes, v1: 32).
    const matrixAt = tkhd.start + 4 + (version === 1 ? 32 : 20) + 8 + 8;
    const sizeAt = matrixAt + 36;

    if (sizeAt + 8 <= tkhd.end) {
      const a = view.getInt32(matrixAt) / 65536;
      const b = view.getInt32(matrixAt + 4) / 65536;
      width = Math.round(view.getUint32(sizeAt) / 65536);
      height = Math.round(view.getUint32(sizeAt + 4) / 65536);

      // A 90° or 270° rotation swaps the displayed width and height.
      if (Math.abs(b) > Math.abs(a)) {
        [width, height] = [height, width];
      }
    }
  }

  let fps: number | null = null;
  const mdhd = find(bytes, mdia, "mdhd");
  const stts = (() => {
    const minf = find(bytes, mdia, "minf");
    const stbl = minf && find(bytes, minf, "stbl");
    return stbl && find(bytes, stbl, "stts");
  })();

  if (mdhd && stts) {
    const version = bytes[mdhd.start];
    const timescaleAt = mdhd.start + 4 + (version === 1 ? 16 : 8);
    const timescale = view.getUint32(timescaleAt);
    const count = view.getUint32(stts.start + 4);
    let samples = 0;
    let ticks = 0;

    for (let i = 0; i < count && stts.start + 8 + i * 8 + 8 <= stts.end; i += 1) {
      const sampleCount = view.getUint32(stts.start + 8 + i * 8);
      samples += sampleCount;
      ticks += sampleCount * view.getUint32(stts.start + 12 + i * 8);
    }

    if (timescale > 0 && ticks > 0 && samples > 1) {
      fps = Math.round(((samples * timescale) / ticks) * 100) / 100;
    }
  }

  return { width, height, fps };
}

/** Parses a moov box payload. Exported for tests. */
export function parseMoov(bytes: Uint8Array): ContainerMetadata | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const root: Box = { type: "moov", start: 0, end: bytes.byteLength };
  const mvhd = find(bytes, root, "mvhd");

  if (!mvhd) {
    return null;
  }

  const version = bytes[mvhd.start];
  const timescaleAt = mvhd.start + 4 + (version === 1 ? 16 : 8);
  const timescale = view.getUint32(timescaleAt);
  const rawDuration = version === 1 ? u64(view, timescaleAt + 4) : view.getUint32(timescaleAt + 4);
  const duration = timescale > 0 ? rawDuration / timescale : 0;

  for (const trak of childBoxes(bytes, 0, bytes.byteLength).filter((box) => box.type === "trak")) {
    const track = readTrack(bytes, trak);

    if (track && track.width > 0 && track.height > 0) {
      return { duration, ...track };
    }
  }

  return null;
}

/** Walks the top-level boxes (moov is often at the end of camera files) and parses moov. */
export async function readContainerMetadata(
  read: ByteReader,
  fileSize: number,
): Promise<ContainerMetadata | null> {
  let at = 0;

  while (at + 8 <= fileSize) {
    const head = await read(at, 16);

    if (head.byteLength < 8) return null;

    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    let header = 8;

    if (size === 1) {
      if (head.byteLength < 16) return null;
      size = u64(view, 8);
      header = 16;
    } else if (size === 0) {
      size = fileSize - at;
    }

    if (size < header) return null;

    if (fourcc(head, 4) === "moov") {
      if (size - header > MAX_MOOV_BYTES) return null;
      return parseMoov(await read(at + header, size - header));
    }

    at += size;
  }

  return null;
}

/** Reads container metadata from a File/Blob. */
export function readBlobContainerMetadata(blob: Blob) {
  return readContainerMetadata(
    async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
    blob.size,
  ).catch(() => null);
}
