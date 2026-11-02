"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureLocalLibrarySeeded,
  loadStoredSessions,
  loadStoredVideoRecords,
  loadThumbnailBlob,
  loadVideoBlob,
} from "@/lib/storage/session-storage";
import type { AnalysisSession, VideoAsset } from "@/lib/types";
import { ObjectUrlCache } from "@/lib/video/object-url-cache";

interface StoredVideosOptions {
  /** Resolve playable video URLs. List pages only need thumbnails, so they skip this. */
  includeMedia: boolean;
}

/**
 * Stored videos with object URLs whose lifetime this hook owns: URLs are reused across
 * `reload()` calls, revoked when a video disappears, and all revoked on unmount.
 */
export function useStoredVideos({ includeMedia }: StoredVideosOptions) {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const cacheRef = useRef<ObjectUrlCache | null>(null);
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    const cache = (cacheRef.current ??= new ObjectUrlCache());

    await ensureLocalLibrarySeeded();
    const records = await loadStoredVideoRecords();
    const usedKeys: string[] = [];
    const resolved = await Promise.all(
      records.map(async (record) => {
        const thumbnailKey = `thumbnail:${record.id}`;
        const videoKey = `video:${record.id}`;
        usedKeys.push(thumbnailKey);

        if (includeMedia) {
          usedKeys.push(videoKey);
        }

        const [thumbnailUrl, url] = await Promise.all([
          cache.resolve(thumbnailKey, () => loadThumbnailBlob(record.id)),
          includeMedia ? cache.resolve(videoKey, () => loadVideoBlob(record.id)) : null,
        ]);

        return {
          ...record,
          url: url ?? record.url,
          thumbnailUrl: thumbnailUrl ?? record.thumbnailUrl,
        };
      }),
    );

    // A newer reload (or unmount) superseded this one; it owns the cache now.
    if (generation !== generationRef.current) {
      if (cache !== cacheRef.current) {
        // Unmounted mid-load: this cache was already cleared, so revoke what we just added.
        cache.clear();
      }

      return;
    }

    cache.retain(usedKeys);
    setVideos(resolved);
    setLoaded(true);
  }, [includeMedia]);

  useEffect(() => {
    void Promise.resolve().then(reload);

    return () => {
      generationRef.current += 1;
      cacheRef.current?.clear();
      cacheRef.current = null;
    };
  }, [reload]);

  return { videos, loaded, reload };
}

/** Sessions + videos (thumbnails only) for the Hub and Library lists. */
export function useLocalLibrary() {
  const { videos, loaded: videosLoaded, reload: reloadVideos } = useStoredVideos({
    includeMedia: false,
  });
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const reloadSessions = useCallback(async () => {
    await ensureLocalLibrarySeeded();
    setSessions(await loadStoredSessions());
    setSessionsLoaded(true);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reloadSessions);
  }, [reloadSessions]);

  const reload = useCallback(
    () => Promise.all([reloadSessions(), reloadVideos()]).then(() => undefined),
    [reloadSessions, reloadVideos],
  );

  return { sessions, videos, loaded: videosLoaded && sessionsLoaded, reload };
}
