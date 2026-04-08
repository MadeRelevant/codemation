import type {
  NodeActivationContinuation,
  PreparedNodeActivationDispatch,
  NodeActivationReceipt,
  NodeActivationRequest,
  NodeActivationScheduler,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
} from "../types";
import { InlineDrivingScheduler } from "./InlineDrivingScheduler";

type SchedulerSelection = Readonly<{
  mode: NodeActivationReceipt["mode"];
  queue?: string;
  decision: "runIntentOverride" | "nodePolicy" | "containerDefault";
}>;

export class DefaultDrivingScheduler implements NodeActivationScheduler {
  constructor(
    private readonly offloadPolicy: NodeOffloadPolicy,
    private readonly workerScheduler: NodeExecutionScheduler,
    private readonly inline: InlineDrivingScheduler,
  ) {}

  setContinuation(continuation: NodeActivationContinuation): void {
    this.inline.setContinuation(continuation);
  }

  async prepareDispatch(request: NodeActivationRequest): Promise<PreparedNodeActivationDispatch> {
    const selection = await this.selectScheduler(request);
    if (selection.mode === "worker") {
      if (request.kind === "multi") {
        throw new Error(`Multi-input node ${request.nodeId} cannot be scheduled to worker (insert local placement)`);
      }

      const workerRequest: NodeExecutionRequest = {
        runId: request.runId,
        activationId: request.activationId,
        workflowId: request.workflowId,
        nodeId: request.nodeId,
        input: request.input,
        parent: request.parent,
        queue: selection.queue,
        executionOptions: request.executionOptions,
      };

      return {
        receipt: {
          receiptId: request.activationId,
          mode: "worker",
          queue: selection.queue,
        },
        dispatch: async () => {
          await this.workerScheduler.enqueue(workerRequest);
        },
      };
    }

    return await this.prepareInlineDispatch(request);
  }

  /**
   * Scheduler precedence is explicit:
   * 1. run-intent override (`executionOptions.localOnly`)
   * 2. node-level execution hint / queue policy
   * 3. container-default scheduler policy fallback
   */
  private async selectScheduler(request: NodeActivationRequest): Promise<SchedulerSelection> {
    if (request.executionOptions?.localOnly) {
      return {
        mode: "local",
        decision: "runIntentOverride",
      };
    }

    const decision = this.offloadPolicy.decide({
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      config: request.ctx.config,
    });
    if (this.hasNodeSchedulingPreference(request)) {
      return {
        mode: decision.mode,
        queue: decision.queue,
        decision: "nodePolicy",
      };
    }

    return {
      mode: decision.mode,
      queue: decision.queue,
      decision: "containerDefault",
    };
  }

  private hasNodeSchedulingPreference(request: NodeActivationRequest): boolean {
    return request.ctx.config.execution?.hint !== undefined || request.ctx.config.execution?.queue !== undefined;
  }

  private async prepareInlineDispatch(request: NodeActivationRequest): Promise<PreparedNodeActivationDispatch> {
    const prepared = await this.inline.prepareDispatch(request);
    return {
      receipt: { ...prepared.receipt, mode: "local" },
      dispatch: async () => {
        await prepared.dispatch();
      },
    };
  }
}
