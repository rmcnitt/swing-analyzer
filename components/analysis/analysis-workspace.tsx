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
import { proSwingReferences, proSwingToVideoAsset } from "@/lib/data/pro-swings";
import {
  applyProSwingOverrides,
  loadProSwingOverrides,
} from "@/lib/storage/pro-swing-overrides";
import {
  loadStoredSession,
  loadStoredVideos,
  loadUiPreference,
  saveStoredSession,
  saveStoredVideo,
  saveUiPreference,
  updateStoredVideoMetadata,
} from "@/lib/storage/session-storage";
import type {
  AnalysisPane,
  AnalysisSession,
  AnnotationObject,
  AnnotationTool,
  HexColor,
  MarkerSeekSignal,
  PaneId,
  PlaybackSignal,
  ProSwingReference,
  SnapshotMarker,
  SyncSignal,
  VideoAsset,
} from "@/lib/types";
import { createId, uniqueById } from "@/lib/utils";
import { createVideoThumbnail, readVideoMetadata, type VideoFileMetadata } from "@/lib/video/media";

interface AnalysisWorkspaceProps {
  initialSession: AnalysisSession;
  initialVideos: VideoAsset[];
  proSwings?: ProSwingReference[];
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

export function AnalysisWorkspace({
  initialSession,
  initialVideos,
  proSwings = proSwingReferences,
}: AnalysisWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState(initialSession);
  const [uploadedVideos, setUploadedVideos] = useState<VideoAsset[]>([]);
  const [videoMetadataById, setVideoMetadataById] = useState<
    Record<string, VideoMetadataPatch>
  >({});
  const [activePaneId, setActivePaneId] = useState<PaneId>("primary");
  const [activeTool, setActiveTool] = useState<AnnotationTool>("line");
  const [activeColor, setActiveColor] = useState<HexColor>("#f97316");
  const [selectedAnnotationByPane, setSelectedAnnotationByPane] = useState<
    Partial<Record<PaneId, string | null>>
  >({});
  const [undoStack, setUndoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [syncSignal, setSyncSignal] = useState<SyncSignal | null>(null);
  const [playbackSignal, setPlaybackSignal] = useState<PlaybackSignal | null>(null);
  const [markerSeekSignal, setMarkerSeekSignal] = useState<MarkerSeekSignal | null>(null);
  const [proSwingOverrides, setProSwingOverrides] = useState(loadProSwingOverrides);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const compareMode = searchParams.get("compare") === "true";
  const effectiveActivePaneId = compareMode ? activePaneId : "primary";

  useEffect(() => {
    void loadStoredSession(initialSession.id).then((stored) => {
      if (stored) {
        setSession(stored);
      }

      setHydrated(true);
    });

    void Promise.resolve().then(() => {
      const storedTool = loadUiPreference("active-tool") as AnnotationTool | null;
      const storedColor = loadUiPreference("active-color");

      if (storedTool) {
        setActiveTool(storedTool);
      }

      if (storedColor) {
        setActiveColor(storedColor);
      }
    });

    void loadStoredVideos().then((storedVideos) => setUploadedVideos(storedVideos));
    void Promise.resolve().then(() => setProSwingOverrides(loadProSwingOverrides()));
  }, [initialSession.id]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveStoredSession(session);
      setLastSavedAt(new Date().toISOString());
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [session, hydrated]);

  const videos = uniqueById([...uploadedVideos, ...initialVideos]).map((video) => ({
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
    const url = URL.createObjectURL(file);
    const metadata = await readVideoMetadata(url);
    const asset: VideoAsset = {
      id: createId("upload"),
      title: file.name.replace(/\.[^.]+$/, ""),
      url,
      ownerId: "user-demo",
      ownerName: "Robbie",
      sourceType: "local",
      duration: metadata.duration,
      fps: 120,
      width: metadata.width,
      height: metadata.height,
      orientation: "face-on",
      clubTag: "Uploaded Clip",
      uploadStatus: "ready",
      createdAt: new Date().toISOString(),
    };

    setUploadedVideos((current) => [asset, ...current]);
    const thumbnail = await createVideoThumbnail(url);

    await saveStoredVideo(asset, file, thumbnail);
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

  const handleLoadProSwing = (swingId: string) => {
    const swing = effectiveProSwings.find((item) => item.id === swingId);

    if (!swing) {
      return;
    }

    startTransition(() => {
      const videoAsset = proSwingToVideoAsset(swing);

      setSession((current) => ({
        ...current,
        selectedProSwingId: swingId,
        secondaryVideoId: videoAsset.id,
        syncEnabled: true,
        panes: replacePane(current.panes, "secondary", {
          videoId: videoAsset.id,
          label: `${swing.player} reference`,
        }),
      }));
    });
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

    setUploadedVideos((current) => {
      if (current.some((video) => video.id === videoId)) {
        return current.map((video) => (video.id === videoId ? { ...video, title } : video));
      }

      return currentVideo ? [{ ...currentVideo, title }, ...current] : current;
    });
    void updateStoredVideoMetadata(videoId, { title });

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

  const effectiveProSwings = applyProSwingOverrides(proSwings, proSwingOverrides);
  const allVideos = uniqueById([...videos, ...effectiveProSwings.map(proSwingToVideoAsset)]).map(
    (video) => ({
      ...video,
      ...videoMetadataById[video.id],
    }),
  );
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
              proSwings={effectiveProSwings}
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
              onLoadProSwing={handleLoadProSwing}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
