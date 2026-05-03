import {
  CoreTokens,
  inject,
  injectable,
  type LiveWorkflowRepository,
  type WorkflowDefinition,
  type WorkflowId,
} from "@codemation/core";

import type { TestRunnerWorkflowLookup } from "./TestRunnerService";

/**
 * Adapts the engine's {@link LiveWorkflowRepository} (which already holds the in-memory list of
 * loaded workflows) into the narrower {@link TestRunnerWorkflowLookup} interface that
 * {@link TestRunnerService} consumes. Keeps the host service decoupled from the engine token.
 */
@injectable()
export class TestRunnerWorkflowLookupAdapter implements TestRunnerWorkflowLookup {
  constructor(@inject(CoreTokens.LiveWorkflowRepository) private readonly liveWorkflows: LiveWorkflowRepository) {}

  resolveWorkflow(workflowId: WorkflowId): WorkflowDefinition | undefined {
    return this.liveWorkflows.get(workflowId);
  }
}
