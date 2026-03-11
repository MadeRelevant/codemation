import type { Engine, RunStateStore, WorkflowRegistry, WorkflowRunnerService } from "@codemation/core";
import type { CodemationDiscoveredApplicationSetup } from "./bootstrapDiscovery";
import type { CodemationWebhookRegistry } from "./host/codemationWebhookRegistry";

export type CodemationPreparedExecutionRuntime = Readonly<{
  setup: CodemationDiscoveredApplicationSetup;
  engine: Engine;
  workflowRegistry: WorkflowRegistry;
  workflowRunner: WorkflowRunnerService;
  webhookRegistry: CodemationWebhookRegistry;
  runStore: RunStateStore;
}>;
