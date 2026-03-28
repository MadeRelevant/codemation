import type { WorkflowDefinition } from "../../types";

import { WorkflowExecutableNodeClassifier } from "./WorkflowExecutableNodeClassifier";

export class WorkflowExecutableNodeClassifierFactory {
  static create(workflow: WorkflowDefinition): WorkflowExecutableNodeClassifier {
    return new WorkflowExecutableNodeClassifier(workflow);
  }
}
