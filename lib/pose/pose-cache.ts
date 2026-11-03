"use client";

import { FRAME_STRIDE, POSE_TRACK_VERSION, type PoseTrack } from "@/lib/pose/landmarks";

/**
 * Pose tracks live in their own IndexedDB database, separate from sessions and videos, so the
 * feature can be cleared (or removed) without touching the main library's schema.
 */
const dbName = "swing-analyzer-pose";
const dbVersion = 1;
const storeName = "tracks";

function openPoseDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "videoId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openPoseDb();

  if (!db) {
    return null;
  }

  try {
    return await new Promise<T | null>((resolve) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

function isPoseTrack(value: unknown): value is PoseTrack {
  const track = value as PoseTrack | null;

  return Boolean(
    track &&
      track.version === POSE_TRACK_VERSION &&
      typeof track.videoId === "string" &&
      Array.isArray(track.times) &&
      track.data instanceof Float32Array &&
      track.data.length === track.times.length * FRAME_STRIDE,
  );
}

export async function loadPoseTrack(videoId: string) {
  const value = await run("readonly", (store) => store.get(videoId));
  return isPoseTrack(value) ? value : null;
}

export async function savePoseTrack(track: PoseTrack) {
  await run("readwrite", (store) => store.put(track));
}

export async function deletePoseTracks(videoIds: string[]) {
  if (videoIds.length === 0) {
    return;
  }

  const db = await openPoseDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    videoIds.forEach((id) => store.delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  db.close();
}
