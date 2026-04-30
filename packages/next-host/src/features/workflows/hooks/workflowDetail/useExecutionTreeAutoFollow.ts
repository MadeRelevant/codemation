import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowExecutionTreeDataLoaderModel } from "../../lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter";

export type ExecutionTreeAutoFollowController = Readonly<{
  /** True when auto-follow will scroll the running node into view as it changes. */
  isFollowing: boolean;
  /** Toggle the follow state explicitly (header button). */
  toggleFollow: () => void;
  /** Re-arm follow (e.g. user picked a row, run switched, follow toggle clicked). */
  resumeFollow: () => void;
  /** Suspend follow (e.g. user wheel/touchmove). */
  pauseFollow: () => void;
}>;

/**
 * Inputs to {@link useExecutionTreeAutoFollow}. Kept as a typed bag so we can extend it without
 * churning every call site.
 */
export type ExecutionTreeAutoFollowInputs = Readonly<{
  treeModel: WorkflowExecutionTreeDataLoaderModel;
  containerRef: React.RefObject<HTMLElement | null>;
  setExpandedItems: (updater: (current: string[]) => string[]) => void;
  /**
   * A stable identity for the current run. When this changes (e.g. user switches runs) the
   * follow state is re-armed automatically.
   */
  runIdentity: string | null;
}>;

/**
 * Auto-follows the currently running tree node by scrolling it into view and ensuring all
 * ancestors are expanded so the running row is rendered. Pauses automatically when the user
 * scrolls manually; can be re-armed via the returned controller or by switching runs.
 *
 * The hook is intentionally non-invasive on the tree's controlled `expandedItems` state: it
 * only ever *adds* keys (ancestors of the running row) and never removes user collapses
 * outside that path.
 */
export function useExecutionTreeAutoFollow(options: ExecutionTreeAutoFollowInputs): ExecutionTreeAutoFollowController {
  const { treeModel, containerRef, setExpandedItems, runIdentity } = options;
  const [paused, setPaused] = useState(false);

  const parentByChildId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [parentId, childIds] of treeModel.childIdsByParentId) {
      for (const childId of childIds) {
        map.set(childId, parentId);
      }
    }
    return map;
  }, [treeModel]);

  const runningKey = useMemo(() => {
    let deepest: { key: string; depth: number } | null = null;
    for (const [key, data] of treeModel.itemDataById) {
      if (data.snapshot?.status !== "running") continue;
      let depth = 0;
      let cursor: string | undefined = key;
      while (cursor !== undefined) {
        const next = parentByChildId.get(cursor);
        if (next === undefined) break;
        depth += 1;
        cursor = next;
      }
      if (!deepest || depth > deepest.depth) {
        deepest = { key, depth };
      }
    }
    return deepest?.key ?? null;
  }, [treeModel, parentByChildId]);

  // Resume follow whenever the run identity changes (switching runs / arming a new run).
  useEffect(() => {
    setPaused(false);
  }, [runIdentity]);

  const lastFollowedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (paused) return;
    if (!runningKey) return;
    if (lastFollowedKeyRef.current === runningKey) return;

    const ancestors: string[] = [];
    let cursor = parentByChildId.get(runningKey);
    while (cursor !== undefined) {
      ancestors.push(cursor);
      cursor = parentByChildId.get(cursor);
    }
    if (ancestors.length > 0) {
      setExpandedItems((current) => {
        const next = new Set(current);
        for (const key of ancestors) next.add(key);
        return Array.from(next);
      });
    }

    const attemptScroll = (): boolean => {
      const container = containerRef.current;
      const target =
        container?.querySelector(`[data-testid="execution-tree-node-${runningKey}"]`) ??
        (typeof document !== "undefined"
          ? document.querySelector(`[data-testid="execution-tree-node-${runningKey}"]`)
          : null);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        lastFollowedKeyRef.current = runningKey;
        return true;
      }
      return false;
    };

    if (attemptScroll()) return;
    // The row may not yet be in the DOM (the headless tree rebuilds its flat-items list inside a
    // layout effect after our state updates land). Retry on the next frame so we still scroll
    // into view as soon as the row appears.
    let cancelled = false;
    const retry = (attemptsRemaining: number): void => {
      if (cancelled) return;
      if (attemptScroll()) return;
      if (attemptsRemaining <= 0) return;
      const schedule =
        typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
      schedule(() => retry(attemptsRemaining - 1));
    };
    retry(8);
    return () => {
      cancelled = true;
    };
  }, [paused, runningKey, parentByChildId, setExpandedItems, containerRef]);

  // Manual scroll (wheel/touchmove) suspends auto-follow until re-armed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onUserScroll = () => setPaused(true);
    container.addEventListener("wheel", onUserScroll, { passive: true });
    container.addEventListener("touchmove", onUserScroll, { passive: true });
    return () => {
      container.removeEventListener("wheel", onUserScroll);
      container.removeEventListener("touchmove", onUserScroll);
    };
  }, [containerRef]);

  const resumeFollow = useCallback(() => {
    lastFollowedKeyRef.current = null;
    setPaused(false);
  }, []);
  const pauseFollow = useCallback(() => setPaused(true), []);
  const toggleFollow = useCallback(() => {
    setPaused((current) => {
      if (current) {
        lastFollowedKeyRef.current = null;
      }
      return !current;
    });
  }, []);

  return {
    isFollowing: !paused,
    toggleFollow,
    resumeFollow,
    pauseFollow,
  };
}
