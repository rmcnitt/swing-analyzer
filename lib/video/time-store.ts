/**
 * A tiny external store for a pane's playhead, read with useSyncExternalStore. Keeps per-frame
 * time updates out of React session state so only the transport bar re-renders while playing.
 */
export function createTimeStore(initial = 0) {
  let time = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => time,
    set(next: number) {
      if (next === time) {
        return;
      }

      time = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type TimeStore = ReturnType<typeof createTimeStore>;
