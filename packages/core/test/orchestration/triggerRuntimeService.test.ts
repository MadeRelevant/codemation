/**
 * Unit tests for TriggerRuntimeService — covers the branches not exercised by
 * the existing engine-level integration tests (syncWorkflowTriggersForActivation,
 * createTriggerTestItems with non-testable trigger, logWarn without diagnostics,
 * describeTriggerNode with webhook endpointKey, polling handle wiring).
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { TriggerRuntimeService } from "../../src/orchestration/TriggerRuntimeService";
import { CredentialResolverFactory } from "../../src/execution/CredentialResolverFactory";
import { EngineExecutionLimitsPolicy } from "../../src/policies/executionLimits/EngineExecutionLimitsPolicy";
import { DefaultExecutionContextFactory } from "../../src/execution/DefaultExecutionContextFactory";
import { InMemoryTriggerSetupStateRepository } from "../../src/testing/InMemoryTriggerSetupStateRepository";
import { InMemoryRunDataFactory } from "../../src/bootstrap/index";
import type {
  WorkflowRepository,
  WorkflowActivationPolicy,
  RunIdFactory,
  NodeResolver,
  TriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TypeToken,
  WorkflowDefinition,
} from "../../src/types";
import type { NodeRunStateWriterFactory } from "../../src/execution/NodeRunStateWriterFactory";
import type { PollingTriggerRuntime } from "../../src/triggers/polling/PollingTriggerRuntime";
import type { PollingTriggerDedupWindow } from "../../src/triggers/polling/PollingTriggerDedupWindow";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRunIdFactory(): RunIdFactory {
  let seq = 0;
  return {
    makeRunId: () => `run-${++seq}`,
    makeActivationId: () => `act-${++seq}`,
  };
}

function makeAllActivePolicy(): WorkflowActivationPolicy {
  return { isActive: () => true };
}

function makeInactivePolicy(): WorkflowActivationPolicy {
  return { isActive: () => false };
}

function makeNodeStateFactory(): NodeRunStateWriterFactory {
  return {
    create: () =>
      ({
        publishNodeStarted: async () => {},
        publishNodeCompleted: async () => {},
        publishNodeFailed: async () => {},
        publishConnectionInvocation: async () => {},
      }) as never,
  } as unknown as NodeRunStateWriterFactory;
}

function makePollingRuntime(): PollingTriggerRuntime {
  const started: unknown[] = [];
  const stopped: unknown[] = [];
  return {
    start: async (args: unknown) => {
      started.push(args);
      return { stop: async () => {} };
    },
    stop: async (trigger: unknown) => {
      stopped.push(trigger);
    },
    _started: started,
    _stopped: stopped,
  } as unknown as PollingTriggerRuntime;
}

function makePollingDedupWindow(): PollingTriggerDedupWindow {
  return { isDuplicate: async () => false, markSeen: async () => {} } as unknown as PollingTriggerDedupWindow;
}

class StubTriggerConfig implements TriggerNodeConfig {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = StubTriggerNode;
  constructor(
    public readonly name: string,
    public readonly id?: string,
    public readonly endpointKey?: string,
  ) {}
}

class StubTriggerNode implements TriggerNode<StubTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;
  setupCalled = 0;
  setupShouldThrow = false;
  nextState: unknown = undefined;

  async setup(_ctx: TriggerSetupContext<StubTriggerConfig>): Promise<unknown> {
    this.setupCalled++;
    if (this.setupShouldThrow) throw new Error("trigger-setup-error");
    return this.nextState;
  }

  async execute(): Promise<unknown> {
    return { main: [] };
  }
}

function makeSingleWorkflow(node: StubTriggerNode, config: StubTriggerConfig, workflowId = "wf-1"): WorkflowDefinition {
  return {
    id: workflowId,
    name: "test workflow",
    nodes: [
      {
        id: config.id ?? "trig",
        kind: "trigger",
        name: config.name,
        type: StubTriggerNode,
        config,
      },
    ],
    edges: [],
  };
}

function makeNodeResolver(node: StubTriggerNode): NodeResolver {
  return { resolve: () => node as never, isRegistered: () => true } as unknown as NodeResolver;
}

function makeService(
  workflows: WorkflowDefinition[],
  activationPolicy: WorkflowActivationPolicy,
  node: StubTriggerNode,
  diagnostics?: { info: (m: string) => void; warn: (m: string) => void },
): TriggerRuntimeService {
  const repo: WorkflowRepository = {
    get: (id) => workflows.find((w) => w.id === id),
    list: () => workflows,
  };
  const credentialSessions = {
    getSession: async () => {
      throw new Error("no credentials");
    },
  };
  const credentialResolverFactory = new CredentialResolverFactory(credentialSessions as never);
  const limitsPolicy = new EngineExecutionLimitsPolicy();
  const executionContextFactory = new DefaultExecutionContextFactory();
  const runDataFactory = new InMemoryRunDataFactory();
  const triggerStateRepo = new InMemoryTriggerSetupStateRepository();
  const emitHandler = { emit: async () => {} };

  return new TriggerRuntimeService(
    repo,
    activationPolicy,
    makeRunIdFactory(),
    runDataFactory,
    executionContextFactory,
    credentialResolverFactory,
    makeNodeStateFactory(),
    makeNodeResolver(node),
    triggerStateRepo,
    emitHandler,
    limitsPolicy,
    diagnostics,
    makePollingRuntime(),
    makePollingDedupWindow(),
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TriggerRuntimeService.startTriggers", () => {
  test("calls setup() for each active workflow trigger", async () => {
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("Trigger A", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await svc.startTriggers();
    assert.equal(node.setupCalled, 1);
  });

  test("skips triggers for inactive workflows and logs info when diagnostics present", async () => {
    const infoMessages: string[] = [];
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("Trigger", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeInactivePolicy(), node, {
      info: (m) => infoMessages.push(m),
      warn: () => {},
    });
    await svc.startTriggers();
    assert.equal(node.setupCalled, 0);
    assert.ok(infoMessages.some((m) => m.includes("inactive")));
  });

  test("logs warn via console when trigger setup throws and no diagnostics provided", async () => {
    const warned: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(String(args[0]));
    try {
      const node = new StubTriggerNode();
      node.setupShouldThrow = true;
      const config = new StubTriggerConfig("Trigger", "trig");
      const wf = makeSingleWorkflow(node, config);
      // no diagnostics → falls back to console.warn
      const svc = makeService([wf], makeAllActivePolicy(), node, undefined);
      await svc.startTriggers();
      assert.ok(warned.some((m) => m.includes("[engine]")));
    } finally {
      console.warn = originalWarn;
    }
  });

  test("skips test-trigger-kind nodes", async () => {
    const node = new StubTriggerNode();
    const config = Object.assign(new StubTriggerConfig("Test trigger", "trig"), { triggerKind: "test" as const });
    const wf: WorkflowDefinition = {
      id: "wf-test",
      name: "test",
      nodes: [{ id: "trig", kind: "trigger", name: "T", type: StubTriggerNode, config }],
      edges: [],
    };
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await svc.startTriggers();
    assert.equal(node.setupCalled, 0);
  });

  test("describeTriggerNode includes endpointKey in summary when present", async () => {
    const infoMessages: string[] = [];
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("Webhook", "trig", "/my-hook");
    const wf = makeSingleWorkflow(node, config);
    const inactivePolicy = makeInactivePolicy();
    const svc = makeService([wf], inactivePolicy, node, {
      info: (m) => infoMessages.push(m),
      warn: () => {},
    });
    await svc.startTriggers();
    assert.ok(infoMessages.some((m) => m.includes('webhook "/my-hook"')));
  });
});

describe("TriggerRuntimeService.syncWorkflowTriggersForActivation", () => {
  test("stops and restarts triggers when workflow becomes active", async () => {
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("Trigger", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeAllActivePolicy(), node);
    // start once first
    await svc.startTriggers();
    assert.equal(node.setupCalled, 1);
    // sync should stop then re-start
    await svc.syncWorkflowTriggersForActivation("wf-1");
    assert.equal(node.setupCalled, 2);
  });

  test("stops triggers and does not restart when workflow is inactive", async () => {
    const infoMessages: string[] = [];
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("Trigger", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeInactivePolicy(), node, {
      info: (m) => infoMessages.push(m),
      warn: () => {},
    });
    await svc.syncWorkflowTriggersForActivation("wf-1");
    assert.equal(node.setupCalled, 0);
    assert.ok(infoMessages.some((m) => m.includes("activation off")));
  });

  test("returns early when workflowId is not in repository", async () => {
    const node = new StubTriggerNode();
    const svc = makeService([], makeAllActivePolicy(), node);
    // should not throw
    await svc.syncWorkflowTriggersForActivation("nonexistent");
    assert.equal(node.setupCalled, 0);
  });
});

describe("TriggerRuntimeService.stop", () => {
  test("stop() runs without error even when no triggers started", async () => {
    const node = new StubTriggerNode();
    const wf = makeSingleWorkflow(node, new StubTriggerConfig("T", "t"));
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await svc.stop();
    // No error thrown; trigger was not started so cleanup is a no-op
  });

  test("stop() invokes cleanup handles registered via registerCleanup", async () => {
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("T", "t");
    const wf = makeSingleWorkflow(node, config);
    const cleanupCalled: boolean[] = [];
    const originalSetup = node.setup.bind(node);
    node.setup = async (ctx: TriggerSetupContext<StubTriggerConfig>) => {
      ctx.registerCleanup({
        stop: async () => {
          cleanupCalled.push(true);
        },
      });
      return await originalSetup(ctx);
    };
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await svc.startTriggers();
    await svc.stop();
    assert.deepEqual(cleanupCalled, [true]);
  });
});

describe("TriggerRuntimeService.createTriggerTestItems", () => {
  test("returns undefined for non-testable triggers", async () => {
    const node = new StubTriggerNode(); // no getTestItems
    const config = new StubTriggerConfig("T", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeAllActivePolicy(), node);
    const result = await svc.createTriggerTestItems({ workflow: wf, nodeId: "trig" });
    assert.equal(result, undefined);
  });

  test("throws when nodeId does not exist in workflow", async () => {
    const node = new StubTriggerNode();
    const config = new StubTriggerConfig("T", "trig");
    const wf = makeSingleWorkflow(node, config);
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await assert.rejects(
      () => svc.createTriggerTestItems({ workflow: wf, nodeId: "unknown-node" }),
      /Unknown trigger nodeId/,
    );
  });

  test("throws when nodeId is not a trigger", async () => {
    const node = new StubTriggerNode();
    const wf: WorkflowDefinition = {
      id: "wf-1",
      name: "w",
      nodes: [
        { id: "n1", kind: "node", name: "N", type: class {}, config: { kind: "node", type: class {}, name: "N" } },
      ],
      edges: [],
    };
    const svc = makeService([wf], makeAllActivePolicy(), node);
    await assert.rejects(() => svc.createTriggerTestItems({ workflow: wf, nodeId: "n1" }), /is not a trigger/);
  });
});
