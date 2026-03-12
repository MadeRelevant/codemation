import type {
  MultiInputNode,
  Node,
  NodeActivationContinuation,
  NodeActivationReceipt,
  NodeActivationRequest,
  NodeActivationScheduler,
  RunId,
} from "../../types";
import { MissingRuntimeNode, MissingRuntimeNodeToken, MissingRuntimeTrigger, MissingRuntimeTriggerToken } from "../runtime/persistedWorkflowResolver";

export class InlineDrivingScheduler implements NodeActivationScheduler {
  private continuation: NodeActivationContinuation | undefined;
  private readonly drainingRuns = new Set<RunId>();
  private readonly queuesByRunId = new Map<RunId, Array<Readonly<{ request: NodeActivationRequest; receipt: NodeActivationReceipt }>>>();
  private seq = 0;

  setContinuation(continuation: NodeActivationContinuation): void {
    this.continuation = continuation;
  }

  async enqueue(request: NodeActivationRequest): Promise<NodeActivationReceipt> {
    const receipt: NodeActivationReceipt = { receiptId: `inline_${++this.seq}`, mode: "local" };
    const q = this.queuesByRunId.get(request.runId) ?? [];
    q.push({ request, receipt });
    this.queuesByRunId.set(request.runId, q);

    // Important: run activation on a later tick so the engine can persist pending state first.
    if (!this.drainingRuns.has(request.runId)) setTimeout(() => void this.drainRun(request.runId), 0);

    return receipt;
  }

  private async drainRun(runId: RunId): Promise<void> {
    if (this.drainingRuns.has(runId)) return;
    this.drainingRuns.add(runId);
    try {
      const q = this.queuesByRunId.get(runId) ?? [];
      while (q.length > 0) {
        const next = q.shift()!;
        const { request } = next;

        const cont = this.continuation;
        if (!cont) throw new Error("InlineDrivingScheduler is missing a continuation (setContinuation was not called)");

        try {
          await cont.markNodeRunning({
            runId: request.runId,
            activationId: request.activationId,
            nodeId: request.nodeId,
            inputsByPort: request.kind === "multi" ? request.inputsByPort : { in: request.input },
          });

          const type = request.ctx.config.type as any;
          const nodeResolver = request.ctx.services.nodeResolver;
          if (!nodeResolver) throw new Error(`No nodeResolver available in ctx.services for activation ${request.activationId}`);
          const inst = this.resolveNodeInstance(type, nodeResolver) as unknown;

          let outputs;
          if (request.kind === "multi") {
            const node = inst as MultiInputNode;
            if (typeof (node as any)?.executeMulti !== "function") {
              throw new Error(`Node ${request.nodeId} does not support executeMulti but received multi-input activation`);
            }
            outputs = await node.executeMulti(request.inputsByPort, request.ctx as any);
          } else {
            const node = inst as Node;
            if (typeof (node as any)?.execute !== "function") {
              throw new Error(`Node ${request.nodeId} does not support execute but received single-input activation`);
            }
            outputs = await node.execute(request.input, request.ctx as any);
          }

          await cont.resumeFromNodeResult({
            runId: request.runId,
            activationId: request.activationId,
            nodeId: request.nodeId,
            outputs: outputs ?? {},
          });
        } catch (e) {
          await cont.resumeFromNodeError({
            runId: request.runId,
            activationId: request.activationId,
            nodeId: request.nodeId,
            error: this.asError(e),
          });
        }
      }
    } finally {
      if ((this.queuesByRunId.get(runId)?.length ?? 0) === 0) this.queuesByRunId.delete(runId);
      this.drainingRuns.delete(runId);
    }
  }

  private asError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
  }

  private resolveNodeInstance(token: unknown, nodeResolver: Readonly<{ resolve(token: unknown): unknown }>): unknown {
    if (token === MissingRuntimeNodeToken) {
      return new MissingRuntimeNode();
    }
    if (token === MissingRuntimeTriggerToken) {
      return new MissingRuntimeTrigger();
    }
    return nodeResolver.resolve(token);
  }
}

