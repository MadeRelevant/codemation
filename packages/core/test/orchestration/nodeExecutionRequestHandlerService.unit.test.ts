/**
 * Direct-construction core unit tests for NodeExecutionRequestHandlerService.
 *
 * The existing nodeExecutionRequestHandler.test.ts drives the guard paths through the
 * engine test kit. This file constructs the service directly so it can fully control
 * the NodeExecutor (return / throw / RunSuspendedError) and the NodeActivationContinuation
 * (throw ignorable vs non-ignorable continuation errors) — branches not reachable cleanly
 * through the kit. All collaborators are hand-built (no vi.mock).
 */
import { describe, expect, it } from "vitest";

import type {
  NodeActivationContinuation,
  NodeActivationId,
  NodeExecutionRequest,
  NodeExecutor,
  NodeId,
  PersistedRunState,
  ResumeContext,
  RunId,
  RunResult,
  WorkflowDefinition,
  WorkflowId,
} from "../../src/index.ts";
import { InMemoryRunDataFactory } from "../../src/bootstrap/index.ts";
import { NodeActivationRequestComposer } from "../../src/execution/NodeActivationRequestComposer.ts";
import { NodeExecutionRequestHandlerService } from "../../src/orchestration/NodeExecutionRequestHandlerService.ts";
import { RunSuspendedError } from "../../src/execution/RunSuspendedError.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";

const wfId = "wf_h" as WorkflowId;
const nodeId = "n1" as NodeId;
const runId = "run_h" as RunId;
const activationId = "act_h" as NodeActivationId;

function workflowWith(nodes: WorkflowDefinition["nodes"]): WorkflowDefinition {
  return { id: wfId, name: "Handler WF", nodes, edges: [] };
}

const nodeKindWorkflow = workflowWith([
  { id: nodeId, kind: "node", type: {} as never, config: {} as never, name: "N1" },
]);

interface HandlerKitOptions {
  workflow?: WorkflowDefinition;
  /** When true, the snapshot resolver returns undefined (drives the Unknown workflowId branch). */
  unresolvableWorkflow?: boolean;
  executor: NodeExecutor["execute"];
  continuationResult?: () => Promise<RunResult>;
  continuationError?: () => Promise<RunResult>;
}

interface HandlerKit {
  service: NodeExecutionRequestHandlerService;
  repo: InMemoryWorkflowExecutionRepository;
  markRunningCalls: number;
  resultCalls: number;
  errorCalls: number;
}

function createHandlerKit(options: HandlerKitOptions): HandlerKit {
  const repo = new InMemoryWorkflowExecutionRepository();
  const workflow = options.workflow ?? nodeKindWorkflow;

  const kit: HandlerKit = {
    service: undefined as never,
    repo,
    markRunningCalls: 0,
    resultCalls: 0,
    errorCalls: 0,
  };

  const workflowSnapshotResolver = { resolve: () => (options.unresolvableWorkflow ? undefined : workflow) };
  const runDataFactory = new InMemoryRunDataFactory();
  const runExecutionContextFactory = {
    create: () => ({ telemetry: { forNode: () => ({}) }, binary: { forNode: () => ({}) } }) as never,
  };
  const nodeStatePublisherFactory = {
    create: () => ({
      markQueued: async () => {},
      markRunning: async () => {},
      markCompleted: async () => {},
      markFailed: async () => {},
      markSkipped: async () => {},
    }),
  };
  // Composer returns the activation request shape the service needs: it only reads
  // runId / activationId / nodeId off the returned object.
  const composer = {
    createSingleFromDefinitionWithActivation: (args: {
      runId: RunId;
      activationId: NodeActivationId;
      nodeId: NodeId;
      base?: { resumeContext?: unknown };
    }) => ({
      kind: "single",
      runId: args.runId,
      activationId: args.activationId,
      nodeId: args.nodeId ?? nodeId,
      resumeContext: args.base?.resumeContext,
    }),
    createMultiFromDefinitionWithActivation: (args: { runId: RunId; activationId: NodeActivationId }) => ({
      kind: "multi",
      runId: args.runId,
      activationId: args.activationId,
      nodeId,
    }),
  } as unknown as NodeActivationRequestComposer;

  const nodeExecutor: NodeExecutor = { execute: options.executor };

  const continuation: NodeActivationContinuation = {
    markNodeRunning: async () => {
      kit.markRunningCalls += 1;
    },
    resumeFromNodeResult: async () => {
      kit.resultCalls += 1;
      if (options.continuationResult) return options.continuationResult();
      return { runId, workflowId: wfId, startedAt: "", status: "completed", outputs: [] } as RunResult;
    },
    resumeFromNodeError: async () => {
      kit.errorCalls += 1;
      if (options.continuationError) return options.continuationError();
      return { runId, workflowId: wfId, startedAt: "", status: "failed", error: { message: "x" } } as RunResult;
    },
  };

  const executionLimitsPolicy = {
    createRootExecutionOptions: () => ({ maxNodeActivations: 1000, maxSubworkflowDepth: 32 }),
  } as never;

  kit.service = new NodeExecutionRequestHandlerService(
    repo,
    workflowSnapshotResolver as never,
    runDataFactory,
    runExecutionContextFactory as never,
    nodeStatePublisherFactory as never,
    composer,
    nodeExecutor,
    continuation,
    executionLimitsPolicy,
  );

  return kit;
}

async function seedPending(
  repo: InMemoryWorkflowExecutionRepository,
  opts: {
    nodeId?: NodeId;
    inputsByPort?: Record<string, Array<{ json: unknown }>>;
    pendingResume?: PersistedRunState["pendingResume"];
  } = {},
): Promise<void> {
  await repo.createRun({ runId, workflowId: wfId, startedAt: new Date().toISOString() });
  const state = await repo.load(runId);
  await repo.save({
    ...state!,
    status: "pending",
    pendingResume: opts.pendingResume,
    pending: {
      runId,
      workflowId: wfId,
      activationId,
      nodeId: opts.nodeId ?? nodeId,
      itemsIn: 1,
      inputsByPort: (opts.inputsByPort ?? { in: [{ json: {} }] }) as never,
      receiptId: "r1",
      batchId: "batch_1",
      enqueuedAt: new Date().toISOString(),
    },
  } as PersistedRunState);
}

function request(over: Partial<NodeExecutionRequest> = {}): NodeExecutionRequest {
  return { runId, workflowId: wfId, activationId, nodeId, input: [], ...over } as NodeExecutionRequest;
}

// ---------------------------------------------------------------------------

describe("NodeExecutionRequestHandlerService — guards", () => {
  it("returns early when the request activation does not match the pending execution", async () => {
    const kit = createHandlerKit({ executor: async () => ({ main: [] }) });
    await seedPending(kit.repo);
    await kit.service.handleNodeExecutionRequest(request({ activationId: "stale" as NodeActivationId }));
    expect(kit.markRunningCalls).toBe(0);
  });

  it("throws Unknown workflowId when the workflow cannot be resolved", async () => {
    const kit = createHandlerKit({ unresolvableWorkflow: true, executor: async () => ({ main: [] }) });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).rejects.toThrow(/Unknown workflowId/);
  });

  it("throws Unknown nodeId when the workflow has no matching node", async () => {
    const kit = createHandlerKit({
      workflow: workflowWith([
        { id: "other" as NodeId, kind: "node", type: {} as never, config: {} as never, name: "Other" },
      ]),
      executor: async () => ({ main: [] }),
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).rejects.toThrow(/Unknown nodeId/);
  });

  it("throws when the matching definition is not a runnable node", async () => {
    const kit = createHandlerKit({
      workflow: workflowWith([{ id: nodeId, kind: "trigger", type: {} as never, config: {} as never, name: "Trig" }]),
      executor: async () => ({ main: [] }),
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).rejects.toThrow(/is not runnable/);
  });
});

describe("NodeExecutionRequestHandlerService — execution dispatch", () => {
  it("multi-input activation routes through createMultiFromDefinitionWithActivation", async () => {
    let executedKind = "";
    const kit = createHandlerKit({
      executor: async (req) => {
        executedKind = (req as { kind: string }).kind;
        return { main: [] };
      },
    });
    await seedPending(kit.repo, { inputsByPort: { a: [{ json: {} }], b: [{ json: {} }] } });
    await kit.service.handleNodeExecutionRequest(request());
    expect(executedKind).toBe("multi");
    expect(kit.markRunningCalls).toBe(1);
    expect(kit.resultCalls).toBe(1);
  });

  it("splices and clears pendingResume when the activation is a HITL resume", async () => {
    let sawResumeContext = false;
    const resumeContext: ResumeContext = {
      decision: { kind: "decided", value: { approved: true }, actor: { actorId: "u" }, decidedAt: new Date() },
      delivery: {},
      task: { taskId: "t", runId, nodeId, expiresAt: new Date(), resumeUrl: "" },
    } as ResumeContext;
    const kit = createHandlerKit({
      executor: async (req) => {
        sawResumeContext = (req as { resumeContext?: unknown }).resumeContext != null;
        return { main: [] };
      },
    });
    await seedPending(kit.repo, {
      pendingResume: { activationId, nodeId, resumeContext },
    });
    await kit.service.handleNodeExecutionRequest(request());
    // pendingResume cleared after consumption
    const after = await kit.repo.load(runId);
    expect(after?.pendingResume).toBeUndefined();
    expect(sawResumeContext).toBe(true);
  });

  it("RunSuspendedError from executor is swallowed (no result/error continuation)", async () => {
    const kit = createHandlerKit({
      executor: async () => {
        throw new RunSuspendedError(runId, "htask_1");
      },
    });
    await seedPending(kit.repo);
    await kit.service.handleNodeExecutionRequest(request());
    expect(kit.resultCalls).toBe(0);
    expect(kit.errorCalls).toBe(0);
  });

  it("executor error routes to resumeFromNodeError", async () => {
    const kit = createHandlerKit({
      executor: async () => {
        throw new Error("node boom");
      },
    });
    await seedPending(kit.repo);
    await kit.service.handleNodeExecutionRequest(request());
    expect(kit.errorCalls).toBe(1);
  });

  it("coerces a non-Error throw into an Error for resumeFromNodeError", async () => {
    const kit = createHandlerKit({
      executor: async () => {
        throw "string failure";
      },
    });
    await seedPending(kit.repo);
    await kit.service.handleNodeExecutionRequest(request());
    expect(kit.errorCalls).toBe(1);
  });
});

describe("NodeExecutionRequestHandlerService — continuation error handling", () => {
  it("swallows an ignorable continuation error (is not pending) from resumeFromNodeResult", async () => {
    const kit = createHandlerKit({
      executor: async () => ({ main: [] }),
      continuationResult: async () => {
        throw new Error("Run run_h is not pending");
      },
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).resolves.toBeUndefined();
  });

  it("swallows an ignorable continuation error (activationId mismatch)", async () => {
    const kit = createHandlerKit({
      executor: async () => ({ main: [] }),
      continuationResult: async () => {
        throw new Error("activationId mismatch for run run_h");
      },
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).resolves.toBeUndefined();
  });

  it("rethrows a non-ignorable continuation error from resumeFromNodeResult", async () => {
    const kit = createHandlerKit({
      executor: async () => ({ main: [] }),
      continuationResult: async () => {
        throw new Error("unexpected DB failure");
      },
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).rejects.toThrow(/unexpected DB failure/);
  });

  it("swallows an ignorable continuation error (nodeId mismatch) from resumeFromNodeError", async () => {
    const kit = createHandlerKit({
      executor: async () => {
        throw new Error("node boom");
      },
      continuationError: async () => {
        throw new Error("nodeId mismatch for run run_h");
      },
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).resolves.toBeUndefined();
  });

  it("rethrows a non-ignorable continuation error from resumeFromNodeError", async () => {
    const kit = createHandlerKit({
      executor: async () => {
        throw new Error("node boom");
      },
      continuationError: async () => {
        throw new Error("totally different");
      },
    });
    await seedPending(kit.repo);
    await expect(kit.service.handleNodeExecutionRequest(request())).rejects.toThrow(/totally different/);
  });
});
