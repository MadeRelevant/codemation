import { WorkflowDetailPageApiAdapter } from "./WorkflowDetailPageApiAdapter";
import { WorkflowDetailPageAccessResolver } from "./WorkflowDetailPageAccessResolver";

export const workflowDetailPageAccessResolver = new WorkflowDetailPageAccessResolver(
  new WorkflowDetailPageApiAdapter(),
);
