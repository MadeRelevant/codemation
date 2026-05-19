import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";

import type { WorkflowActivationPolicy, WorkflowId } from "../../src/contracts/workflowActivationPolicy";
import { WorkflowRepositoryWebhookTriggerMatcher } from "../../src/runtime/WorkflowRepositoryWebhookTriggerMatcher";
import { InMemoryLiveWorkflowRepository } from "../../src/testing";

class InactiveWorkflowActivationPolicy implements WorkflowActivationPolicy {
  isActive(_workflowId: WorkflowId): boolean {
    return false;
  }
}

test("webhook matcher reloadWebhookRoutes rebuilds route index when engine is active", () => {
  const catalog = new InMemoryLiveWorkflowRepository();
  class ActivePolicy implements WorkflowActivationPolicy {
    isActive(_workflowId: WorkflowId): boolean {
      return true;
    }
  }
  catalog.setWorkflows([
    {
      id: "wf.reload",
      name: "Reload W",
      nodes: [
        {
          id: "t",
          kind: "trigger",
          type: class {},
          name: "Webhook",
          config: {
            kind: "trigger",
            type: class {},
            endpointKey: "reload-test",
            methods: ["GET"],
          },
        },
      ],
      edges: [],
    },
  ]);
  const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new ActivePolicy());
  matcher.onEngineWorkflowsLoaded();
  // reloadWebhookRoutes should rebuild while engine is active
  matcher.reloadWebhookRoutes();
  // Route should still be accessible after reload
  assert.ok(matcher.lookup("reload-test") !== undefined);
});

test("webhook matcher match returns undefined when lookup misses", () => {
  const catalog = new InMemoryLiveWorkflowRepository();
  class ActivePolicy implements WorkflowActivationPolicy {
    isActive(_workflowId: WorkflowId): boolean {
      return true;
    }
  }
  catalog.setWorkflows([]);
  const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new ActivePolicy());
  matcher.onEngineWorkflowsLoaded();
  // match on a path that doesn't exist → lookup returns undefined → match returns undefined
  assert.equal(matcher.match({ endpointPath: "nonexistent-path", method: "POST" }), undefined);
});

test("webhook matcher excludes inactive workflows from the route index", () => {
  const catalog = new InMemoryLiveWorkflowRepository();
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
  const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new InactiveWorkflowActivationPolicy());
  matcher.onEngineWorkflowsLoaded();
  assert.equal(matcher.lookup("incoming"), undefined);
});
