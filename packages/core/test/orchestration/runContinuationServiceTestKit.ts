/**
 * Test support for RunContinuationService core unit tests.
 *
 * Mirrors the `makeService` helper in packages/host/test/engine/HitlNodeStatus.test.ts
 * but is parameterised so individual tests can override the workflow, the planning
 * factory (to drive `nextActivation` throw / next-node paths), the enqueue service
 * (to drive success vs rejection), and the policy error handlers.
 *
 * Lives in core so its coverage of RunContinuationService is attributed to the
 * `core` codecov flag (host's coverage only instruments packages/host/src).
 */
import type {
  NodeActivationId,
  NodeExecutionSnapshot,
  NodeId,
  PersistedRunState,
  RunId,
  RunResult,
  WorkflowDefinition,
  WorkflowId,
} from "../../src/index.ts";
import { InMemoryRunDataFactory } from "../../src/bootstrap/index.ts";
import { ActivationEnqueueService } from "../../src/execution/ActivationEnqueueService.ts";
import { EngineWaiters } from "../../src/orchestration/EngineWaiters.ts";
import { EngineWorkflowPlanningFactory } from "../../src/planning/EngineWorkflowPlanningFactory.ts";
import { NodeEventPublisher } from "../../src/events/NodeEventPublisher.ts";
import { PersistedRunStateTerminalBuilder } from "../../src/execution/PersistedRunStateTerminalBuilder.ts";
import { RunContinuationService } from "../../src/orchestration/RunContinuationService.ts";
import { RunStateSemantics } from "../../src/execution/RunStateSemantics.ts";
import { MissingRuntimeExecutionMarker } from "../../src/workflowSnapshots/MissingRuntimeExecutionMarker.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";

export type WorkflowErrorHandlerLike = {
  onError: (args: unknown) => void | Promise<void>;
};

export type NodeErrorHandlerLike = {
  handle: (args: unknown) => unknown | Promise<unknown>;
};

export interface RunContinuationKitOptions {
  workflow: WorkflowDefinition;
  /** Override the planning factory to control planner.nextActivation / applyOutputs. */
  planningFactory?: EngineWorkflowPlanningFactory;
  /** Override the enqueue service (default throws to assert it is never called). */
  enqueueResult?: { result: RunResult; queuedSnapshot: NodeExecutionSnapshot } | Error;
  /** Workflow-level error handler resolved by policyErrorServices. */
  workflowErrorHandler?: WorkflowErrorHandlerLike;
  /** Node-level error handler resolved by policyErrorServices. */
  nodeErrorHandler?: NodeErrorHandlerLike;
}

export interface RunContinuationKit {
  service: RunContinuationService;
  repo: InMemoryWorkflowExecutionRepository;
  waiters: EngineWaiters;
  enqueueCalls: number;
  workflowErrorCalls: unknown[];
  nodeErrorCalls: unknown[];
  publishedEvents: Array<{ event: string; snapshot: unknown }>;
}

export function createRunContinuationKit(options: RunContinuationKitOptions): RunContinuationKit {
  const repo = new InMemoryWorkflowExecutionRepository();
  const runDataFactory = new InMemoryRunDataFactory();

  const workflowSnapshotResolver = {
    resolve: (_args: unknown) => options.workflow,
  };

  const nodeInstanceFactory = {
    createByType: (_token: unknown) => undefined,
    createNodes: (_wf: WorkflowDefinition) => new Map(),
  };
  const planningFactory = options.planningFactory ?? new EngineWorkflowPlanningFactory(nodeInstanceFactory as never);

  const nodeStatePublisherFactory = {
    create: () => ({
      markQueued: async () => {},
      markRunning: async () => {},
      markCompleted: async () => {},
      markFailed: async () => {},
      markSkipped: async () => {},
    }),
  };

  const credentialResolverFactory = {
    create: () => async () => undefined,
  };

  const runExecutionContextFactory = {
    create: (_args: unknown) =>
      ({
        telemetry: { forNode: () => ({}) },
        binary: { forNode: () => ({}) },
      }) as never,
  };

  const nodeActivationRequestComposer = {
    createFromPlannedActivation: (_args: unknown) => ({ activationId: "act_next", nodeId: "next" }) as never,
    createSingleFromDefinitionWithActivation: (_args: unknown) =>
      ({ activationId: "act_resume", nodeId: "resume" }) as never,
    createMultiFromDefinitionWithActivation: (_args: unknown) => ({}) as never,
  };

  const terminalBuilder = new PersistedRunStateTerminalBuilder();

  const kit: RunContinuationKit = {
    service: undefined as never,
    repo,
    waiters: new EngineWaiters(),
    enqueueCalls: 0,
    workflowErrorCalls: [],
    nodeErrorCalls: [],
    publishedEvents: [],
  };

  const activationEnqueueService = {
    enqueueActivation: async () => {
      throw new Error("enqueueActivation should not be called");
    },
    enqueueActivationWithSnapshot: async (_args: unknown) => {
      kit.enqueueCalls += 1;
      if (options.enqueueResult instanceof Error) throw options.enqueueResult;
      if (!options.enqueueResult) {
        throw new Error("enqueueActivationWithSnapshot called but no enqueueResult configured");
      }
      return options.enqueueResult;
    },
  } as unknown as ActivationEnqueueService;

  const nodeEventPublisher = {
    publish: async (event: string, snapshot: unknown) => {
      kit.publishedEvents.push({ event, snapshot });
    },
  } as unknown as NodeEventPublisher;

  const semantics = new RunStateSemantics(new MissingRuntimeExecutionMarker());

  const policyErrorServices = {
    resolveNodeErrorHandler: (_config: unknown) =>
      options.nodeErrorHandler
        ? {
            handle: async (args: unknown) => {
              kit.nodeErrorCalls.push(args);
              return options.nodeErrorHandler!.handle(args);
            },
          }
        : undefined,
    resolveWorkflowErrorHandler: (_handler: unknown) =>
      options.workflowErrorHandler
        ? {
            onError: async (args: unknown) => {
              kit.workflowErrorCalls.push(args);
              return options.workflowErrorHandler!.onError(args);
            },
          }
        : undefined,
  } as never;

  const terminalPersistence = {
    maybeDeleteAfterTerminalState: async (_args: unknown) => {},
  } as never;

  const executionLimitsPolicy = {
    createRootExecutionOptions: () => ({ maxNodeActivations: 1000, maxSubworkflowDepth: 32 }),
    resolveForRun: () => ({ maxNodeActivations: 1000, maxSubworkflowDepth: 32 }),
  } as never;

  const activationIdFactory = {
    makeActivationId: () => "act_generated" as NodeActivationId,
  } as never;

  kit.service = new RunContinuationService(
    activationIdFactory,
    repo,
    runDataFactory,
    runExecutionContextFactory as never,
    workflowSnapshotResolver as never,
    planningFactory,
    nodeStatePublisherFactory as never,
    credentialResolverFactory as never,
    nodeActivationRequestComposer as never,
    terminalBuilder,
    activationEnqueueService,
    nodeEventPublisher,
    semantics,
    kit.waiters,
    policyErrorServices,
    terminalPersistence,
    executionLimitsPolicy,
  );

  return kit;
}

/** Persist a "pending" run with a single-item pending execution record. */
export async function seedPendingRun(
  repo: InMemoryWorkflowExecutionRepository,
  args: {
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    inputsByPort?: Record<string, Array<{ json: unknown }>>;
    control?: PersistedRunState["control"];
    executionOptions?: PersistedRunState["executionOptions"];
    queue?: PersistedRunState["queue"];
    omitPending?: boolean;
  },
): Promise<void> {
  await repo.createRun({ runId: args.runId, workflowId: args.workflowId, startedAt: new Date().toISOString() });
  const state = await repo.load(args.runId);
  await repo.save({
    ...state!,
    status: "pending",
    control: args.control,
    executionOptions: args.executionOptions,
    queue: args.queue ?? [],
    pending: args.omitPending
      ? undefined
      : {
          runId: args.runId,
          workflowId: args.workflowId,
          activationId: args.activationId,
          nodeId: args.nodeId,
          itemsIn: 1,
          inputsByPort: (args.inputsByPort ?? { in: [{ json: {} }] }) as never,
          receiptId: "receipt_1",
          batchId: "batch_1",
          enqueuedAt: new Date().toISOString(),
        },
  } as PersistedRunState);
}
