"use client";

import { X } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/analysis/shortcuts";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-panel border border-border bg-surface-1 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-text">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="flex size-7 items-center justify-center text-text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-xs uppercase tracking-caps text-text-muted">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-text">{label}</dt>
                    <dd>
                      <kbd className="whitespace-nowrap border border-border bg-bg/40 px-1.5 py-0.5 font-mono text-xs text-text">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className="mt-4 text-xs text-text-muted">
          Playback keys act on the highlighted pane; click a pane to make it active.
        </p>
      </div>
    </div>
  );
}
