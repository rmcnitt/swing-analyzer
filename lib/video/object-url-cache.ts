type BlobLoader = () => Promise<Blob | null>;

/**
 * Owns object URLs created for stored blobs. Reuses the URL for a key across reloads (so a
 * playing <video> keeps its src), revokes URLs that are no longer needed via `retain`, and
 * revokes everything on `clear` (call on unmount).
 */
export class ObjectUrlCache {
  private entries = new Map<string, Promise<string | null>>();

  constructor(
    private readonly createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
    private readonly revokeUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
  ) {}

  resolve(key: string, load: BlobLoader): Promise<string | null> {
    const existing = this.entries.get(key);

    if (existing) {
      return existing;
    }

    const entry = load().then((blob) => (blob ? this.createUrl(blob) : null));
    this.entries.set(key, entry);
    // Don't cache misses; the blob may be written later.
    void entry.then((url) => {
      if (url === null && this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });

    return entry;
  }

  /** Revokes and forgets every key not in `keys`. */
  retain(keys: Iterable<string>) {
    const keep = new Set(keys);

    for (const key of [...this.entries.keys()]) {
      if (!keep.has(key)) {
        this.release(key);
      }
    }
  }

  release(key: string) {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    this.entries.delete(key);
    void entry.then((url) => {
      if (url) {
        this.revokeUrl(url);
      }
    });
  }

  clear() {
    this.retain([]);
  }
}
