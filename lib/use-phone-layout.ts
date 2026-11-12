"use client";

import { useSyncExternalStore } from "react";

/** Phone layout: below Tailwind's `md` breakpoint, the same line as the `max-md:` classes. */
export const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on phone-width screens. CSS handles most of the phone layout with `max-md:`; this is for
 * the parts JS decides (which tool is active, where the checks panel renders). False on the server.
 */
export function usePhoneLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
