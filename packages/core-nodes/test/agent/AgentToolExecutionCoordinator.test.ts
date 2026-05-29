/**
 * Direct unit tests for {@link AgentToolExecutionCoordinator}.
 *
 * These cover branches that the full agent loop (driven via AIAgentNode) cannot reach because
 * AIAgentNode always supplies the optional checkpoint args (conversationSnapshot / turnCount /
 * toolCallCount / modelId). Calling the coordinator directly without those args exercises the
 * `?? fallback` branches inside the SuspensionRequest catch, the non-Error rejection wrapping,
 * and the string-content / non-assistant paths of `extractLastAssistantText`.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import type {
  NodeExecutionContext,
  NodeExecutionStatePublisher,
  NodeInputsByPort,
  NodeOutputs,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
  HumanTaskHandle,
} from "@codemation/core";
import { SuspensionRequest } from "@codemation/core";
import { AgentToolErrorClassifier, AgentToolExecutionCoordinator, AgentToolRepairPolicy } from "@codemation/core-nodes";

import type { AIAgent } from "../../src/nodes/AIAgentConfig";
import type { ItemScopedToolBinding, PlannedToolCall } from "../../src/nodes/aiAgentSupport.types";
import type { ModelMessage } from "ai";

// ---------------------------------------------------------------------------
// Minimal telemetry / state infrastructure (same pattern as AIAgentHitlAsTool.test.ts)
// ---------------------------------------------------------------------------

class StubNodeStatePublisher implements NodeExecutionStatePublisher {
  async markQueued(_: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {}
  async markRunning(_: { nodeId: string; activationId?: string; inputsByPort?: NodeInputsByPort }): Promise<void> {}
  async markCompleted(_: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    outputs?: NodeOutputs;
  }): Promise<void> {}
  async markFailed(_: {
    nodeId: string;
    activationId?: string;
    inputsByPort?: NodeInputsByPort;
    error: Error;
  }): Promise<void> {}
  async appendConnectionInvocation(_: Record<string, unknown>): Promise<void> {}
}

class CapturingTelemetrySpanScope implements TelemetrySpanScope {
  readonly children: CapturingTelemetrySpanScope[] = [];

  constructor(
    public readonly traceId: string,
    public readonly spanId: string,
  ) {}

  addSpanEvent(_args: TelemetrySpanEventRecord): void {}
  recordMetric(_args: TelemetryMetricRecord): void {}
  attachArtifact(_args: TelemetryArtifactAttachment): TelemetryArtifactReference {
    return { artifactId: `${this.spanId}:art` };
  }
  end(_args: TelemetrySpanEnd = {}): void {}
  startChildSpan(_args?: TelemetryChildSpanStart): TelemetrySpanScope {
    const child = new CapturingTelemetrySpanScope(this.traceId, `child-${this.children.length}`);
    this.children.push(child);
    return child;
  }
  forNode(): CapturingTelemetrySpanScope {
    return this;
  }
}

function makeCtx(): NodeExecutionContext<AIAgent<any, any>> {
  return {
    nodeId: "agent_1",
    activationId: "act_1",
    nodeState: new StubNodeStatePublisher(),
    telemetry: new CapturingTelemetrySpanScope("trace-1", "span-1") as any,
  } as unknown as NodeExecutionContext<AIAgent<any, any>>;
}

function makeCoordinator(): AgentToolExecutionCoordinator {
  return new AgentToolExecutionCoordinator(new AgentToolErrorClassifier(), new AgentToolRepairPolicy());
}

// ---------------------------------------------------------------------------
// PlannedToolCall builders (internal data aliases — constructed inline per
// narrowest-layer rule; these are not domain shapes).
// ---------------------------------------------------------------------------

function makeBinding(
  name: string,
  execute: ItemScopedToolBinding["execute"],
  humanApproval?: Readonly<{ onRejected: "halt" | "return" }>,
): ItemScopedToolBinding {
  return {
    config: { name, type: {} as never } as ItemScopedToolBinding["config"],
    inputSchema: z.object({ reason: z.string() }),
    execute,
    ...(humanApproval !== undefined ? { humanApproval } : {}),
  };
}

function makePlanned(binding: ItemScopedToolBinding, toolCallId?: string): PlannedToolCall {
  return {
    binding,
    toolCall: { id: toolCallId, name: binding.config.name, input: { reason: "x" } },
    invocationIndex: 1,
    nodeId: `node:${binding.config.name}`,
    invocationId: `inv_${binding.config.name}`,
  };
}

// Note: branch on line 73 (`reason instanceof Error ? reason : new Error(String(reason))`,
// the else-branch) is defensively unreachable: `executePlannedToolCall` only ever rejects with
// an `Error` (the classifier's `effectiveError` / `exhaustedError`) or a `SuspensionRequest`
// (handled by the preceding `instanceof SuspensionRequest` guard). No test can force a
// non-Error rejection through that code path, so it is left uncovered intentionally.

function makeSuspensionRequest(): SuspensionRequest {
  return new SuspensionRequest({
    decisionSchema: z.object({ approved: z.boolean() }),
    timeout: "PT24H",
    onTimeout: "halt",
    subject: { title: "Approve", summary: "needs approval" },
    deliver: async (handle: HumanTaskHandle) => ({ taskId: handle.taskId }),
  });
}

// ---------------------------------------------------------------------------
// Test A: Suspension catch WITHOUT optional checkpoint args → all `?? fallback`
// branches taken (conversationSnapshot/turnCount/toolCallCount/modelId/onRejected).
// ---------------------------------------------------------------------------

test("suspension without checkpoint args produces a checkpoint with default fallbacks", async () => {
  const coordinator = makeCoordinator();
  const binding = makeBinding(
    "approval_tool",
    async () => {
      throw makeSuspensionRequest();
    },
    // humanApproval present but with no onRejected → exercises `?? "return"` (line 195)
    {} as Readonly<{ onRejected: "halt" | "return" }>,
  );
  const planned = makePlanned(binding); // no toolCallId → exercises `?? binding.config.name` (line 178)

  let thrown: unknown;
  try {
    await coordinator.execute({
      plannedToolCalls: [planned],
      ctx: makeCtx(),
      agentName: "AgentX",
      repairAttemptsByToolName: new Map(),
      // No conversationSnapshot / turnCount / toolCallCount / modelId supplied.
    });
  } catch (e) {
    thrown = e;
  }

  assert.ok(thrown instanceof SuspensionRequest, "should rethrow an augmented SuspensionRequest");
  const metadata = (thrown as SuspensionRequest).request.metadata;
  assert.ok(metadata, "metadata present");
  const checkpoint = metadata!["agentCheckpoint"] as Record<string, unknown>;
  assert.deepEqual(checkpoint["conversation"], [], "conversation defaults to empty array");
  assert.equal(checkpoint["turnCount"], 0, "turnCount defaults to 0");
  assert.equal(checkpoint["toolCallCount"], 0, "toolCallCount defaults to 0");
  assert.equal(checkpoint["modelId"], "", "modelId defaults to empty string");
  assert.equal(checkpoint["agentName"], "AgentX");
  assert.equal(checkpoint["pendingToolCallId"], "approval_tool", "pendingToolCallId falls back to tool name");
  assert.equal(metadata!["onRejected"], "return", "onRejected defaults to return");
  assert.equal(metadata!["agentReasoning"], "", "agentReasoning empty when no conversation snapshot");
});

// ---------------------------------------------------------------------------
// Test B: extractLastAssistantText — string assistant content reached past a
// trailing non-assistant message (covers the `continue` + string-return paths).
// ---------------------------------------------------------------------------

test("suspension captures agentReasoning from a string-content assistant message before a trailing tool message", async () => {
  const coordinator = makeCoordinator();
  const binding = makeBinding(
    "approval_tool",
    async () => {
      throw makeSuspensionRequest();
    },
    { onRejected: "halt" },
  );
  const planned = makePlanned(binding, "tc_1");

  // Last message is a non-assistant (tool) message → loop must `continue` past it,
  // then find the assistant message whose content is a plain string → string-return path.
  const conversationSnapshot: ModelMessage[] = [
    { role: "user", content: "please approve" },
    { role: "assistant", content: "Reasoning: I will request approval now." },
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "tc_prev", toolName: "x", output: { type: "json", value: {} } }],
    },
  ];

  let thrown: unknown;
  try {
    await coordinator.execute({
      plannedToolCalls: [planned],
      ctx: makeCtx(),
      agentName: "AgentX",
      repairAttemptsByToolName: new Map(),
      conversationSnapshot,
      turnCount: 3,
      toolCallCount: 2,
      modelId: "test-model",
    });
  } catch (e) {
    thrown = e;
  }

  assert.ok(thrown instanceof SuspensionRequest);
  const metadata = (thrown as SuspensionRequest).request.metadata;
  assert.equal(
    metadata!["agentReasoning"],
    "Reasoning: I will request approval now.",
    "agentReasoning should be the string content of the last assistant message",
  );
  assert.equal(metadata!["onRejected"], "halt", "onRejected reflects the binding's halt policy");
  const checkpoint = metadata!["agentCheckpoint"] as Record<string, unknown>;
  assert.equal(checkpoint["turnCount"], 3);
  assert.equal(checkpoint["toolCallCount"], 2);
  assert.equal(checkpoint["modelId"], "test-model");
});
