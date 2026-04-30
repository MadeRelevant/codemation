import { describe, expect, it } from "vitest";
import type {
  RunTraceContextRepository,
  TelemetryArtifactStore,
  TelemetryMetricPointRecord,
  TelemetryMetricPointStore,
  TelemetrySpanRecord,
  TelemetrySpanStore,
  TelemetryTraceContext,
  TelemetryArtifactRecord,
  TelemetryArtifactWrite,
  TelemetryMetricPointWrite,
  TelemetrySpanUpsert,
} from "../../src/domain/telemetry/TelemetryContracts";
import { StoredNodeExecutionTelemetry } from "../../src/application/telemetry/StoredNodeExecutionTelemetry";
import { StoredTelemetrySpanScope } from "../../src/application/telemetry/StoredTelemetrySpanScope";

class FakeTelemetrySpanStore implements TelemetrySpanStore {
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

class FakeTelemetryMetricPointStore implements TelemetryMetricPointStore {
  readonly writes: TelemetryMetricPointWrite[] = [];

  async save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord> {
    this.writes.push(record);
    return {
      metricPointId: `metric_${String(this.writes.length)}`,
      traceId: record.traceId,
      spanId: record.spanId,
      runId: record.runId,
      workflowId: record.workflowId,
      nodeId: record.nodeId,
      activationId: record.activationId,
      metricName: record.name,
      value: record.value,
      unit: record.unit,
      observedAt: record.observedAt,
      iterationId: record.iterationId,
      itemIndex: record.itemIndex,
      parentInvocationId: record.parentInvocationId,
    };
  }

  async list(): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    return [];
  }
  async pruneExpired(): Promise<number> {
    return 0;
  }
}

class FakeTelemetryArtifactStore implements TelemetryArtifactStore {
  async save(write: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    return {
      artifactId: "artifact_1",
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
  async pruneExpired(): Promise<number> {
    return 0;
  }
}

class FakeRunTraceContextRepository implements RunTraceContextRepository {
  async load(): Promise<TelemetryTraceContext | undefined> {
    return undefined;
  }
  async getOrCreate(): Promise<TelemetryTraceContext> {
    return {
      runId: "run_1",
      workflowId: "wf.test",
      traceId: "trace_1",
      rootSpanId: "root_1",
      createdAt: new Date().toISOString(),
    };
  }
  async upsertExpiry(): Promise<void> {
    /* no-op */
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

const NoopPrivacy = {
  shouldCaptureArtifact: () => true,
  trimPreviewText: (value: string | undefined) => value,
};

const NoopRetention = {
  createSpanExpiry: () => undefined,
  createMetricExpiry: () => undefined,
  createArtifactExpiry: () => undefined,
  createTraceContextExpiry: () => undefined,
};

let identityCounter = 0;
const FakeIdentityFactory = {
  createEphemeralSpanId: () => `child_${String(++identityCounter)}`,
  createNodeSpanId: (activationId: string) => `node_${activationId}`,
  createArtifactId: () => `artifact_${String(++identityCounter)}`,
};

function buildDeps(): Readonly<{
  spanStore: FakeTelemetrySpanStore;
  metricStore: FakeTelemetryMetricPointStore;
  baseDeps: ConstructorParameters<typeof StoredTelemetrySpanScope>[0];
}> {
  const spanStore = new FakeTelemetrySpanStore();
  const metricStore = new FakeTelemetryMetricPointStore();
  const artifactStore = new FakeTelemetryArtifactStore();
  const runTraceContextRepository = new FakeRunTraceContextRepository();
  const baseDeps: ConstructorParameters<typeof StoredTelemetrySpanScope>[0] = {
    traceId: "trace_1",
    rootSpanId: "root_1",
    runId: "run_1",
    workflowId: "wf.test",
    runTraceContextRepository,
    telemetrySpanStore: spanStore,
    telemetryArtifactStore: artifactStore,
    telemetryMetricPointStore: metricStore,
    telemetryEnricherChain: NoopEnricher as never,
    telemetryPrivacyPolicy: NoopPrivacy as never,
    telemetryRetentionTimestampFactory: NoopRetention as never,
    otelIdentityFactory: FakeIdentityFactory as never,
    spanId: "span_root",
    spanName: "workflow.run",
    spanKind: "internal",
  };
  return { spanStore, metricStore, baseDeps };
}

describe("StoredTelemetrySpanScope iteration attributes", () => {
  it("persists iterationId/itemIndex/parentInvocationId on the span record and stamps them into attributes", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope({
      ...baseDeps,
      iterationId: "iter_x",
      itemIndex: 2,
      parentInvocationId: "inv_outer",
    });

    await scope.markStarted();

    expect(spanStore.upserts).toHaveLength(1);
    const record = spanStore.upserts[0]!;
    expect(record.iterationId).toBe("iter_x");
    expect(record.itemIndex).toBe(2);
    expect(record.parentInvocationId).toBe("inv_outer");
    expect(record.attributes?.["codemation.iteration.id"]).toBe("iter_x");
    expect(record.attributes?.["codemation.iteration.index"]).toBe(2);
    expect(record.attributes?.["codemation.parent.invocation_id"]).toBe("inv_outer");
  });

  it("propagates iteration identity onto child spans started via startChildSpan when reading from attributes", async () => {
    const { spanStore, baseDeps } = buildDeps();
    const node = new StoredNodeExecutionTelemetry({
      ...baseDeps,
      spanId: "span_node",
    });

    node.startChildSpan({
      name: "gen_ai.chat.completion",
      kind: "client",
      attributes: {
        "codemation.iteration.id": "iter_a",
        "codemation.iteration.index": 1,
        "codemation.parent.invocation_id": "inv_root",
        "codemation.connection.invocation_id": "inv_child",
      },
    });

    // Wait a tick so the async markStarted in startChildSpan gets to upsert.
    await Promise.resolve();
    await Promise.resolve();
    expect(spanStore.upserts.length).toBeGreaterThan(0);
    const childRecord = spanStore.upserts[spanStore.upserts.length - 1]!;
    expect(childRecord.iterationId).toBe("iter_a");
    expect(childRecord.itemIndex).toBe(1);
    expect(childRecord.parentInvocationId).toBe("inv_root");
  });

  it("includes iteration identity on metric points recorded under the iteration scope", async () => {
    const { metricStore, baseDeps } = buildDeps();
    const scope = new StoredTelemetrySpanScope({
      ...baseDeps,
      iterationId: "iter_y",
      itemIndex: 0,
      parentInvocationId: undefined,
    });

    await scope.recordMetric({ name: "test.metric", value: 1 });

    expect(metricStore.writes).toHaveLength(1);
    const write = metricStore.writes[0]!;
    expect(write.iterationId).toBe("iter_y");
    expect(write.itemIndex).toBe(0);
    expect(write.parentInvocationId).toBeUndefined();
  });
});
