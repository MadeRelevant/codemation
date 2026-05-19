import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { WorkflowRepositoryWebhookTriggerMatcher } from "../../src/runtime/WorkflowRepositoryWebhookTriggerMatcher";
import { InMemoryLiveWorkflowRepository } from "../../src/testing";
import type { WorkflowActivationPolicy, WorkflowId, WorkflowDefinition } from "../../src/types";

class AllActivePolicy implements WorkflowActivationPolicy {
  isActive(_id: WorkflowId): boolean {
    return true;
  }
}

class AllInactivePolicy implements WorkflowActivationPolicy {
  isActive(_id: WorkflowId): boolean {
    return false;
  }
}

function makeWebhookWorkflow(id: string, endpointKey: string, methods = ["POST"]): WorkflowDefinition {
  return {
    id,
    name: id,
    nodes: [
      {
        id: "trig",
        kind: "trigger",
        name: "Webhook",
        type: class {},
        config: { kind: "trigger", type: class {}, endpointKey, methods },
      },
    ],
    edges: [],
  };
}

function makeNoWebhookWorkflow(id: string): WorkflowDefinition {
  // trigger without endpointKey → not a webhook trigger
  return {
    id,
    name: id,
    nodes: [
      {
        id: "trig",
        kind: "trigger",
        name: "Polling",
        type: class {},
        config: { kind: "trigger", type: class {} },
      },
    ],
    edges: [],
  };
}

describe("WorkflowRepositoryWebhookTriggerMatcher", () => {
  test("lookup returns undefined when engine is not active", () => {
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/hook")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy());
    // engine never started → lookup returns undefined
    assert.equal(matcher.lookup("/hook"), undefined);
  });

  test("lookup returns undefined after engine stopped", () => {
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/hook")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy());
    matcher.onEngineWorkflowsLoaded();
    matcher.onEngineStopped();
    assert.equal(matcher.lookup("/hook"), undefined);
  });

  test("reloadWebhookRoutes is no-op when engine not active", () => {
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/hook")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy());
    // engine not started; reload should not crash and route stays empty
    matcher.reloadWebhookRoutes();
    assert.equal(matcher.lookup("/hook"), undefined);
  });

  test("match returns entry when method matches", () => {
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/hook", ["GET", "POST"])]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy());
    matcher.onEngineWorkflowsLoaded();
    const result = matcher.match({ endpointPath: "/hook", method: "GET" });
    assert.ok(result !== undefined);
    assert.equal(result?.workflowId, "wf1");
  });

  test("match returns undefined when method does not match", () => {
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/hook", ["GET"])]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy());
    matcher.onEngineWorkflowsLoaded();
    const result = matcher.match({ endpointPath: "/hook", method: "DELETE" });
    assert.equal(result, undefined);
  });

  test("inactive workflow with triggers logs info when diagnostics present", () => {
    const infoMessages: string[] = [];
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf-inactive", "/secret")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllInactivePolicy(), {
      info: (m) => infoMessages.push(m),
      warn: () => {},
    });
    matcher.onEngineWorkflowsLoaded();
    assert.ok(infoMessages.some((m) => m.includes("inactive")));
  });

  test("inactive workflow with no webhook triggers logs no-webhook-routes info", () => {
    const infoMessages: string[] = [];
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeNoWebhookWorkflow("wf-polling")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllInactivePolicy(), {
      info: (m) => infoMessages.push(m),
      warn: () => {},
    });
    matcher.onEngineWorkflowsLoaded();
    // Should log "other trigger kinds are unchanged" path
    assert.ok(infoMessages.some((m) => m.includes("inactive")));
  });

  test("duplicate endpoint path triggers warn from diagnostics", () => {
    const warnings: string[] = [];
    const catalog = new InMemoryLiveWorkflowRepository();
    catalog.setWorkflows([makeWebhookWorkflow("wf1", "/dup"), makeWebhookWorkflow("wf2", "/dup")]);
    const matcher = new WorkflowRepositoryWebhookTriggerMatcher(catalog, new AllActivePolicy(), {
      info: () => {},
      warn: (m) => warnings.push(m),
    });
    matcher.onEngineWorkflowsLoaded();
    assert.ok(warnings.some((m) => m.includes("Duplicate")));
  });
});
