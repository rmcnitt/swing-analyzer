"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { startTransition } from "react";
import {
  Columns2,
  ImageDown,
  Keyboard,
  LibraryBig,
  PanelRightClose,
  PanelRightOpen,
  Save,
} from "lucide-react";
import { AnalysisToolbar } from "@/components/analysis/analysis-toolbar";
import { ComparePositionBar } from "@/components/analysis/compare-position-bar";
import { PlaybackProblemNotice } from "@/components/analysis/playback-problem-notice";
import { SessionSidebar } from "@/components/analysis/session-sidebar";
import { ShortcutsDialog } from "@/components/analysis/shortcuts-dialog";
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
  NormalizedRect,
  PaneId,
  SnapshotMarker,
  VideoAsset,
} from "@/lib/types";
import { createId, formatTimecode, uniqueById } from "@/lib/utils";
import { composeCaptures, downloadCanvas, exportFileName, type FrameCapture } from "@/lib/video/frame-export";
import { DEFAULT_FPS, frameIndexAt } from "@/lib/analysis/frames";
import { DEFAULT_STROKE_WIDTH, STROKE_WIDTHS } from "@/lib/analysis/annotations";
import { defaultLoop, setLoopPoint } from "@/lib/analysis/loop";
import {
  isSwingPosition,
  paneMarkers,
  positionKey,
  positionTimes,
  SWING_POSITIONS,
  upsertPositionMarker,
} from "@/lib/analysis/positions";
import { isTypingTarget, resolveShortcut, type ShortcutAction } from "@/lib/analysis/shortcuts";
import { createCheckpointMapper, matchCheckpoints } from "@/lib/analysis/sync";
import { SyncGroup } from "@/lib/analysis/sync-group";
import type { PlaybackProblem } from "@/lib/video/playback-errors";
import { createVideoThumbnail, detectVideoFps, readVideoMetadata, type VideoFileMetadata } from "@/lib/video/media";

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
      currentTime: 0,
    }),
  };
}

type VideoMetadataPatch = Partial<VideoFileMetadata> & Pick<VideoAsset, "golferBox">;

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
  const [strokeWidth, setStrokeWidth] = useState(() => {
    const saved = Number(loadUiPreference("stroke-width"));
    return STROKE_WIDTHS.some((width) => width === saved) ? saved : DEFAULT_STROKE_WIDTH;
  });
  const [selectedAnnotationByPane, setSelectedAnnotationByPane] = useState<
    Partial<Record<PaneId, string | null>>
  >({});
  const [undoStack, setUndoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Record<PaneId, AnnotationObject[]>>>([]);
  const [syncGroup] = useState(() => new SyncGroup());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const capturesRef = useRef(new Map<PaneId, () => HTMLCanvasElement | null>());
  const registerCapture = useCallback(
    (paneId: PaneId, capture: (() => HTMLCanvasElement | null) | null) => {
      if (capture) {
        capturesRef.current.set(paneId, capture);
      } else {
        capturesRef.current.delete(paneId);
      }
    },
    [],
  );
  const [uploadProblem, setUploadProblem] = useState<{
    problem: PlaybackProblem;
    fileName: string;
    mimeType: string;
  } | null>(null);
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
    syncGroup.setEnabled(session.syncEnabled);
  }, [syncGroup, session.syncEnabled]);

  // Positions marked on each pane's current clip; shared ones drive the compare time mapping.
  const { markersByPane, positionsByPane, checkpoints } = useMemo(() => {
    const byPane = {
      primary: paneMarkers(session.snapshotMarkers, {
        id: "primary",
        videoId: session.panes.find((pane) => pane.id === "primary")?.videoId,
      }),
      secondary: paneMarkers(session.snapshotMarkers, {
        id: "secondary",
        videoId: session.panes.find((pane) => pane.id === "secondary")?.videoId,
      }),
    } satisfies Record<PaneId, SnapshotMarker[]>;
    const positions = {
      primary: positionTimes(byPane.primary),
      secondary: positionTimes(byPane.secondary),
    } satisfies Record<PaneId, Map<string, number>>;

    return {
      markersByPane: byPane,
      positionsByPane: positions,
      checkpoints: matchCheckpoints(positions.primary, positions.secondary),
    };
  }, [session.snapshotMarkers, session.panes]);

  useEffect(() => {
    syncGroup.setTimeMapper(createCheckpointMapper(checkpoints));
  }, [syncGroup, checkpoints]);

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
  const allVideos = videos;
  const references = allVideos.filter((video) => video.sourceType === "reference");
  const getVideo = (videoId?: string) => allVideos.find((video) => video.id === videoId);
  const visiblePanes = compareMode
    ? session.panes
    : session.panes.filter((pane) => pane.id === "primary");
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

  /** Restyles the selected shape (palette and width pickers act on it, like V1). */
  const updateSelectedStyle = (style: Partial<AnnotationObject["style"]>) => {
    if (!selectedAnnotationId) {
      return;
    }

    updateAnnotations(
      effectiveActivePaneId,
      session.annotations[effectiveActivePaneId].map((annotation) =>
        annotation.id === selectedAnnotationId
          ? { ...annotation, style: { ...annotation.style, ...style } }
          : annotation,
      ),
    );
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
      currentTime: 0,
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

    if (metadata.problem) {
      URL.revokeObjectURL(probeUrl);
      setUploadProblem({ problem: metadata.problem, fileName: file.name, mimeType: file.type });
      return;
    }

    setUploadProblem(null);
    const thumbnail = await createVideoThumbnail(probeUrl);
    const detectedFps = await detectVideoFps(probeUrl);
    URL.revokeObjectURL(probeUrl);
    const asset: VideoAsset = {
      id: createId("upload"),
      title: file.name.replace(/\.[^.]+$/, ""),
      url: "",
      ownerId: "user-demo",
      ownerName: "Local library",
      sourceType: "user",
      duration: metadata.duration,
      fps: detectedFps ?? DEFAULT_FPS,
      fpsSource: detectedFps ? "detected" : undefined,
      width: metadata.width,
      height: metadata.height,
      orientation: "face-on",
      clubTag: "Uploaded Clip",
      mimeType: file.type || undefined,
      uploadStatus: "ready",
      createdAt: new Date().toISOString(),
    };

    await saveStoredVideo(asset, file, thumbnail);
    void requestPersistentStorage();
    await reloadVideos();
    handleSelectVideo(paneId, asset.id);
  };

  const addMarker = (paneId: PaneId, label: string, time: number) => {
    setSession((current) => {
      const marker: SnapshotMarker = {
        id: createId("marker"),
        paneId,
        videoId: current.panes.find((pane) => pane.id === paneId)?.videoId,
        label,
        time: Number(time.toFixed(4)),
      };

      return {
        ...current,
        // A swing position has one time per clip; other labels can repeat.
        snapshotMarkers: isSwingPosition(label)
          ? upsertPositionMarker(current.snapshotMarkers, marker)
          : [...current.snapshotMarkers, marker],
      };
    });
  };

  const handleAddMarker = (label?: string) => {
    const activeTime =
      syncGroup.get(effectiveActivePaneId)?.currentTime ?? activePane?.currentTime ?? 0;

    addMarker(
      effectiveActivePaneId,
      label?.trim() || `Checkpoint ${session.snapshotMarkers.length + 1}`,
      activeTime,
    );
  };

  const findPositionMarker = (paneId: PaneId, label: string) => {
    const time = positionsByPane[paneId].get(positionKey(label));
    return time === undefined ? undefined : { paneId, time };
  };

  const handleJumpToPosition = (paneId: PaneId, label: string) => {
    const target = findPositionMarker(paneId, label);

    if (target) {
      handleSeekMarker(target);
    }
  };

  /** Puts each pane on its own marked frame for this position, so they show the same moment. */
  const handleJumpBoth = (label: string) => {
    const targets = (["primary", "secondary"] as const)
      .map((paneId) => findPositionMarker(paneId, label))
      .filter((target) => target !== undefined);

    if (targets.length === 1) {
      // Only one swing has it: jump there and let sync map the other pane.
      handleSeekMarker(targets[0]);
      return;
    }

    syncGroup.pauseAll();
    targets.forEach(({ paneId, time }) => syncGroup.get(paneId)?.seek(time));
  };

  const handleSeekMarker = (marker: Pick<SnapshotMarker, "paneId" | "time">) => {
    setActivePaneId(marker.paneId);

    // Jumping to a position means studying it: stop there (and align the other pane if synced).
    if (syncGroup.get(marker.paneId)?.paused === false) {
      syncGroup.pause(marker.paneId);
    }

    syncGroup.seek(marker.paneId, marker.time);
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

  const handleToggleSync = () => {
    setSession((current) => ({ ...current, syncEnabled: !current.syncEnabled }));
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

  const handleSetGolferBox = (videoId: string, golferBox: NormalizedRect) => {
    // Apply right away; the stored copy catches up on reload.
    handleVideoMetadata(videoId, { golferBox });
    void updateStoredVideoMetadata(videoId, { golferBox });
  };

  const handleFitBoth = () => {
    session.panes.forEach((pane) => {
      if (getVideo(pane.videoId)?.golferBox) {
        updatePane(pane.id, { fitGolfer: true });
      }
    });
  };

  const handleSetVideoFps = useCallback(
    (videoId: string, fps: number, source: "detected" | "manual") => {
      void updateStoredVideoMetadata(videoId, { fps, fpsSource: source }).then(reloadVideos);
    },
    [reloadVideos],
  );

  const handleChangeRate = (paneId: PaneId, rate: number) => {
    // With sync on, both panes share a speed so the leader isn't constantly correcting.
    const targets: PaneId[] = session.syncEnabled ? ["primary", "secondary"] : [paneId];
    targets.forEach((id) => updatePane(id, { playbackRate: rate }));
  };

  const handleToolChange = (tool: AnnotationTool) => {
    setActiveTool(tool);
    saveUiPreference("active-tool", tool);
  };

  /** `[`/`]` set an in/out point at the current frame (turning looping on); R toggles it. */
  const handleLoopShortcut = (paneId: PaneId, point: "start" | "end" | null) => {
    const pane = session.panes.find((candidate) => candidate.id === paneId);
    const media = syncGroup.get(paneId);
    const mediaDuration = media?.duration ?? Infinity;
    const duration = Number.isFinite(mediaDuration) ? mediaDuration : (getVideo(pane?.videoId)?.duration ?? 0);

    if (!pane || !media || !duration) {
      return;
    }

    if (point) {
      updatePane(paneId, {
        loop: setLoopPoint(pane.loopEnabled ? pane.loop : undefined, point, media.currentTime, duration),
        loopEnabled: true,
      });
      return;
    }

    updatePane(paneId, {
      loopEnabled: !pane.loopEnabled,
      loop: pane.loop ?? defaultLoop(positionsByPane[paneId], duration),
    });
  };

  /** Saves the visible pane(s) at their current frame, with drawings, as one PNG. */
  const handleExportFrame = async () => {
    const captures: FrameCapture[] = [];

    for (const pane of visiblePanes) {
      const canvas = capturesRef.current.get(pane.id)?.();
      const video = getVideo(pane.videoId);

      if (!canvas || !video) {
        continue;
      }

      const time = syncGroup.get(pane.id)?.currentTime ?? 0;
      const frame = frameIndexAt(time, video.fps);
      const position = SWING_POSITIONS.find((label) => {
        const marked = positionsByPane[pane.id].get(positionKey(label));
        return marked !== undefined && frameIndexAt(marked, video.fps) === frame;
      });

      captures.push({
        canvas,
        caption: [video.title, position, formatTimecode(time)].filter(Boolean).join("  ·  "),
      });
    }

    if (captures.length === 0) {
      return;
    }

    const primaryTime = syncGroup.get(visiblePanes[0].id)?.currentTime ?? 0;
    await downloadCanvas(composeCaptures(captures), exportFileName(session.title, primaryTime));
  };

  const runShortcut = (action: ShortcutAction) => {
    const paneId = effectiveActivePaneId;

    switch (action.type) {
      case "toggle-play":
        syncGroup.togglePlay(paneId);
        break;
      case "step":
        syncGroup.step(paneId, action.frames, getVideo(activePane?.videoId)?.fps);
        break;
      case "speed":
        handleChangeRate(paneId, action.rate);
        break;
      case "tool":
        handleToolChange(action.tool);
        break;
      case "undo":
        handleUndo();
        break;
      case "redo":
        handleRedo();
        break;
      case "delete-selected":
        handleDeleteSelected();
        break;
      case "toggle-overlay":
        handleToggleOverlay();
        break;
      case "export-frame":
        void handleExportFrame();
        break;
      case "loop-point":
      case "toggle-loop":
        handleLoopShortcut(paneId, action.type === "loop-point" ? action.point : null);
        break;
      case "toggle-help":
        setShortcutsOpen((open) => !open);
        break;
      case "escape":
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else {
          setSelectedAnnotationByPane((current) => ({ ...current, [paneId]: null }));
        }
        break;
    }
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) {
      return;
    }

    const action = resolveShortcut(event);

    // While the shortcut list is open, only keys that close it apply.
    if (!action || (shortcutsOpen && action.type !== "toggle-help" && action.type !== "escape")) {
      return;
    }

    // Also stops Space from clicking a focused button and arrows from moving a focused slider.
    event.preventDefault();
    runShortcut(action);
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            onClick={() => void handleExportFrame()}
            className="flex h-8 items-center gap-2 border border-[color:var(--color-border)] px-2.5 text-xs text-[color:var(--color-muted)] hover:border-white/20 hover:text-white"
            title={compareMode ? "Export both frames with drawings as PNG (E)" : "Export frame with drawings as PNG (E)"}
          >
            <ImageDown className="size-3.5" />
            <span className="hidden lg:inline">Export</span>
          </button>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="hidden size-8 items-center justify-center border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white md:flex"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="size-4" />
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

      {uploadProblem ? (
        <PlaybackProblemNotice
          className="mx-1.5 mt-1.5"
          problem={uploadProblem.problem}
          fileName={uploadProblem.fileName}
          mimeType={uploadProblem.mimeType}
          onDismiss={() => setUploadProblem(null)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[52px] shrink-0">
          <AnalysisToolbar
            activeTool={activeTool}
            activeColor={activeColor}
            overlayVisible={overlayVisible}
            hasSelectedAnnotation={Boolean(selectedAnnotationId)}
            onToolChange={handleToolChange}
            strokeWidth={strokeWidth}
            onColorChange={(color) => {
              setActiveColor(color);
              saveUiPreference("active-color", color);
              updateSelectedStyle({ stroke: color });
            }}
            onStrokeWidthChange={(width) => {
              setStrokeWidth(width);
              saveUiPreference("stroke-width", String(width));
              updateSelectedStyle({ strokeWidth: width });
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onDeleteSelected={handleDeleteSelected}
            onToggleOverlay={handleToggleOverlay}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col p-1.5">
          {compareMode ? (
            <ComparePositionBar
              syncEnabled={session.syncEnabled}
              positionsByPane={positionsByPane}
              checkpoints={checkpoints}
              onJumpBoth={handleJumpBoth}
              onToggleSync={handleToggleSync}
              framedPaneCount={
                visiblePanes.filter((pane) => getVideo(pane.videoId)?.golferBox).length
              }
              onFitBoth={handleFitBoth}
            />
          ) : null}
          <div
            className={`grid min-h-0 flex-1 ${
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
                markers={markersByPane[pane.id]}
                positions={positionsByPane[pane.id]}
                activeTool={activeTool}
                activeColor={activeColor}
                strokeWidth={strokeWidth}
                selectedAnnotationId={selectedAnnotationByPane[pane.id] ?? null}
                isActive={effectiveActivePaneId === pane.id}
                syncGroup={syncGroup}
                compareMode={compareMode}
                isComparisonPane={pane.id === "secondary"}
                onActivate={setActivePaneId}
                onSelectVideo={handleSelectVideo}
                onUploadVideo={handleUploadVideo}
                onVideoMetadata={handleVideoMetadata}
                onRenameVideo={handleRenameVideo}
                onSetVideoFps={handleSetVideoFps}
                onUpdatePane={updatePane}
                onChangeRate={handleChangeRate}
                onSelectionChange={(paneId, annotationId) => {
                  setActivePaneId(paneId);
                  setSelectedAnnotationByPane((current) => ({
                    ...current,
                    [paneId]: annotationId,
                  }));
                }}
                onAnnotationsChange={updateAnnotations}
                onJumpToPosition={handleJumpToPosition}
                onMarkPosition={addMarker}
                onSetGolferBox={handleSetGolferBox}
                onRegisterCapture={registerCapture}
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
              markers={[...markersByPane.primary, ...(compareMode ? markersByPane.secondary : [])]}
              references={references}
              lastSavedAt={lastSavedAt}
              onNotesChange={(value) =>
                setSession((current) => ({
                  ...current,
                  notes: value,
                }))
              }
              onToggleSync={handleToggleSync}
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

      {shortcutsOpen ? <ShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
