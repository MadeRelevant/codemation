import type { WorkflowSummary } from "@codemation/canvas";
import { WorkflowsScreen } from "../features/workflows/screens/WorkflowsScreen";

export function Codemation(args: Readonly<{ initialWorkflows: ReadonlyArray<WorkflowSummary> }>) {
  return <WorkflowsScreen {...args} />;
}
