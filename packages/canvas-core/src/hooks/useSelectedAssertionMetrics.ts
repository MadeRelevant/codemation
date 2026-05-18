"use client";
import { useCallback, useState } from "react";

const STORAGE_KEY_PREFIX = "codemation.tests.selectedMetrics.";

function readFromStorage(workflowId: string): ReadonlySet<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + workflowId);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function writeToStorage(workflowId: string, names: ReadonlySet<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = STORAGE_KEY_PREFIX + workflowId;
  if (names.size === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify([...names].sort()));
}

/**
 * Persists the user's selected assertion-metric names per workflow in localStorage so reopening
 * the Tests panel shows the same chart lines they had before. SSR-safe: lazy-init on the client,
 * empty Set on the server. Default is **empty** — only the pass-rate line is visible until the
 * user explicitly picks at least one metric.
 */
export function useSelectedAssertionMetrics(
  workflowId: string,
): readonly [ReadonlySet<string>, (names: ReadonlySet<string>) => void] {
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(() => readFromStorage(workflowId));

  const setSelected = useCallback(
    (names: ReadonlySet<string>) => {
      writeToStorage(workflowId, names);
      // Always wrap in a fresh Set so React reference equality picks up the change.
      setSelectedState(new Set(names));
    },
    [workflowId],
  );

  return [selected, setSelected] as const;
}
