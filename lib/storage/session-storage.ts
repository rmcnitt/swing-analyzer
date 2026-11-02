"use client";

import { sampleSessions, sampleVideos } from "@/lib/data/seed";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { salvageSession } from "@/lib/storage/session-salvage";
import { videoSchema } from "@/lib/validation";

const dbName = "swing-analyzer-local-library";
const dbVersion = 2;
const sessionStoreName = "sessions";
const videoStoreName = "videos";
const videoBlobStoreName = "video-blobs";
const thumbnailBlobStoreName = "thumbnail-blobs";
const metaStoreName = "meta";
const seededKey = "seeded-samples-v1";
const preferencePrefix = "swing-analyzer-ui";

type StoreName =
  | typeof sessionStoreName
  | typeof videoStoreName
  | typeof videoBlobStoreName
  | typeof thumbnailBlobStoreName
  | typeof metaStoreName;

function openLocalDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(sessionStoreName)) {
        db.createObjectStore(sessionStoreName, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(videoStoreName)) {
        db.createObjectStore(videoStoreName, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(videoBlobStoreName)) {
        db.createObjectStore(videoBlobStoreName);
      }

      if (!db.objectStoreNames.contains(thumbnailBlobStoreName)) {
        db.createObjectStore(thumbnailBlobStoreName);
      }

      if (!db.objectStoreNames.contains(metaStoreName)) {
        db.createObjectStore(metaStoreName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function runStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openLocalDb();

  if (!db) {
    return null;
  }

  const result = await new Promise<T | null>((resolve) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    transaction.onerror = () => resolve(null);
  });

  db.close();
  return result;
}

async function putRecord<T>(storeName: StoreName, value: T, key?: IDBValidKey) {
  const db = await openLocalDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    if (key) {
      store.put(value, key);
    } else {
      store.put(value);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });

  db.close();
}

async function getAllRecords<T>(storeName: StoreName) {
  return (await runStore<T[]>(storeName, "readonly", (store) => store.getAll())) ?? [];
}

async function getBlob(storeName: StoreName, id: string) {
  const blob = await runStore<Blob>(storeName, "readonly", (store) => store.get(id));
  return blob instanceof Blob ? blob : null;
}

export function loadVideoBlob(videoId: string) {
  return getBlob(videoBlobStoreName, videoId);
}

export function loadThumbnailBlob(videoId: string) {
  return getBlob(thumbnailBlobStoreName, videoId);
}

let seedPromise: Promise<void> | null = null;

/**
 * Writes the bundled sample sessions/videos into IndexedDB once per browser, so every page reads
 * the same stored data. Samples the user later deletes stay deleted.
 */
export function ensureLocalLibrarySeeded() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  seedPromise ??= (async () => {
    const seeded = await runStore<string>(metaStoreName, "readonly", (store) =>
      store.get(seededKey),
    );

    if (seeded) {
      return;
    }

    const [sessionKeys, videoKeys] = await Promise.all([
      runStore<IDBValidKey[]>(sessionStoreName, "readonly", (store) => store.getAllKeys()),
      runStore<IDBValidKey[]>(videoStoreName, "readonly", (store) => store.getAllKeys()),
    ]);
    const existingSessions = new Set(sessionKeys ?? []);
    const existingVideos = new Set(videoKeys ?? []);

    await Promise.all([
      ...sampleVideos
        .filter((video) => !existingVideos.has(video.id))
        .map((video) => saveStoredVideo(video)),
      ...sampleSessions
        .filter((session) => !existingSessions.has(session.id))
        .map((session) => saveStoredSession(session)),
    ]);
    await putRecord(metaStoreName, "true", seededKey);
  })();

  return seedPromise;
}

export type StoredSessionResult =
  | { status: "found"; session: AnalysisSession; droppedCount: number }
  | { status: "missing" }
  | { status: "corrupt" };

export async function loadStoredSession(sessionId: string): Promise<StoredSessionResult> {
  const record = await runStore<unknown>(sessionStoreName, "readonly", (store) =>
    store.get(sessionId),
  );

  if (!record) {
    return { status: "missing" };
  }

  const salvaged = salvageSession(record);

  if (!salvaged) {
    // Keep the raw record so nothing is lost if a later version can read it.
    await putRecord(metaStoreName, record, `corrupt-session:${sessionId}`);
    return { status: "corrupt" };
  }

  if (salvaged.droppedCount > 0) {
    console.warn(
      `Session ${sessionId}: dropped ${salvaged.droppedCount} invalid annotation(s)/marker(s).`,
    );
  }

  return { status: "found", ...salvaged };
}

export async function saveStoredSession(session: AnalysisSession) {
  await putRecord(sessionStoreName, session);
}

export async function loadStoredSessions() {
  const records = await getAllRecords<unknown>(sessionStoreName);

  return records
    .map((record) => salvageSession(record)?.session ?? null)
    .filter((session): session is AnalysisSession => Boolean(session));
}

export async function saveStoredVideo(
  video: VideoAsset,
  file?: Blob,
  thumbnail?: Blob | null,
) {
  await putRecord(videoStoreName, {
    ...video,
    url: file ? `indexeddb://${video.id}` : video.url,
    thumbnailUrl: thumbnail ? `indexeddb-thumbnail://${video.id}` : video.thumbnailUrl,
  });

  if (file) {
    await putRecord(videoBlobStoreName, file, video.id);
  }

  if (thumbnail) {
    await putRecord(thumbnailBlobStoreName, thumbnail, video.id);
  }
}

export async function updateStoredVideoMetadata(
  videoId: string,
  patch: Partial<Omit<VideoAsset, "id" | "url">>,
) {
  const record = await runStore<VideoAsset>(videoStoreName, "readonly", (store) =>
    store.get(videoId),
  );

  if (!record) {
    return;
  }

  await putRecord(videoStoreName, {
    ...record,
    ...patch,
  });
}

/**
 * Video metadata only. `url`/`thumbnailUrl` are placeholders (indexeddb://) for blob-backed
 * videos; resolve them with useStoredVideos, which manages the object URLs' lifetime.
 */
export async function loadStoredVideoRecords(): Promise<VideoAsset[]> {
  const records = await getAllRecords<unknown>(videoStoreName);

  return records
    .map((record) => {
      const parsed = videoSchema.safeParse(record);
      return parsed.success ? parsed.data : null;
    })
    .filter((video): video is VideoAsset => Boolean(video));
}

export function loadUiPreference(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(`${preferencePrefix}:${key}`);
}

export function saveUiPreference(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${preferencePrefix}:${key}`, value);
}
