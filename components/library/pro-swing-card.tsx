"use client";

import Link from "next/link";
import { Check, Columns2, Pencil, Play, Tags, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProSwingOverride } from "@/lib/storage/pro-swing-overrides";
import type { ProSwingReference } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

interface ProSwingCardProps {
  swing: ProSwingReference;
  compareSessionId?: string;
  onSaveOverride: (id: string, override: ProSwingOverride) => void;
}

export function ProSwingCard({
  swing,
  compareSessionId = "sample-session",
  onSaveOverride,
}: ProSwingCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    player: swing.player,
    title: swing.title,
    club: swing.club,
    viewAngle: swing.viewAngle,
    handedness: swing.handedness,
    fps: String(swing.fps),
    tags: swing.tags.join(", "),
  });

  useEffect(() => {
    void Promise.resolve().then(() => {
      setDraft({
        player: swing.player,
        title: swing.title,
        club: swing.club,
        viewAngle: swing.viewAngle,
        handedness: swing.handedness,
        fps: String(swing.fps),
        tags: swing.tags.join(", "),
      });
      setIsEditing(false);
    });
  }, [swing]);

  const commitEdit = () => {
    onSaveOverride(swing.id, {
      player: draft.player.trim() || swing.player,
      title: draft.title.trim() || draft.player.trim() || swing.title,
      club: draft.club.trim() || "Unknown",
      viewAngle: draft.viewAngle,
      handedness: draft.handedness,
      fps: Number(draft.fps) || 30,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setIsEditing(false);
  };

  return (
    <article className="grid gap-2.5 border border-[color:var(--color-border)] bg-[#101113] p-2 sm:grid-cols-[124px_minmax(0,1fr)]">
      <div className="relative overflow-hidden bg-black">
        <video
          src={swing.videoUrl}
          poster={swing.thumbnailUrl}
          className="aspect-video h-full w-full object-cover opacity-80"
          preload="metadata"
          muted
          playsInline
        />
        <span className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {formatDuration(swing.duration)}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {isEditing ? (
              <div className="grid gap-1.5">
                <input
                  value={draft.player}
                  onChange={(event) => setDraft((current) => ({ ...current, player: event.target.value }))}
                  className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
                  aria-label="Player"
                />
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
                  aria-label="Title"
                />
              </div>
            ) : (
              <>
                <h3 className="truncate text-sm font-semibold text-white">{swing.player}</h3>
                <p className="mt-1 text-xs text-[color:var(--color-muted)]">
                  {swing.club} / {swing.viewAngle} / {swing.fps} fps
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="flex size-7 items-center justify-center border border-white/10 text-[color:var(--color-muted)] hover:border-[color:var(--color-accent)] hover:text-white"
            aria-label={isEditing ? "Cancel editing" : "Edit pro swing metadata"}
            title={isEditing ? "Cancel editing" : "Edit metadata"}
          >
            {isEditing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
          </button>
        </div>

        {isEditing ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <input
              value={draft.club}
              onChange={(event) => setDraft((current) => ({ ...current, club: event.target.value }))}
              className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
              aria-label="Club"
            />
            <input
              value={draft.fps}
              onChange={(event) => setDraft((current) => ({ ...current, fps: event.target.value }))}
              className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
              aria-label="FPS"
            />
            <select
              value={draft.viewAngle}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  viewAngle: event.target.value as ProSwingReference["viewAngle"],
                }))
              }
              className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
              aria-label="View angle"
            >
              <option value="face-on">Face-on</option>
              <option value="down-the-line">Down-the-line</option>
            </select>
            <select
              value={draft.handedness}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  handedness: event.target.value as ProSwingReference["handedness"],
                }))
              }
              className="h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
              aria-label="Handedness"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
            <input
              value={draft.tags}
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
              className="col-span-2 h-8 border border-[color:var(--color-border)] bg-black/40 px-2 text-xs text-white outline-none focus:border-[color:var(--color-accent)]"
              aria-label="Tags"
              placeholder="tags, comma separated"
            />
            <button
              type="button"
              onClick={commitEdit}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 bg-[color:var(--color-accent)] px-2.5 text-xs font-semibold text-[color:var(--color-ink)]"
            >
              <Check className="size-3.5" />
              Save metadata
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {swing.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-[color:var(--color-muted)]"
              >
                <Tags className="size-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          <Link
            href={`/analysis/${compareSessionId}?compare=true`}
            className="inline-flex h-[30px] items-center gap-1.5 bg-[color:var(--color-accent)] px-2.5 text-xs font-semibold text-[color:var(--color-ink)]"
          >
            <Columns2 className="size-3.5" />
            Add to compare
          </Link>
          <Link
            href={`/analysis/${compareSessionId}`}
            className="inline-flex h-[30px] items-center gap-1.5 border border-[color:var(--color-border)] px-2.5 text-xs text-white hover:border-[color:var(--color-accent)]"
          >
            <Play className="size-3.5" />
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}
