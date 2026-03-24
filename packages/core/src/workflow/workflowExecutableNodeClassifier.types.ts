import type { WorkflowDefinition } from "../types";

import { WorkflowExecutableNodeClassifier } from "./WorkflowExecutableNodeClassifier";

export function createWorkflowExecutableNodeClassifier(workflow: WorkflowDefinition): WorkflowExecutableNodeClassifier {
  return new WorkflowExecutableNodeClassifier(workflow);
}
