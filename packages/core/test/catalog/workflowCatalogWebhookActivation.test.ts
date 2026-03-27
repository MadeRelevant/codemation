import assert from "node:assert/strict";
import { test } from "vitest";

import type { WorkflowActivationPolicy, WorkflowId } from "../../src/contracts/workflowActivationPolicy";
import { WorkflowCatalogWebhookTriggerMatcher } from "../../src/engine/adapters/webhooks/WorkflowCatalogWebhookTriggerMatcher";
import { InMemoryWorkflowRegistry } from "../../src/testing";

class InactiveWorkflowActivationPolicy implements WorkflowActivationPolicy {
  isActive(_workflowId: WorkflowId): boolean {
    return false;
  }
}

test("webhook matcher excludes inactive workflows from the route index", () => {
  const catalog = new InMemoryWorkflowRegistry();
  catalog.setWorkflows([
    {
      id: "wf.webhook",
      name: "W",
      nodes: [
        {
          id: "t",
          kind: "trigger",
          type: class {},
          name: "Webhook",
          config: {
            kind: "trigger",
            type: class {},
            endpointKey: "incoming",
            methods: ["POST"],
          },
        },
      ],
      edges: [],
    },
  ]);
  const matcher = new WorkflowCatalogWebhookTriggerMatcher(catalog, new InactiveWorkflowActivationPolicy());
  matcher.onEngineWorkflowsLoaded();
  assert.equal(matcher.lookup("incoming"), undefined);
});
