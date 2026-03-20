import type { WorkflowSummary } from "../realtime/realtime";
import { WorkflowsScreen } from "../screens/WorkflowsScreen";

export function Codemation(args: Readonly<{ initialWorkflows: ReadonlyArray<WorkflowSummary> }>) {
  return <WorkflowsScreen {...args} />;
}
