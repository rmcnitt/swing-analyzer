"use client";

import { useRef, useState } from "react";
import { Tag } from "lucide-react";
import type { AnnotationObject } from "@/lib/types";

interface ShapeLabelEditorProps {
  annotation: AnnotationObject;
  onCommit: (label: string) => void;
}

/** Floating field for naming the selected shape (e.g. "Shaft plane"); commits on Enter/blur. */
export function ShapeLabelEditor({ annotation, onCommit }: ShapeLabelEditorProps) {
  const [draft, setDraft] = useState(annotation.label ?? "");
  const cancelledRef = useRef(false);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }

    const next = draft.trim();

    if (next !== (annotation.label ?? "")) {
      onCommit(next);
    }
  };

  return (
    <div
      className="absolute left-2 top-2 z-10 flex items-center gap-1.5 border border-[color:var(--color-border)] bg-black/80 px-2 py-1"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Tag className="size-3.5 text-[color:var(--color-muted)]" />
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            cancelledRef.current = true;
            setDraft(annotation.label ?? "");
            event.currentTarget.blur();
          }
        }}
        placeholder="Label this shape"
        maxLength={40}
        aria-label="Shape label"
        className="h-6 w-40 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
      />
    </div>
  );
}
