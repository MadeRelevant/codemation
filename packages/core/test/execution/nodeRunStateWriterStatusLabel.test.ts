import assert from "node:assert/strict";
import { test } from "vitest";

import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";
import { NodeRunStateWriter } from "../../src/execution/NodeRunStateWriter.ts";
import type { ConnectionInvocationRecord } from "../../src/types.ts";

async function makeWriter(): Promise<{
  writer: NodeRunStateWriter;
  repository: InMemoryWorkflowExecutionRepository;
  published: ConnectionInvocationRecord[];
}> {
  const repository = new InMemoryWorkflowExecutionRepository();
  await repository.createRun({
    runId: "run_1",
    workflowId: "wf_1",
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  const published: ConnectionInvocationRecord[] = [];
  const writer = new NodeRunStateWriter(
    repository,
    "run_1",
    "wf_1",
    undefined,
    async () => {},
    async (record) => {
      published.push(record);
    },
  );
  return { writer, repository, published };
}

test("appendConnectionInvocation persists statusLabel onto the stored record", async () => {
  const { writer, repository, published } = await makeWriter();
  await writer.appendConnectionInvocation({
    invocationId: "inv_1",
    connectionNodeId: "conn-A",
    parentAgentNodeId: "agent-1",
    parentAgentActivationId: "act-1",
    status: "running",
    statusLabel: "calling search_messages",
  });
  const state = await repository.load("run_1");
  assert.ok(state);
  assert.equal(state.connectionInvocations?.length, 1);
  assert.equal(state.connectionInvocations?.[0]?.statusLabel, "calling search_messages");
  assert.equal(published.length, 1);
  assert.equal(published[0]?.statusLabel, "calling search_messages");
});

test("appendConnectionInvocation leaves statusLabel undefined when not supplied", async () => {
  const { writer, repository, published } = await makeWriter();
  await writer.appendConnectionInvocation({
    invocationId: "inv_2",
    connectionNodeId: "conn-A",
    parentAgentNodeId: "agent-1",
    parentAgentActivationId: "act-1",
    status: "running",
  });
  const state = await repository.load("run_1");
  assert.ok(state);
  assert.equal(state.connectionInvocations?.[0]?.statusLabel, undefined);
  assert.equal(published[0]?.statusLabel, undefined);
});
