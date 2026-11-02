"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { startTransition } from "react";
import {
  Columns2,
  LibraryBig,
  PanelRightClose,
  PanelRightOpen,
  Save,
} from "lucide-react";
import { AnalysisToolbar } from "@/components/analysis/analysis-toolbar";
import { SessionSidebar } from "@/components/analysis/session-sidebar";
import { VideoPane } from "@/components/analysis/video-pane";
import {
  ensureLocalLibrarySeeded,
  loadStoredSession,
  loadUiPreference,
  requestPersistentStorage,
  saveStoredSession,
  saveStoredVideo,
  saveUiPreference,
  updateStoredVideoMetadata,
} from "@/lib/storage/session-storage";
import { useStoredVideos } from "@/lib/storage/use-stored-videos";
import type {
  AnalysisPane,
  AnalysisSession,
  AnnotationObject,
  AnnotationTool,
  HexColor,
  MarkerSeekSignal,
  PaneId,
  PlaybackSignal,
  SnapshotMarker,
  SyncSignal,
  VideoAsset,
} from "@/lib/types";
import { createId, uniqueById } from "@/lib/utils";
import { createVideoThumbnail, readVideoMetadata, type VideoFileMetadata } from "@/lib/video/media";

interface AnalysisWorkspaceProps {
  sessionId: string;
  /** Bundled sample session used when IndexedDB has no copy yet; null for user sessions. */
  seedSession: AnalysisSession | null;
  initialVideos: VideoAsset[];
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; session: AnalysisSession }
  | { status: "missing" }
  | { status: "corrupt" };

/** Loads the session from IndexedDB before mounting the workspace, so nothing renders or
 * autosaves with placeholder data. */
export function AnalysisWorkspace({ sessionId, seedSession, ...rest }: AnalysisWorkspaceProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void ensureLocalLibrarySeeded()
      .then(() => loadStoredSession(sessionId))
      .then((result) => {
        if (cancelled) {
          return;
        }

        const lastOpenedAt = new Date().toISOString();

        if (result.status === "found") {
          setLoadState({ status: "ready", session: { ...result.session, lastOpenedAt } });
        } else if (result.status === "missing" && seedSession) {
          setLoadState({ status: "ready", session: { ...seedSession, lastOpenedAt } });
        } else {
          setLoadState({ status: result.status === "corrupt" ? "corrupt" : "missing" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, seedSession]);

  if (loadState.status === "ready") {
    return <WorkspaceView key={loadState.session.id} initialSession={loadState.session} {...rest} />;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#07080a] px-4 text-center text-white">
      {loadState.status === "loading" ? (
        <p className="text-sm text-[color:var(--color-muted)]">Loading session…</p>
      ) : (
        <>
          <h1 className="text-base font-semibold">
            {loadState.status === "missing" ? "Session not found" : "This session couldn't be read"}
          </h1>
          <p className="max-w-sm text-sm text-[color:var(--color-muted)]">
            {loadState.status === "missing"
              ? "It may have been deleted, or it was saved in a different browser. Sessions live only in the browser where they were created."
              : "The saved data is damaged. A backup copy was kept in this browser's storage."}
          </p>
          <Link
            href="/"
            className="mt-2 flex h-9 items-center bg-[color:var(--color-accent)] px-3 text-sm font-semibold text-[color:var(--color-ink)]"
          >
            Back to swings
          </Link>
        </>
      )}
    </div>
  );
}

interface WorkspaceViewProps {
  initialSession: AnalysisSession;
  initialVideos: VideoAsset[];
}

function loadReferenceIntoSecondary(
  session: AnalysisSession,
  video: Pick<VideoAsset, "id" | "title"> | { id: string; title?: string },
): AnalysisSession {
  return {
    ...session,
    secondaryVideoId: video.id,
    syncEnabled: true,
    panes: replacePane(session.panes, "secondary", {
      videoId: video.id,
      label: video.title ? `${video.title} (reference)` : "Reference",
    }),
  };
}

type VideoMetadataPatch = Partial<VideoFileMetadata>;

function replacePane(
  panes: AnalysisPane[],
  paneId: PaneId,
  patch: Partial<AnalysisPane>,
) {
  return panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane));
}

function panePatchIsNoOp(pane: AnalysisPane, patch: Partial<AnalysisPane>) {
  return Object.entries(patch).every(([key, value]) => {
    const paneKey = key as keyof AnalysisPane;
    return pane[paneKey] === value;
  });
}

function WorkspaceView({
  initialSession,
  initialVideos,
}: WorkspaceViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // "Add to compare" from the Library links here with ?compare=true&ref=<videoId>.
  const initialReferenceId = searchParams.get("ref");
  const [session, setSession] = useState(() =>
    initialReferenceId
      ? loadReferenceIntoSecondary(initialSession, { id: initialReferenceId })
      : initialSession,
  );
  const { videos: storedVideos, reload: reloadVideos } = useStoredVideos({ includeMedia: true });
  const [videoMetadataById, setVideoMetadataById] = useState<
    Record<string, VideoMetadataPatch>
  >({});
  const [activePaneId, setActivePaneId] = useState<PaneId>("primary");
  // Safe to read localStorage during render: WorkspaceView only mounts on the client, after the
  // session has loaded, so there is no server render to mismatch.
  const [activeTool, setActiveTool] = useState<AnnotationTool>(
    () => (loadUiPreference("active-tool") as AnnotationTool | null) ?? "line",
  );
  const [activeColor, setActiveColor] = useState<HexColor>(
    () => loadUiPreference("active-color") ?? "#f97316",
  );
  const [selectedAnnotationByPane, setSelectedAnnotationByPane] = useState<
    Partial<Record<PaneId, string | null>>
  >({});
  const [undoStack, setUndoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [syncSignal, setSyncSignal] = useState<SyncSignal | null>(null);
  const [playbackSignal, setPlaybackSignal] = useState<PlaybackSignal | null>(null);
  const [markerSeekSignal, setMarkerSeekSignal] = useState<MarkerSeekSignal | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const compareMode = searchParams.get("compare") === "true";
  const effectiveActivePaneId = compareMode ? activePaneId : "primary";

  // Consume ?ref once so a reload or later navigation doesn't re-apply it.
  useEffect(() => {
    if (!initialReferenceId) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.delete("ref");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [initialReferenceId, pathname, router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void saveStoredSession(session);
      setLastSavedAt(new Date().toISOString());
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [session]);

  const videos = uniqueById([...storedVideos, ...initialVideos]).map((video) => ({
    ...video,
    ...videoMetadataById[video.id],
  }));
  const activePane =
    session.panes.find((pane) => pane.id === effectiveActivePaneId) ?? session.panes[0];
  const overlayVisible = activePane?.overlayVisible ?? true;
  const selectedAnnotationId = selectedAnnotationByPane[effectiveActivePaneId] ?? null;

  const pushHistory = () => {
    setUndoStack((current) => [...current, session.annotations]);
    setRedoStack([]);
  };

  const updateAnnotations = (paneId: PaneId, annotations: AnnotationObject[]) => {
    pushHistory();
    setSelectedAnnotationByPane((current) => ({
      ...current,
      [paneId]: annotations.some((annotation) => annotation.id === current[paneId])
        ? current[paneId]
        : null,
    }));
    setSession((current) => ({
      ...current,
      annotations: {
        ...current.annotations,
        [paneId]: annotations,
      },
    }));
  };

  const updatePane = useCallback((paneId: PaneId, patch: Partial<AnalysisPane>) => {
    setSession((current) => ({
      ...current,
      panes: current.panes.map((pane) => {
        if (pane.id !== paneId) {
          return pane;
        }

        return panePatchIsNoOp(pane, patch) ? pane : { ...pane, ...patch };
      }),
    }));
  }, []);

  const handleUndo = () => {
    const previous = undoStack[undoStack.length - 1];

    if (!previous) {
      return;
    }

    setRedoStack((current) => [...current, session.annotations]);
    setUndoStack((current) => current.slice(0, -1));
    setSession((current) => ({
      ...current,
      annotations: previous,
    }));
  };

  const handleRedo = () => {
    const next = redoStack[redoStack.length - 1];

    if (!next) {
      return;
    }

    setUndoStack((current) => [...current, session.annotations]);
    setRedoStack((current) => current.slice(0, -1));
    setSession((current) => ({
      ...current,
      annotations: next,
    }));
  };

  const handleClear = () => {
    pushHistory();
    setSelectedAnnotationByPane((current) => ({
      ...current,
      [effectiveActivePaneId]: null,
    }));
    setSession((current) => ({
      ...current,
      annotations: {
        ...current.annotations,
        [effectiveActivePaneId]: [],
      },
    }));
  };

  const handleDeleteSelected = () => {
    if (!selectedAnnotationId) {
      return;
    }

    updateAnnotations(
      effectiveActivePaneId,
      session.annotations[effectiveActivePaneId].filter(
        (annotation) => annotation.id !== selectedAnnotationId,
      ),
    );
  };

  const handleToggleOverlay = () => {
    updatePane(effectiveActivePaneId, {
      overlayVisible: !overlayVisible,
    });
  };

  const handleSelectVideo = (paneId: PaneId, videoId: string) => {
    updatePane(paneId, {
      videoId: videoId || undefined,
    });

    setSession((current) => ({
      ...current,
      primaryVideoId:
        paneId === "primary" ? videoId || current.primaryVideoId : current.primaryVideoId,
      secondaryVideoId:
        paneId === "secondary" ? videoId || undefined : current.secondaryVideoId,
    }));
  };

  const handleUploadVideo = async (paneId: PaneId, file: File) => {
    // Temporary URL just for probing; the playable URL comes from IndexedDB via useStoredVideos.
    const probeUrl = URL.createObjectURL(file);
    const metadata = await readVideoMetadata(probeUrl);
    const thumbnail = await createVideoThumbnail(probeUrl);
    URL.revokeObjectURL(probeUrl);
    const asset: VideoAsset = {
      id: createId("upload"),
      title: file.name.replace(/\.[^.]+$/, ""),
      url: "",
      ownerId: "user-demo",
      ownerName: "Local library",
      sourceType: "user",
      duration: metadata.duration,
      fps: 120,
      width: metadata.width,
      height: metadata.height,
      orientation: "face-on",
      clubTag: "Uploaded Clip",
      uploadStatus: "ready",
      createdAt: new Date().toISOString(),
    };

    await saveStoredVideo(asset, file, thumbnail);
    void requestPersistentStorage();
    await reloadVideos();
    handleSelectVideo(paneId, asset.id);
  };

  const handleAddMarker = (label?: string) => {
    const activeTime = activePane?.currentTime ?? 0;

    setSession((current) => ({
      ...current,
      snapshotMarkers: [
        ...current.snapshotMarkers,
        {
          id: createId("marker"),
          paneId: effectiveActivePaneId,
          label: label?.trim() || `Checkpoint ${current.snapshotMarkers.length + 1}`,
          time: Number(activeTime.toFixed(2)),
        },
      ],
    }));
  };

  const handleSeekMarker = (marker: SnapshotMarker) => {
    setActivePaneId(marker.paneId);
    setMarkerSeekSignal((current) => ({
      paneId: marker.paneId,
      time: marker.time,
      version: (current?.version ?? 0) + 1,
    }));
  };

  const handleRenameMarker = (markerId: string, label: string) => {
    setSession((current) => ({
      ...current,
      snapshotMarkers: current.snapshotMarkers.map((marker) =>
        marker.id === markerId ? { ...marker, label } : marker,
      ),
    }));
  };

  const handleDeleteMarker = (markerId: string) => {
    setSession((current) => ({
      ...current,
      snapshotMarkers: current.snapshotMarkers.filter((marker) => marker.id !== markerId),
    }));
  };

  const handleLoadReference = (videoId: string) => {
    const reference = getVideo(videoId);

    if (!reference) {
      return;
    }

    startTransition(() => {
      setSession((current) => loadReferenceIntoSecondary(current, reference));
    });

    if (!compareMode) {
      handleSetCompareMode(true);
    }
  };

  const handleManualSave = () => {
    void saveStoredSession(session);
    setLastSavedAt(new Date().toISOString());
  };

  const handleVideoMetadata = (videoId: string, metadata: VideoMetadataPatch) => {
    setVideoMetadataById((current) => ({
      ...current,
      [videoId]: {
        ...current[videoId],
        ...metadata,
      },
    }));
  };

  const handleRenameVideo = (videoId: string, title: string) => {
    const currentVideo = getVideo(videoId);

    void updateStoredVideoMetadata(videoId, { title }).then(reloadVideos);

    if (videoId === session.primaryVideoId) {
      setSession((current) => ({
        ...current,
        title: current.title === currentVideo?.title ? title : current.title,
      }));
    }
  };

  const handleEmitSync = useCallback((paneId: PaneId, time: number) => {
    setSyncSignal((current) => {
      if (current?.paneId === paneId && Math.abs(current.time - time) < 0.01) {
        return current;
      }

      return {
        paneId,
        time,
        version: (current?.version ?? 0) + 1,
      };
    });
  }, []);

  const handleEmitPlayback = useCallback(
    (paneId: PaneId, command: Omit<PlaybackSignal, "paneId" | "version">) => {
      setPlaybackSignal((current) => ({
        ...command,
        paneId,
        version: (current?.version ?? 0) + 1,
      }));
    },
    [],
  );

  const handleSetCompareMode = (nextCompareMode: boolean) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextCompareMode) {
      params.set("compare", "true");
    } else {
      params.delete("compare");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    if (!nextCompareMode) {
      setActivePaneId("primary");
    }
  };

  const allVideos = videos;
  const references = allVideos.filter((video) => video.sourceType === "reference");
  const getVideo = (videoId?: string) => allVideos.find((video) => video.id === videoId);
  const visiblePanes = compareMode
    ? session.panes
    : session.panes.filter((pane) => pane.id === "primary");

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-[#07080a] text-white">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] bg-[#101113] px-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex size-8 shrink-0 items-center justify-center bg-[color:var(--color-accent)] text-[color:var(--color-ink)]"
            aria-label="Home"
          >
            <span className="text-sm font-black">SA</span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">{session.title}</h1>
            <p className="truncate text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
              {session.syncEnabled ? "Sync enabled" : "Independent panes"} / Active{" "}
              {effectiveActivePaneId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-xs text-[color:var(--color-muted)] sm:inline">
            {lastSavedAt
              ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Autosave"}
          </span>
          <button
            type="button"
            onClick={() => handleSetCompareMode(!compareMode)}
            className={`flex h-8 items-center gap-2 border px-2.5 text-xs ${
              compareMode
                ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/14 text-white"
                : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white"
            }`}
          >
            <Columns2 className="size-3.5" />
            <span className="hidden sm:inline">{compareMode ? "Comparing" : "Compare"}</span>
          </button>
          {compareMode ? (
            <button
              type="button"
              onClick={() =>
                setSession((current) => ({
                  ...current,
                  syncEnabled: !current.syncEnabled,
                }))
              }
              className={`hidden h-8 border px-2.5 text-xs sm:block ${
                session.syncEnabled
                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/14 text-white"
                  : "border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white"
              }`}
            >
              {session.syncEnabled ? "Sync on" : "Sync off"}
            </button>
          ) : null}
          <Link
            href="/library"
            className="flex h-8 items-center gap-2 border border-[color:var(--color-border)] px-2.5 text-xs text-[color:var(--color-muted)] hover:border-white/20 hover:text-white"
          >
            <LibraryBig className="size-3.5" />
            <span className="hidden sm:inline">Library</span>
          </Link>
          <button
            type="button"
            onClick={handleManualSave}
            className="flex h-8 items-center gap-2 bg-[color:var(--color-accent)] px-2.5 text-xs font-semibold text-[color:var(--color-ink)]"
          >
            <Save className="size-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            type="button"
            onClick={() => setInspectorOpen((current) => !current)}
            className="flex size-8 items-center justify-center border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white"
            aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
          >
            {inspectorOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="w-[52px] shrink-0">
          <AnalysisToolbar
            activeTool={activeTool}
            activeColor={activeColor}
            overlayVisible={overlayVisible}
            hasSelectedAnnotation={Boolean(selectedAnnotationId)}
            onToolChange={(tool) => {
              setActiveTool(tool);
              saveUiPreference("active-tool", tool);
            }}
            onColorChange={(color) => {
              setActiveColor(color);
              saveUiPreference("active-color", color);
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onDeleteSelected={handleDeleteSelected}
            onToggleOverlay={handleToggleOverlay}
          />
        </div>

        <main className="min-w-0 flex-1 p-1.5">
          <div
            className={`grid h-full min-h-0 ${
              compareMode ? "gap-0 xl:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {visiblePanes.map((pane) => (
              <VideoPane
                key={pane.id}
                pane={pane}
                video={getVideo(pane.videoId)}
                videos={allVideos}
                annotations={session.annotations[pane.id]}
                markers={session.snapshotMarkers.filter((marker) => marker.paneId === pane.id)}
                activeTool={activeTool}
                activeColor={activeColor}
                selectedAnnotationId={selectedAnnotationByPane[pane.id] ?? null}
                isActive={effectiveActivePaneId === pane.id}
                syncEnabled={session.syncEnabled}
                syncSignal={syncSignal}
                playbackSignal={playbackSignal}
                markerSeekSignal={markerSeekSignal}
                compareMode={compareMode}
                isComparisonPane={pane.id === "secondary"}
                onActivate={setActivePaneId}
                onSelectVideo={handleSelectVideo}
                onUploadVideo={handleUploadVideo}
                onVideoMetadata={handleVideoMetadata}
                onRenameVideo={handleRenameVideo}
                onUpdatePane={updatePane}
                onEmitSync={handleEmitSync}
                onEmitPlayback={handleEmitPlayback}
                onSelectionChange={(paneId, annotationId) => {
                  setActivePaneId(paneId);
                  setSelectedAnnotationByPane((current) => ({
                    ...current,
                    [paneId]: annotationId,
                  }));
                }}
                onAnnotationsChange={updateAnnotations}
              />
            ))}
          </div>
        </main>

        {inspectorOpen ? (
          <div className="hidden w-[300px] shrink-0 xl:block">
            <SessionSidebar
              sessionTitle={session.title}
              notes={session.notes}
              syncEnabled={session.syncEnabled}
              activePaneId={effectiveActivePaneId}
              markers={session.snapshotMarkers}
              references={references}
              lastSavedAt={lastSavedAt}
              onNotesChange={(value) =>
                setSession((current) => ({
                  ...current,
                  notes: value,
                }))
              }
              onToggleSync={() =>
                setSession((current) => ({
                  ...current,
                  syncEnabled: !current.syncEnabled,
                }))
              }
              onSave={handleManualSave}
              onAddMarker={handleAddMarker}
              onSeekMarker={handleSeekMarker}
              onRenameMarker={handleRenameMarker}
              onDeleteMarker={handleDeleteMarker}
              onLoadReference={handleLoadReference}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
