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
    });
    void span.markStarted();
    return span;
  }
}
