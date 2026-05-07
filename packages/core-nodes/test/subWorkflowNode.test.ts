import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  RunnableNodeExecuteArgs,
  WorkflowRunnerService,
} from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";

import { SubWorkflow, SubWorkflowNode } from "../src/nodes/subWorkflow.ts";

class SubWorkflowNodeContextFactory {
  static create(
    config: SubWorkflow<any, any>,
    overrides?: {
      workflows?: WorkflowRunnerService;
      nodeState?: NodeExecutionStatePublisher;
    },
  ): NodeExecutionContext<SubWorkflow<any, any>> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf.parent",
      "run_parent",
      () => new Date("2026-05-07T12:00:00.000Z"),
    );
    return {
      runId: "run_parent",
      workflowId: "wf.parent",
      nodeId: "sub",
      activationId: "act_sub",
      now: () => new Date("2026-05-07T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      parent: undefined,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100,
      engineMaxSubworkflowDepth: 8,
      binary: binary.forNode({ nodeId: "sub", activationId: "act_sub" }),
      telemetry: { forNode: () => ({}) as never } as never,
      getCredential: async () => {
        throw new Error("unused");
      },
      config,
      nodeState: overrides?.nodeState,
      ...("workflows" in (overrides ?? {}) ? { workflows: overrides!.workflows } : {}),
    };
  }
}

class StubWorkflowRunnerService implements WorkflowRunnerService {
  constructor(private readonly result: Awaited<ReturnType<WorkflowRunnerService["runById"]>>) {}

  async runById(): Promise<Awaited<ReturnType<WorkflowRunnerService["runById"]>>> {
    return this.result;
  }
}

function makeArgs(ctx: NodeExecutionContext<SubWorkflow<any, any>>): RunnableNodeExecuteArgs<SubWorkflow<any, any>> {
  const item = { json: { x: 1 } };
  return { input: { x: 1 }, item, itemIndex: 0, items: [item], ctx };
}

test("SubWorkflowNode calls setChildRunId with the child run id after runById resolves", async () => {
  const childRunIdCalls: Array<{ nodeId: string; childRunId: string }> = [];
  const nodeState: NodeExecutionStatePublisher = {
    markQueued: async () => {},
    markRunning: async () => {},
    markCompleted: async () => {},
    markFailed: async () => {},
    appendConnectionInvocation: async () => {},
    setChildRunId: async (args) => {
      childRunIdCalls.push({ nodeId: args.nodeId, childRunId: args.childRunId });
    },
  };

  const workflows = new StubWorkflowRunnerService({
    runId: "child-run-1",
    workflowId: "wf.child",
    startedAt: "2026-05-07T12:00:00.000Z",
    status: "completed",
    outputs: [{ json: { result: true } }],
  });

  const config = new SubWorkflow("Sub", "wf.child");
  const node = new SubWorkflowNode(workflows);
  const ctx = SubWorkflowNodeContextFactory.create(config, { nodeState });

  await node.execute(makeArgs(ctx));

  assert.equal(childRunIdCalls.length, 1);
  assert.equal(childRunIdCalls[0]!.nodeId, "sub");
  assert.equal(childRunIdCalls[0]!.childRunId, "child-run-1");
});

test("SubWorkflowNode calls setChildRunId BEFORE throwing when the child run fails", async () => {
  const childRunIdCalls: Array<{ nodeId: string; childRunId: string }> = [];
  const nodeState: NodeExecutionStatePublisher = {
    markQueued: async () => {},
    markRunning: async () => {},
    markCompleted: async () => {},
    markFailed: async () => {},
    appendConnectionInvocation: async () => {},
    setChildRunId: async (args) => {
      childRunIdCalls.push({ nodeId: args.nodeId, childRunId: args.childRunId });
    },
  };

  const workflows = new StubWorkflowRunnerService({
    runId: "child-run-failed",
    workflowId: "wf.child",
    startedAt: "2026-05-07T12:00:00.000Z",
    status: "failed",
    error: { message: "child exploded" },
  });

  const config = new SubWorkflow("Sub", "wf.child");
  const node = new SubWorkflowNode(workflows);
  const ctx = SubWorkflowNodeContextFactory.create(config, { nodeState });

  await assert.rejects(() => node.execute(makeArgs(ctx)), /did not complete/);

  // setChildRunId must have been called BEFORE the throw so the UI can still deep-link.
  assert.equal(childRunIdCalls.length, 1);
  assert.equal(childRunIdCalls[0]!.childRunId, "child-run-failed");
});

test("SubWorkflowNode works when nodeState is absent (backwards compat)", async () => {
  const workflows = new StubWorkflowRunnerService({
    runId: "child-run-2",
    workflowId: "wf.child",
    startedAt: "2026-05-07T12:00:00.000Z",
    status: "completed",
    outputs: [{ json: { y: 2 } }],
  });

  const config = new SubWorkflow("Sub", "wf.child");
  const node = new SubWorkflowNode(workflows);
  const ctx = SubWorkflowNodeContextFactory.create(config);

  // Should not throw even though nodeState is absent.
  const result = await node.execute(makeArgs(ctx));
  assert.ok(result);
});

test("SubWorkflowNode works when setChildRunId is absent on nodeState (backwards compat)", async () => {
  const nodeState: NodeExecutionStatePublisher = {
    markQueued: async () => {},
    markRunning: async () => {},
    markCompleted: async () => {},
    markFailed: async () => {},
    appendConnectionInvocation: async () => {},
    // setChildRunId intentionally omitted to simulate older runtime.
  };

  const workflows = new StubWorkflowRunnerService({
    runId: "child-run-3",
    workflowId: "wf.child",
    startedAt: "2026-05-07T12:00:00.000Z",
    status: "completed",
    outputs: [{ json: { z: 3 } }],
  });

  const config = new SubWorkflow("Sub", "wf.child");
  const node = new SubWorkflowNode(workflows);
  const ctx = SubWorkflowNodeContextFactory.create(config, { nodeState });

  const result = await node.execute(makeArgs(ctx));
  assert.ok(result);
});
