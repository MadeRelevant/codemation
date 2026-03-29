import type { WorkflowDefinition } from "@codemation/core";
import { InMemoryLiveWorkflowRepository } from "@codemation/core";
import type { AIAgentConnectionWorkflowExpander } from "@codemation/core-nodes";

/** Host-owned mutable workflow repository; expands AI agent connections before registration. */
export class LiveWorkflowRepository extends InMemoryLiveWorkflowRepository {
  constructor(private readonly connectionExpander: AIAgentConnectionWorkflowExpander) {
    super();
  }

  setWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    super.setWorkflows(workflows.map((workflow) => this.connectionExpander.expand(workflow)));
  }
}
