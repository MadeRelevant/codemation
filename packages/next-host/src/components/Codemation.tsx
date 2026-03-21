import type { WorkflowSummary } from "../features/workflows/realtime/realtime";
import { WorkflowsScreen } from "../features/workflows/WorkflowsScreen";

export function Codemation(args: Readonly<{ initialWorkflows: ReadonlyArray<WorkflowSummary> }>) {
  return <WorkflowsScreen {...args} />;
}
