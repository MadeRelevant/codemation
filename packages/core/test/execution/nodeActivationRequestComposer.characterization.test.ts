import assert from "node:assert/strict";
import { test } from "vitest";

import type { ActivationIdFactory, CredentialSessionService, NodeId, WorkflowId } from "../../src/index.ts";
import { CredentialResolverFactory } from "../../src/execution/CredentialResolverFactory.ts";
import { DefaultExecutionContextFactory } from "../../src/execution/DefaultExecutionContextFactory.ts";
import { NodeActivationRequestComposer } from "../../src/execution/NodeActivationRequestComposer.ts";
import { WorkflowRunExecutionContextFactory } from "../../src/execution/WorkflowRunExecutionContextFactory.ts";
import { InMemoryBinaryStorage } from "../../src/runStorage/InMemoryBinaryStorageRegistry.ts";
import { InMemoryRunDataFactory } from "../../src/runStorage/InMemoryRunDataFactory.ts";
import { CallbackNodeConfig, chain, items } from "../harness/index.ts";

class InMemoryCredentialSessionService implements CredentialSessionService {
  private readonly sessions = new Map<string, unknown>();

  private static key(workflowId: WorkflowId, nodeId: NodeId, slotKey: string): string {
    return `${workflowId}::${nodeId}::${slotKey}`;
  }

  seed(workflowId: WorkflowId, nodeId: NodeId, slotKey: string, session: unknown): void {
    this.sessions.set(InMemoryCredentialSessionService.key(workflowId, nodeId, slotKey), session);
  }

  async getSession<TSession = unknown>(
    args: Readonly<{ workflowId: WorkflowId; nodeId: NodeId; slotKey: string }>,
  ): Promise<TSession> {
    const hit = this.sessions.get(InMemoryCredentialSessionService.key(args.workflowId, args.nodeId, args.slotKey));
    if (hit === undefined) {
      throw new Error(
        `No credential seeded for workflow ${args.workflowId} node ${args.nodeId} slot "${args.slotKey}"`,
      );
    }
    return hit as TSession;
  }
}

class SequentialActivationIdFactory implements ActivationIdFactory {
  private n = 0;
  makeActivationId(): string {
    this.n += 1;
    return `act_seq_${this.n}`;
  }
}

test("NodeActivationRequestComposer.createSingleFromDefinition wires kind, ids, getCredential, and binary.forNode", async () => {
  const credentialSessions = new InMemoryCredentialSessionService();
  credentialSessions.seed("wf_comp", "N1", "slot_a", { token: "secret-a" });

  const composer = new NodeActivationRequestComposer(
    new SequentialActivationIdFactory(),
    new CredentialResolverFactory(credentialSessions),
  );

  const def = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const wf = chain({ id: "wf_comp", name: "composer single" }).start(def).build();
  const nodeDef = wf.nodes.find((n) => n.id === "N1");
  assert.ok(nodeDef);

  const binaryStorage = new InMemoryBinaryStorage();
  const runDataFactory = new InMemoryRunDataFactory();
  const data = runDataFactory.create();
  const executionContextFactory = new DefaultExecutionContextFactory(
    binaryStorage,
    () => new Date("2026-03-27T00:00:00.000Z"),
  );
  const runCtxFactory = new WorkflowRunExecutionContextFactory(
    executionContextFactory,
    new CredentialResolverFactory(credentialSessions),
  );

  const base = runCtxFactory.create({
    runId: "run_c1",
    workflowId: wf.id,
    nodeId: "N1",
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 5,
    data,
  });

  const input = items([{ x: 1 }]);
  const request = composer.createSingleFromDefinition({
    runId: "run_c1",
    workflowId: wf.id,
    definition: nodeDef,
    batchId: "batch_1",
    input,
    base,
    data,
  });

  assert.equal(request.kind, "single");
  assert.equal(request.nodeId, "N1");
  assert.equal(request.activationId, "act_seq_1");
  assert.equal(request.ctx.activationId, request.activationId);
  assert.equal(request.ctx.nodeId, "N1");
  assert.equal(request.batchId, "batch_1");
  assert.deepEqual(request.input, input);

  const cred = await request.ctx.getCredential<{ token: string }>("slot_a");
  assert.deepEqual(cred, { token: "secret-a" });

  const attachment = await request.ctx.binary.attach({
    name: "payload",
    body: new Uint8Array([1, 2, 3]),
    mimeType: "application/octet-stream",
    filename: "blob.bin",
  });
  assert.equal(attachment.nodeId, "N1");
  assert.equal(attachment.activationId, "act_seq_1");
  assert.equal(attachment.workflowId, wf.id);
  assert.equal(attachment.runId, "run_c1");
});

test("NodeActivationRequestComposer.createFromPlannedActivation builds multi requests with inputsByPort and shared ctx wiring", async () => {
  const credentialSessions = new InMemoryCredentialSessionService();
  credentialSessions.seed("wf_multi", "M", "k", { ok: true });

  const composer = new NodeActivationRequestComposer(
    new SequentialActivationIdFactory(),
    new CredentialResolverFactory(credentialSessions),
  );

  const def = new CallbackNodeConfig("M", () => {}, { id: "M" });
  const wf = chain({ id: "wf_multi", name: "composer multi" }).start(def).build();
  const nodeDef = wf.nodes.find((n) => n.id === "M");
  assert.ok(nodeDef);

  const runDataFactory = new InMemoryRunDataFactory();
  const data = runDataFactory.create();
  const executionContextFactory = new DefaultExecutionContextFactory();
  const runCtxFactory = new WorkflowRunExecutionContextFactory(
    executionContextFactory,
    new CredentialResolverFactory(credentialSessions),
  );

  const base = runCtxFactory.create({
    runId: "run_m1",
    workflowId: wf.id,
    nodeId: "M",
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 5,
    data,
  });

  const portA = items([{ port: "a" }]);
  const portB = items([{ port: "b" }]);
  const next = {
    kind: "multi" as const,
    nodeId: "M" as const,
    batchId: "batch_merge",
    inputsByPort: { in_a: portA, in_b: portB },
  };

  const request = composer.createFromPlannedActivation({
    next,
    base,
    data,
    runId: "run_m1",
    workflowId: wf.id,
    nodeDefinition: nodeDef,
  });

  assert.equal(request.kind, "multi");
  assert.equal(request.batchId, "batch_merge");
  assert.deepEqual(request.inputsByPort.in_a, portA);
  assert.deepEqual(request.inputsByPort.in_b, portB);
  assert.equal(request.activationId, "act_seq_1");
  assert.equal(request.ctx.activationId, request.activationId);
  assert.equal(request.ctx.nodeId, "M");

  assert.deepEqual(await request.ctx.getCredential("k"), { ok: true });
});
