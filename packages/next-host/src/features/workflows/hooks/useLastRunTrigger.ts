import { useCallback, useState } from "react";

/**
 * Hook for persisting the last manually-chosen trigger per workflow in localStorage.
 * Tolerates SSR by lazy-init; returns [lastTriggerNodeId, setLastTriggerNodeId].
 */
export function useLastRunTrigger(
  workflowId: string,
): readonly [string | null, (nodeId: string | null) => void] {
  const [lastTriggerNodeId, setLastTriggerNodeIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const key = `codemation.canvas.runTrigger.${workflowId}`;
    return localStorage.getItem(key);
  });

  const setLastTriggerNodeId = useCallback(
    (nodeId: string | null) => {
      const key = `codemation.canvas.runTrigger.${workflowId}`;
      if (nodeId === null) {
        if (typeof window !== "undefined") {
          localStorage.removeItem(key);
        }
        setLastTriggerNodeIdState(null);
      } else {
        if (typeof window !== "undefined") {
          localStorage.setItem(key, nodeId);
        }
        setLastTriggerNodeIdState(nodeId);
      }
    },
    [workflowId],
  );

  return [lastTriggerNodeId, setLastTriggerNodeId] as const;
}
