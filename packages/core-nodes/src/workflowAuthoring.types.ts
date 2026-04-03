export type { WorkflowAgentOptions } from "./workflowAuthoring/WorkflowAuthoringOptions.types";
export { WorkflowAuthoringBuilder } from "./workflowAuthoring/WorkflowAuthoringBuilder.types";
export { WorkflowBranchBuilder } from "./workflowAuthoring/WorkflowBranchBuilder.types";
export { WorkflowChain } from "./workflowAuthoring/WorkflowChain.types";

import { WorkflowAuthoringBuilder } from "./workflowAuthoring/WorkflowAuthoringBuilder.types";

export function workflow(id: string): WorkflowAuthoringBuilder {
  return new WorkflowAuthoringBuilder(id);
}
