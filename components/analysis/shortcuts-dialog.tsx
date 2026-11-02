"use client";

import { X } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/analysis/shortcuts";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto border border-[color:var(--color-border)] bg-[#101113] p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="flex size-7 items-center justify-center text-[color:var(--color-muted)] hover:bg-white/[0.06] hover:text-white"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-slate-200">{label}</dt>
                    <dd>
                      <kbd className="whitespace-nowrap border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className="mt-4 text-xs text-[color:var(--color-muted)]">
          Playback keys act on the highlighted pane; click a pane to make it active.
        </p>
      </div>
    </div>
  );
}
