import { describe, expect, it, vi } from "vitest";
import { ObjectUrlCache } from "@/lib/video/object-url-cache";

function setup() {
  let counter = 0;
  const create = vi.fn(() => `blob:${++counter}`);
  const revoke = vi.fn();
  const cache = new ObjectUrlCache(create, revoke);
  const blob = () => Promise.resolve(new Blob(["x"]));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { cache, create, revoke, blob, flush };
}

describe("ObjectUrlCache", () => {
  it("reuses the URL for a key instead of creating a new one", async () => {
    const { cache, create, blob } = setup();

    const first = await cache.resolve("video:a", blob);
    const second = await cache.resolve("video:a", blob);

    expect(first).toBe("blob:1");
    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("revokes URLs for keys that are no longer retained", async () => {
    const { cache, revoke, blob, flush } = setup();

    await cache.resolve("video:a", blob);
    await cache.resolve("video:b", blob);
    cache.retain(["video:b"]);
    await flush();

    expect(revoke).toHaveBeenCalledWith("blob:1");
    expect(revoke).not.toHaveBeenCalledWith("blob:2");
  });

  it("revokes everything on clear", async () => {
    const { cache, revoke, blob, flush } = setup();

    await cache.resolve("video:a", blob);
    await cache.resolve("thumbnail:a", blob);
    cache.clear();
    await flush();

    expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual(["blob:1", "blob:2"]);
  });

  it("does not cache missing blobs", async () => {
    const { cache, create, blob, flush } = setup();

    expect(await cache.resolve("video:a", () => Promise.resolve(null))).toBeNull();
    await flush();
    expect(await cache.resolve("video:a", blob)).toBe("blob:1");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
