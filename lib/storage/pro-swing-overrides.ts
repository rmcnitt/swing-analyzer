"use client";

import type { ProSwingReference } from "@/lib/types";

export type ProSwingOverride = Partial<
  Pick<
    ProSwingReference,
    "player" | "title" | "club" | "viewAngle" | "handedness" | "fps" | "duration" | "tags"
  >
>;

const overridesKey = "swing-analyzer-pro-swing-overrides";

export function loadProSwingOverrides() {
  if (typeof window === "undefined") {
    return {};
  }

  const payload = window.localStorage.getItem(overridesKey);

  if (!payload) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, ProSwingOverride>)
      : {};
  } catch {
    return {};
  }
}

export function saveProSwingOverride(id: string, override: ProSwingOverride) {
  if (typeof window === "undefined") {
    return {};
  }

  const next = {
    ...loadProSwingOverrides(),
    [id]: override,
  };

  window.localStorage.setItem(overridesKey, JSON.stringify(next));
  return next;
}

export function applyProSwingOverrides(
  references: ProSwingReference[],
  overrides: Record<string, ProSwingOverride>,
) {
  return references.map((reference) => ({
    ...reference,
    ...overrides[reference.id],
  }));
}
