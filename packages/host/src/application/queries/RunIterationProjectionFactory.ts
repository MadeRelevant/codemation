import {
  injectable,
  type ExecutionInstanceDto,
  type NodeExecutionStatus,
  type RunIterationDto,
} from "@codemation/core";

/**
 * Builds the per-iteration projection from a run's connection invocations.
 *
 * One iteration represents a single item being processed by an agent within an activation. All
 * invocations (LLM rounds, tool calls) emitted while handling that item share the same iterationId
 * and project into one {@link RunIterationDto}.
 *
 * Old runs (persisted before iteration ids existed) fall back to grouping by the agent
 * activationId so the UI still sees coherent groups instead of a flat list.
 */
@injectable()
export class RunIterationProjectionFactory {
  project(executionInstances: ReadonlyArray<ExecutionInstanceDto>): ReadonlyArray<RunIterationDto> {
    const invocations = executionInstances.filter((row) => row.kind === "connectionInvocation");
    if (invocations.length === 0) {
      return [];
    }
    const grouped = new Map<string, ExecutionInstanceDto[]>();
    for (const invocation of invocations) {
      const key = this.iterationKey(invocation);
      if (!key) {
        continue;
      }
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(invocation);
      } else {
        grouped.set(key, [invocation]);
      }
    }
    const iterations: RunIterationDto[] = [];
    for (const [key, group] of grouped.entries()) {
      iterations.push(this.toIteration(key, group));
    }
    iterations.sort((left, right) => this.compareIterations(left, right));
    return iterations;
  }

  private iterationKey(invocation: ExecutionInstanceDto): string | undefined {
    if (invocation.iterationId) {
      return invocation.iterationId;
    }
    if (invocation.activationId) {
      return `legacy::${invocation.workflowNodeId}::${invocation.activationId}::${invocation.itemIndex ?? 0}`;
    }
    return undefined;
  }

  private toIteration(iterationKey: string, group: ReadonlyArray<ExecutionInstanceDto>): RunIterationDto {
    const sorted = [...group].sort((a, b) => this.compareInvocations(a, b));
    const first = sorted[0]!;
    const status = this.aggregateStatus(sorted);
    const iterationId = first.iterationId ?? iterationKey;
    return {
      iterationId,
      agentNodeId: first.workflowNodeId,
      activationId: first.activationId ?? "synthetic",
      itemIndex: first.itemIndex ?? 0,
      status,
      startedAt: this.minIso(sorted.map((row) => row.startedAt)),
      finishedAt: status === "running" ? undefined : this.maxIso(sorted.map((row) => row.finishedAt)),
      invocationIds: sorted.map((row) => row.instanceId),
      parentInvocationId: first.parentInvocationId,
    };
  }

  private aggregateStatus(group: ReadonlyArray<ExecutionInstanceDto>): NodeExecutionStatus {
    if (group.some((row) => row.status === "failed")) {
      return "failed";
    }
    if (group.every((row) => row.status === "completed")) {
      return "completed";
    }
    return "running";
  }

  private minIso(values: ReadonlyArray<string | undefined>): string | undefined {
    let min: string | undefined;
    for (const value of values) {
      if (!value) continue;
      if (!min || value < min) {
        min = value;
      }
    }
    return min;
  }

  private maxIso(values: ReadonlyArray<string | undefined>): string | undefined {
    let max: string | undefined;
    for (const value of values) {
      if (!value) continue;
      if (!max || value > max) {
        max = value;
      }
    }
    return max;
  }

  private compareInvocations(left: ExecutionInstanceDto, right: ExecutionInstanceDto): number {
    const leftStart = left.startedAt ?? left.queuedAt ?? "";
    const rightStart = right.startedAt ?? right.queuedAt ?? "";
    if (leftStart !== rightStart) {
      return leftStart.localeCompare(rightStart);
    }
    return left.runIndex - right.runIndex;
  }

  private compareIterations(left: RunIterationDto, right: RunIterationDto): number {
    if (left.itemIndex !== right.itemIndex) {
      return left.itemIndex - right.itemIndex;
    }
    const leftStart = left.startedAt ?? "";
    const rightStart = right.startedAt ?? "";
    return leftStart.localeCompare(rightStart);
  }
}
