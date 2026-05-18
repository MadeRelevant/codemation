import type { WorkflowDetailUrlLocation } from "../lib/workflowDetail/WorkflowDetailUrlCodec";

export type NavigationAdapter = Readonly<{
  urlLocation: WorkflowDetailUrlLocation;
  navigateToLocation: (location: WorkflowDetailUrlLocation) => void;
}>;
