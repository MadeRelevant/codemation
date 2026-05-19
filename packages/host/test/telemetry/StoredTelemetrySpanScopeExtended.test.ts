/**
 * Extended tests for StoredTelemetrySpanScope covering branches not hit by the
 * existing iteration-attributes and publisher tests:
 * - addSpanEvent
 * - asNodeTelemetry (buildNodeTelemetryView)
 * - attachArtifact when shouldCaptureArtifact returns false
 */
import { describe, expect, it } from "vitest";
import type {
  TelemetryArtifactRecord,
  TelemetryArtifactWrite,
  TelemetryMetricPointRecord,
  TelemetryMetricPointWrite,
  TelemetrySpanRecord,
  TelemetrySpanUpsert,
} from "../../src/domain/telemetry/TelemetryContracts";
import { StoredTelemetrySpanScope } from "../../src/application/telemetry/StoredTelemetrySpanScope";
import { NoOpTelemetryArtifactReference } from "@codemation/core";

class FakeSpanStore {
  readonly upserts: TelemetrySpanUpsert[] = [];
  async upsert(record: TelemetrySpanUpsert): Promise<void> {
    this.upserts.push(record);
  }
  async list(): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    return [];
  }
  async listByTraceId(): Promise<ReadonlyArray<TelemetrySpanRecord>> {
    return [];
  }
  async pruneExpired(): Promise<number> {
    return 0;
  }
}

class FakeMetricStore {
  readonly writes: TelemetryMetricPointWrite[] = [];
  async save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord> {
    this.writes.push(record);
    return { ...record, metricPointId: "mp_1", metricName: record.name } as never;
  }
  async list(): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    return [];
  }
  async pruneExpired(): Promise<number> {
    return 0;
  }
}

class FakeArtifactStore {
  readonly saves: TelemetryArtifactWrite[] = [];
  async save(write: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    this.saves.push(write);
    return {
      artifactId: "art_1",
      traceId: write.traceId,
      spanId: write.spanId,
      runId: write.runId,
      workflowId: write.workflowId,
      kind: write.kind,
      contentType: write.contentType,
      createdAt: new Date().toISOString(),
    };
  }
  async listByTraceId(): Promise<ReadonlyArray<TelemetryArtifactRecord>> {
    return [];
  }
  async pruneExpired() {
    return { count: 0, storageKeys: [] };
  }
}

const NoopEnricher = {
  async enrichNode() {
    return {};
  },
  async enrichRun() {
    return {};
  },
};

const NoopRetention = {
  createSpanExpiry: () => undefined,
  createMetricExpiry: () => undefined,
  createArtifactExpiry: () => undefined,
  createTraceContextExpiry: () => undefined,
};

const NoopRunTraceContext = {
  load: async () => undefined,
  getOrCreate: async () => ({
    runId: "run_1",
    workflowId: "wf_1",
    traceId: "trace_1",
    rootSpanId: "root_1",
    createdAt: new Date().toISOString(),
  }),
  upsertExpiry: async () => undefined,
};

let ephemeralCounter = 0;
const FakeIdentityFactory = {
  createEphemeralSpanId: () => `child_${String(++ephemeralCounter)}`,
  createNodeSpanId: (id: string) => `node_${id}`,
  createArtifactId: () => `art_${String(++ephemeralCounter)}`,
};

function buildDeps() {
  const spanStore = new FakeSpanStore();
  const metricStore = new FakeMetricStore();
  const artifactStore = new FakeArtifactStore();
  const baseDeps: ConstructorParameters<typeof StoredTelemetrySpanScope>[0] = {
    traceId: "trace_1",
    rootSpanId: "root_1",
    runId: "run_1",
    workflowId: "wf_1",
    runTraceContextRepository: NoopRunTraceContext as never,
    telemetrySpanStore: spanStore,
    telemetryArtifactStore: artifactStore,
    telemetryMetricPointStore: metricStore,
    telemetryEnricherChain: NoopEnricher as never,
    telemetryPrivacyPolicy: {
      shouldCaptureArtifact: () => true,
      trimPreviewText: (v: string | undefined) => v,
    } as never,
    telemetryRetentionTimestampFactory: NoopRetention as never,
    otelIdentityFactory: FakeIdentityFactory as never,
    spanId: "span_root",
    spanName: "workflow.run",
    spanKind: "internal",
  };
  return { spanStore, metricStore, artifactStore, baseDeps };
}

describe("StoredTelemetrySpanScope.addSpanEvent", () => {
  it("records a span event via upsert", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    await scope.addSpanEvent({ name: "test.event" });
    expect(spanStore.upserts.some((u) => u.events?.[0]?.name === "test.event")).toBe(true);
  });
});

describe("StoredTelemetrySpanScope.attachArtifact", () => {
  it("returns NoOpTelemetryArtifactReference when shouldCaptureArtifact returns false", async () => {
    const { baseDeps, artifactStore } = buildDeps();
    const scope = new StoredTelemetrySpanScope({
      ...baseDeps,
      telemetryPrivacyPolicy: {
        shouldCaptureArtifact: () => false,
        trimPreviewText: (v: string | undefined) => v,
      } as never,
    });
    const ref = await scope.attachArtifact({ kind: "artifact", contentType: "text/plain" } as never);
    expect(ref).toBe(NoOpTelemetryArtifactReference.value);
    expect(artifactStore.saves).toHaveLength(0);
  });

  it("saves artifact when shouldCaptureArtifact returns true", async () => {
    const { baseDeps, artifactStore } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const ref = await scope.attachArtifact({ kind: "artifact", contentType: "application/json" } as never);
    expect(ref.artifactId).toBeTruthy();
    expect(artifactStore.saves).toHaveLength(1);
  });
});

describe("StoredTelemetrySpanScope.asNodeTelemetry", () => {
  it("returns a NodeExecutionTelemetry view with traceId and spanId", async () => {
    const { baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const view = scope.asNodeTelemetry({ nodeId: "node_1" as never, activationId: "act_1" as never });
    expect(view.traceId).toBe("trace_1");
    expect(view.spanId).toBe("span_root");
  });

  it("startChildSpan on NodeExecutionTelemetry view returns a new span scope", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const view = scope.asNodeTelemetry({ nodeId: "node_1" as never, activationId: "act_1" as never });
    const child = view.startChildSpan({ name: "tool.call", kind: "client" });
    expect(child.traceId).toBe("trace_1");
    // After creation, markStarted is called internally, so there's at least one upsert
    // (give it a tick to resolve the void promise)
    await new Promise((r) => setTimeout(r, 0));
    expect(spanStore.upserts.length).toBeGreaterThanOrEqual(1);
  });

  it("forNode on view returns itself", async () => {
    const { baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const view = scope.asNodeTelemetry({ nodeId: "node_1" as never, activationId: "act_1" as never });
    expect(view.forNode({ nodeId: "node_2" as never, activationId: "act_2" as never })).toBe(view);
  });

  it("addSpanEvent via view delegates to the scope's upsert", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const view = scope.asNodeTelemetry({ nodeId: "node_1" as never, activationId: "act_1" as never });
    await view.addSpanEvent({ name: "node.event" });
    expect(spanStore.upserts.some((u) => u.events?.[0]?.name === "node.event")).toBe(true);
  });

  it("end via view delegates to the scope's upsert with completed status", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope(baseDeps);
    const view = scope.asNodeTelemetry({ nodeId: "node_1" as never, activationId: "act_1" as never });
    await view.end({});
    expect(spanStore.upserts.some((u) => u.status === "completed")).toBe(true);
  });
});
