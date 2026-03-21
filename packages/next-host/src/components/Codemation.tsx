import type { WorkflowSummary } from "../features/workflows/hooks/realtime/realtime";
import { WorkflowsScreen } from "../features/workflows/screens/WorkflowsScreen";

export function Codemation(args: Readonly<{ initialWorkflows: ReadonlyArray<WorkflowSummary> }>) {
  return <WorkflowsScreen {...args} />;
}
