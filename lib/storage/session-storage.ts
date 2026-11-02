"use client";

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
const seededKey = "seeded";
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

function attachLocalUrls(
  video: VideoAsset,
  videoBlob: Blob | null,
  thumbnailBlob: Blob | null,
): VideoAsset {
  return {
    ...video,
    url: videoBlob ? URL.createObjectURL(videoBlob) : video.url,
    thumbnailUrl: thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : video.thumbnailUrl,
  };
}

export async function initializeLocalLibrary(seed: {
  sessions: AnalysisSession[];
  videos: VideoAsset[];
}) {
  if (typeof window === "undefined") {
    return;
  }

  const seeded = await runStore<string>(metaStoreName, "readonly", (store) =>
    store.get(seededKey),
  );

  if (seeded) {
    return;
  }

  const existingSessions = await getAllRecords<AnalysisSession>(sessionStoreName);

  if (existingSessions.length === 0) {
    await Promise.all([
      ...seed.videos.map((video) => saveStoredVideo(video)),
      ...seed.sessions.map((session) => saveStoredSession(session)),
    ]);
  }

  await putRecord(metaStoreName, "true", seededKey);
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

export async function loadStoredVideos(): Promise<VideoAsset[]> {
  const records = await getAllRecords<VideoAsset>(videoStoreName);
  const videos = await Promise.all(
    records.map(async (record) => {
      try {
        const video = videoSchema.parse(record);
        const [videoBlob, thumbnailBlob] = await Promise.all([
          getBlob(videoBlobStoreName, video.id),
          getBlob(thumbnailBlobStoreName, video.id),
        ]);

        return attachLocalUrls(video, videoBlob, thumbnailBlob);
      } catch {
        return null;
      }
    }),
  );

  return videos.filter((video): video is VideoAsset => Boolean(video));
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
