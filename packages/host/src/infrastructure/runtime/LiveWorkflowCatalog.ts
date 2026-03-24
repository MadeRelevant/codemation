import type { WorkflowDefinition } from "@codemation/core";
import { InMemoryWorkflowRegistry } from "@codemation/core";
import type { AIAgentConnectionWorkflowExpander } from "@codemation/core-nodes";

/** Host-owned mutable workflow catalog; expands AI agent connections before registration. */
export class LiveWorkflowCatalog extends InMemoryWorkflowRegistry {
  constructor(private readonly connectionExpander: AIAgentConnectionWorkflowExpander) {
    super();
  }

  setWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    super.setWorkflows(workflows.map((workflow) => this.connectionExpander.expand(workflow)));
  }
}
