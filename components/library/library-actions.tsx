"use client";

import { useEffect, useState } from "react";
import { Check, HardDrive, Pencil, Trash2, X } from "lucide-react";
import { getStorageStatus, type StorageStatus } from "@/lib/storage/session-storage";
import { cn, formatBytes } from "@/lib/utils";

const iconButton =
  "flex size-8 shrink-0 items-center justify-center border border-[color:var(--color-border)] text-[color:var(--color-muted)] hover:border-white/20 hover:text-white";

/** Title that turns into an input; Enter/blur saves, Escape cancels. */
export function InlineRename({
  value,
  label,
  onSave,
  className,
}: {
  value: string;
  label: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const next = draft?.trim();

    if (next && next !== value) {
      onSave(next);
    }

    setDraft(null);
  };

  if (draft === null) {
    return (
      <div className={cn("flex min-w-0 items-center gap-1", className)}>
        <h2 className="truncate text-sm font-semibold text-white">{value}</h2>
        <button
          type="button"
          onClick={() => setDraft(value)}
          className="flex size-6 shrink-0 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
          aria-label={`Rename ${label}`}
          title="Rename"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          } else if (event.key === "Escape") {
            setDraft(null);
          }
        }}
        autoFocus
        aria-label={`New name for ${label}`}
        className="h-7 min-w-0 flex-1 border border-[color:var(--color-accent)] bg-black/60 px-2 text-sm text-white outline-none"
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={commit}
        className="flex size-6 shrink-0 items-center justify-center text-[color:var(--color-muted)] hover:text-white"
        aria-label="Save name"
      >
        <Check className="size-3.5" />
      </button>
    </div>
  );
}

/** Delete button that asks for a second click, with a short note about what goes with it. */
export function ConfirmDeleteButton({
  label,
  consequence,
  onConfirm,
}: {
  label: string;
  consequence: string;
  onConfirm: () => Promise<unknown> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={iconButton}
        aria-label={`Delete ${label}`}
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Confirm deleting ${label}`}>
      <span className="max-w-48 text-[11px] leading-tight text-[color:var(--color-muted)]">
        {consequence}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setConfirming(false);
        }}
        className="flex h-8 items-center gap-1 bg-red-500/90 px-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
      >
        <Trash2 className="size-3.5" />
        Delete
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className={iconButton}
        aria-label="Cancel delete"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** "Using 120 MB of 2 GB" from navigator.storage; refreshes when `version` changes. */
export function StorageMeter({ version }: { version: number }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);

  useEffect(() => {
    void getStorageStatus().then(setStatus);
  }, [version]);

  if (!status || status.quota === 0) {
    return null;
  }

  const percent = Math.min(100, (status.usage / status.quota) * 100);

  return (
    <div
      className="flex items-center gap-2 text-[11px] text-[color:var(--color-muted)]"
      title={
        status.persisted
          ? "Persistent storage granted: the browser won't clear your videos automatically."
          : "The browser may clear stored videos if the device runs low on space."
      }
    >
      <HardDrive className="size-3.5" />
      <span className="font-mono">
        {formatBytes(status.usage)} of {formatBytes(status.quota)}
      </span>
      <span className="h-1 w-16 overflow-hidden bg-white/10">
        <span
          className="block h-full bg-[color:var(--color-accent)]"
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </span>
      {status.persisted ? null : <span className="hidden sm:inline">(not persistent)</span>}
    </div>
  );
}
