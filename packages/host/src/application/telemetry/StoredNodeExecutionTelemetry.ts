import type { NodeExecutionTelemetry, TelemetryChildSpanStart, TelemetrySpanScope } from "@codemation/core";
import { GenAiTelemetryAttributeNames } from "@codemation/core";
import type { StoredSpanScopeArgs } from "./OtelExecutionTelemetry.types";
import { StoredTelemetrySpanScope } from "./StoredTelemetrySpanScope";

export class StoredNodeExecutionTelemetry extends StoredTelemetrySpanScope implements NodeExecutionTelemetry {
  constructor(args: StoredSpanScopeArgs) {
    super(args);
  }

  forNode(_: Readonly<{ nodeId: string; activationId: string }>): NodeExecutionTelemetry {
    return this;
  }

  startChildSpan(args: TelemetryChildSpanStart): TelemetrySpanScope {
    // Iteration / parent-invocation identity is read from the attribute bag when present (the
    // engine passes them in for runnable per-item loops and sub-agent boundaries) and falls back
    // to the parent scope's identity otherwise (so spans started outside the iteration loop still
    // inherit a non-iteration scope).
    const iterationIdFromAttrs = this.toStringAttribute(args.attributes?.["codemation.iteration.id"]);
    const itemIndexFromAttrs = this.toNumberAttribute(args.attributes?.["codemation.iteration.index"]);
    const parentInvocationIdFromAttrs = this.toStringAttribute(args.attributes?.["codemation.parent.invocation_id"]);
    // eslint-disable-next-line codemation/no-manual-di-new
    const span = new StoredTelemetrySpanScope({
      ...this.deps,
      spanId: this.deps.otelIdentityFactory.createEphemeralSpanId(),
      parentSpanId: this.spanId,
      nodeId: this.nodeId,
      activationId: this.activationId,
      spanName: args.name,
      spanKind: args.kind ?? "internal",
      initialAttributes: args.attributes,
      initialStartTime: args.startedAt,
      connectionInvocationId: this.toStringAttribute(
        args.attributes?.["codemation.connection.invocation_id"] ?? args.attributes?.["connection.invocation_id"],
      ),
      modelName: this.toStringAttribute(args.attributes?.[GenAiTelemetryAttributeNames.requestModel]),
      iterationId: iterationIdFromAttrs ?? this.iterationId,
      itemIndex: itemIndexFromAttrs ?? this.itemIndex,
      parentInvocationId: parentInvocationIdFromAttrs ?? this.parentInvocationId,
    });
    void span.markStarted();
    return span;
  }

  private toNumberAttribute(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }
}
