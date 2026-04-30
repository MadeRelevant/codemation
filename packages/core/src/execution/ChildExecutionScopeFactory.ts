import { CoreTokens } from "../di/CoreTokens";
import { inject, injectable } from "../di";
import type {
  ActivationIdFactory,
  ConnectionInvocationId,
  NodeExecutionContext,
  NodeId,
  RunnableNodeConfig,
  TelemetrySpanScope,
} from "../types";

/**
 * Builds a re-rooted child execution context for sub-agent (and other deeply-nested) invocations.
 *
 * At the orchestrator's `agent.tool.call` boundary the inner runtime needs a ctx whose:
 * - `nodeId` is the tool's connection node id (so inner LLM/tool connection ids derive correctly),
 * - `activationId` is fresh (so its connection-invocation rows are uniquely identifiable),
 * - `telemetry` parents children under the tool-call span (not the orchestrator's node span),
 * - `binary` is scoped to the new (nodeId, activationId),
 * - `parentInvocationId` points back to the tool-call invocation for downstream lineage.
 */
@injectable()
export class ChildExecutionScopeFactory {
  constructor(
    @inject(CoreTokens.ActivationIdFactory)
    private readonly activationIdFactory: ActivationIdFactory,
  ) {}

  forSubAgent<TConfig extends RunnableNodeConfig<any, any>>(
    args: Readonly<{
      parentCtx: NodeExecutionContext<TConfig>;
      childNodeId: NodeId;
      childConfig: TConfig;
      parentInvocationId: ConnectionInvocationId;
      parentSpan: TelemetrySpanScope;
    }>,
  ): NodeExecutionContext<TConfig> {
    const childActivationId = this.activationIdFactory.makeActivationId();
    const childTelemetry = args.parentSpan.asNodeTelemetry({
      nodeId: args.childNodeId,
      activationId: childActivationId,
    });
    const childBinary = args.parentCtx.binary.forNode({
      nodeId: args.childNodeId,
      activationId: childActivationId,
    });
    return {
      ...args.parentCtx,
      nodeId: args.childNodeId,
      activationId: childActivationId,
      config: args.childConfig,
      telemetry: childTelemetry,
      binary: childBinary,
      parentInvocationId: args.parentInvocationId,
      iterationId: undefined,
    };
  }
}
