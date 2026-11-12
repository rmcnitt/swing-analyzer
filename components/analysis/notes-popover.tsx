"use client";

import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotesPopoverProps {
  notes: string;
  onNotesChange: (value: string) => void;
}

/** Top-bar "Notes" button with the session notes in a small panel below it. */
export function NotesPopover({ notes, onNotesChange }: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasNotes = notes.trim().length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "relative flex h-8 items-center gap-2 border px-2.5 text-xs",
          open
            ? "border-border-strong bg-surface-2 text-text"
            : "border-border text-text-muted hover:border-border-strong hover:text-text",
        )}
        title={hasNotes ? "Session notes" : "Add session notes"}
      >
        <NotebookPen className="size-3.5" />
        <span className="hidden sm:inline">Notes</span>
        {hasNotes ? (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-text-muted" aria-label="has notes" />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Session notes"
          className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface-1 p-3 shadow-float"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <p className="mb-2 text-xs uppercase tracking-caps text-text-muted">Notes</p>
          <textarea
            autoFocus
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={8}
            className="w-full resize-y border border-border bg-bg px-2.5 py-2 text-sm text-text placeholder:text-text-faint focus:border-border-strong"
            placeholder="What you're working on, what you noticed"
          />
        </div>
      ) : null}
    </div>
  );
}
