"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { NavigationAdapter } from "../types/NavigationAdapter";
import type { WorkflowDetailUrlLocation } from "../lib/workflowDetail/WorkflowDetailUrlCodec";

const INITIAL_LOCATION: WorkflowDetailUrlLocation = {
  selectedRunId: null,
  isRunsPaneVisible: false,
  nodeId: null,
};

export function useLocalNavigation(): NavigationAdapter {
  const [urlLocation, setUrlLocation] = useState<WorkflowDetailUrlLocation>(INITIAL_LOCATION);
  const setRef = useRef(setUrlLocation);
  setRef.current = setUrlLocation;
  const navigateToLocation = useCallback((location: WorkflowDetailUrlLocation) => {
    setRef.current(location);
  }, []);
  return useMemo(() => ({ urlLocation, navigateToLocation }), [urlLocation, navigateToLocation]);
}
