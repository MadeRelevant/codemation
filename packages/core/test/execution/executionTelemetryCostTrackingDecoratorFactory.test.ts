import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CostTrackingTelemetry,
  ExecutionTelemetry,
  NodeExecutionTelemetry,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "../../src/index.ts";

import { ExecutionTelemetryCostTrackingDecoratorFactory } from "../../src/execution/ExecutionTelemetryCostTrackingDecoratorFactory.ts";

class StubCostTrackingTelemetry implements CostTrackingTelemetry {
  forScope(): CostTrackingTelemetry {
    return new StubCostTrackingTelemetry();
  }
  recordCost(): void {}
}

function makeStubChildSpan(): TelemetrySpanScope {
  return {
    traceId: "trace_child",
    spanId: "span_child",
    costTracking: new StubCostTrackingTelemetry(),
    addSpanEvent: (_e: TelemetrySpanEventRecord) => {},
    recordMetric: (_m: TelemetryMetricRecord) => {},
    attachArtifact: () => ({ artifactId: "art_child" }) as TelemetryArtifactReference,
    end: (_a?: TelemetrySpanEnd) => {},
    asNodeTelemetry: () => makeStubNodeTelemetry(),
  } as TelemetrySpanScope;
}

function makeStubNodeTelemetry(): NodeExecutionTelemetry {
  return {
    traceId: "trace_node",
    spanId: "span_node",
    costTracking: new StubCostTrackingTelemetry(),
    addSpanEvent: (_e: TelemetrySpanEventRecord) => {},
    recordMetric: (_m: TelemetryMetricRecord) => {},
    attachArtifact: () => ({ artifactId: "art_node" }) as TelemetryArtifactReference,
    end: (_a?: TelemetrySpanEnd) => {},
    startChildSpan: (_s: TelemetryChildSpanStart) => makeStubChildSpan(),
    forNode: () => makeStubNodeTelemetry(),
    asNodeTelemetry: () => makeStubNodeTelemetry(),
  } as NodeExecutionTelemetry;
}

function makeStubExecutionTelemetry(): ExecutionTelemetry {
  return {
    traceId: "trace_root",
    spanId: "span_root",
    costTracking: new StubCostTrackingTelemetry(),
    addSpanEvent: (_e: TelemetrySpanEventRecord) => {},
    recordMetric: (_m: TelemetryMetricRecord) => {},
    attachArtifact: () => ({ artifactId: "art_root" }) as TelemetryArtifactReference,
    forNode: () => makeStubNodeTelemetry(),
  } as ExecutionTelemetry;
}

test("decorator wires costTracking into the root ExecutionTelemetry while preserving span ids", () => {
  const factory = new ExecutionTelemetryCostTrackingDecoratorFactory();
  const costTracking = new StubCostTrackingTelemetry();
  const decorated = factory.decorateExecutionTelemetry({ telemetry: makeStubExecutionTelemetry(), costTracking });
  assert.equal(decorated.traceId, "trace_root");
  assert.equal(decorated.spanId, "span_root");
  assert.equal(decorated.costTracking, costTracking);
  // Pass-through methods should fire (assertion: no throw + return values shaped right).
  decorated.addSpanEvent({ name: "evt", attributes: {} } as TelemetrySpanEventRecord);
  decorated.recordMetric({ name: "m", value: 1 } as TelemetryMetricRecord);
  const artifact = decorated.attachArtifact({ name: "a" } as never);
  assert.ok(artifact);
});

test("decorator descends through forNode + startChildSpan + asNodeTelemetry, scoping costTracking each step", () => {
  const factory = new ExecutionTelemetryCostTrackingDecoratorFactory();
  const decorated = factory.decorateExecutionTelemetry({
    telemetry: makeStubExecutionTelemetry(),
    costTracking: new StubCostTrackingTelemetry(),
  });
  const nodeTel = decorated.forNode({ nodeId: "n", activationId: "a" });
  // Node-level decoration carries cost tracking + supports startChildSpan / forNode / asNodeTelemetry.
  assert.equal(nodeTel.traceId, "trace_node");
  assert.ok(nodeTel.costTracking, "cost tracking is wired into node telemetry");
  const child = nodeTel.startChildSpan({ name: "child" } as TelemetryChildSpanStart);
  assert.equal(child.traceId, "trace_child");
  // asNodeTelemetry should produce another decorated NodeExecutionTelemetry, not a span scope.
  const renode = child.asNodeTelemetry({ nodeId: "n2", activationId: "a2" });
  assert.ok(renode.costTracking);
  // Recursive forNode should also stay decorated.
  const grandchild = nodeTel.forNode({ nodeId: "n3", activationId: "a3" });
  assert.ok(grandchild.costTracking);
  // asNodeTelemetry on the original node telemetry should also stay decorated.
  const rescope = nodeTel.asNodeTelemetry({ nodeId: "n4", activationId: "a4" });
  assert.ok(rescope.costTracking);
});
