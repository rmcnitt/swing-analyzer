/**
 * Real landscape for compare on a phone, where the browser allows it: Android Chrome can lock
 * the orientation, but only in fullscreen and only from a tap. iPhone Safari can't; there the
 * workspace turns itself sideways instead (see lib/analysis/screen-rotation.ts).
 */

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

let locked = false;

/** Call from the tap that opens compare. Resolves true if the phone is now held in landscape. */
export async function lockLandscape(): Promise<boolean> {
  const orientation = screen.orientation as LockableOrientation | undefined;

  if (!orientation?.lock || !document.documentElement.requestFullscreen) {
    return false;
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }

    await orientation.lock("landscape");
    locked = true;
    return true;
  } catch {
    // Not allowed here (desktop, iOS, or no fullscreen): fall back to the turned layout.
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    return false;
  }
}

/** Undo lockLandscape when compare closes. */
export function releaseLandscape() {
  if (!locked) {
    return;
  }

  locked = false;
  screen.orientation?.unlock?.();

  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  }
}
