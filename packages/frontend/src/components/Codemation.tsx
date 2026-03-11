import type { WorkflowSummary } from "../realtime/realtime";
import { WorkflowsScreen } from "../routes/WorkflowsScreen";

export function Codemation(args: Readonly<{ initialWorkflows: ReadonlyArray<WorkflowSummary> }>) {
  return <WorkflowsScreen {...args} />;
}
