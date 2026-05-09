import { describe, expect, it } from "vitest";
import type {
  RunTraceContextRepository,
  TelemetryArtifactRecord,
  TelemetryArtifactStore,
  TelemetryArtifactWrite,
  TelemetryMetricPointRecord,
  TelemetryMetricPointStore,
  TelemetryMetricPointWrite,
  TelemetrySpanRecord,
  TelemetrySpanStore,
  TelemetrySpanUpsert,
  TelemetryTraceContext,
} from "../../src/domain/telemetry/TelemetryContracts";
import type { TelemetrySpanPublisher } from "../../src/application/telemetry/TelemetrySpanPublisher";
import { StoredTelemetrySpanScope } from "../../src/application/telemetry/StoredTelemetrySpanScope";

class FakeSpanStore implements TelemetrySpanStore {
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

class FakePublisher implements TelemetrySpanPublisher {
  readonly published: TelemetrySpanUpsert[] = [];
  async publishSpan(span: TelemetrySpanUpsert): Promise<void> {
    this.published.push(span);
  }
}

class FakeMetricStore implements TelemetryMetricPointStore {
  async save(record: TelemetryMetricPointWrite): Promise<TelemetryMetricPointRecord> {
    return {
      metricPointId: "m_1",
      workflowId: record.workflowId,
      metricName: record.name,
      value: record.value,
      observedAt: record.observedAt,
    };
  }
  async list(): Promise<ReadonlyArray<TelemetryMetricPointRecord>> {
    return [];
  }
  async pruneExpired(): Promise<number> {
    return 0;
  }
}

class FakeArtifactStore implements TelemetryArtifactStore {
  async save(write: TelemetryArtifactWrite): Promise<TelemetryArtifactRecord> {
    return {
      artifactId: "a_1",
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
      runId: "run_pub",
      workflowId: "wf_pub",
      traceId: "trace_pub",
      rootSpanId: "root_pub",
      createdAt: new Date().toISOString(),
    };
  }
  async upsertExpiry(): Promise<void> {
    /* no-op */
  }
}

const noopEnricher = {
  async enrichNode() {
    return {};
  },
  async enrichRun() {
    return {};
  },
};
const noopPrivacy = {
  shouldCaptureArtifact: () => true,
  trimPreviewText: (v: string | undefined) => v,
};
const noopRetention = {
  createSpanExpiry: () => undefined,
  createMetricExpiry: () => undefined,
  createArtifactExpiry: () => undefined,
  createTraceContextExpiry: () => undefined,
};
const fakeIdentity = {
  createEphemeralSpanId: () => "child_pub",
  createNodeSpanId: () => "node_pub",
  createArtifactId: () => "artifact_pub",
};

function buildScopeWithPublisher(publisher: TelemetrySpanPublisher): {
  scope: StoredTelemetrySpanScope;
  spanStore: FakeSpanStore;
} {
  const spanStore = new FakeSpanStore();
  const scope = new StoredTelemetrySpanScope({
    traceId: "trace_pub",
    rootSpanId: "root_pub",
    runId: "run_pub",
    workflowId: "wf_pub",
    runTraceContextRepository: new FakeRunTraceContextRepository(),
    telemetrySpanStore: spanStore,
    telemetryArtifactStore: new FakeArtifactStore(),
    telemetryMetricPointStore: new FakeMetricStore(),
    telemetryEnricherChain: noopEnricher as never,
    telemetryPrivacyPolicy: noopPrivacy as never,
    telemetryRetentionTimestampFactory: noopRetention as never,
    otelIdentityFactory: fakeIdentity as never,
    telemetrySpanPublisher: publisher,
    spanId: "span_pub",
    spanName: "workflow.run",
    spanKind: "internal",
  });
  return { scope, spanStore };
}

describe("StoredTelemetrySpanScope publisher seam", () => {
  it("calls publishSpan after markStarted stores the span", async () => {
    const publisher = new FakePublisher();
    const { scope, spanStore } = buildScopeWithPublisher(publisher);

    await scope.markStarted();

    expect(spanStore.upserts).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
    const published = publisher.published[0]!;
    expect(published.spanId).toBe("span_pub");
    expect(published.runId).toBe("run_pub");
    expect(published.status).toBe("running");
  });

  it("calls publishSpan after end() stores the completed span", async () => {
    const publisher = new FakePublisher();
    const { scope } = buildScopeWithPublisher(publisher);

    await scope.end({ status: "ok" });

    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.status).toBe("completed");
  });

  it("calls publishSpan for both markStarted and end — two upserts yield two publishes", async () => {
    const publisher = new FakePublisher();
    const { scope } = buildScopeWithPublisher(publisher);

    await scope.markStarted();
    await scope.end();

    expect(publisher.published).toHaveLength(2);
  });

  it("uses NoOpTelemetrySpanPublisher when telemetrySpanPublisher is omitted", async () => {
    // Verify the no-op path does not throw.
    const spanStore = new FakeSpanStore();
    const scope = new StoredTelemetrySpanScope({
      traceId: "trace_noop",
      rootSpanId: "root_noop",
      runId: "run_noop",
      workflowId: "wf_noop",
      runTraceContextRepository: new FakeRunTraceContextRepository(),
      telemetrySpanStore: spanStore,
      telemetryArtifactStore: new FakeArtifactStore(),
      telemetryMetricPointStore: new FakeMetricStore(),
      telemetryEnricherChain: noopEnricher as never,
      telemetryPrivacyPolicy: noopPrivacy as never,
      telemetryRetentionTimestampFactory: noopRetention as never,
      otelIdentityFactory: fakeIdentity as never,
      // telemetrySpanPublisher is intentionally omitted
      spanId: "span_noop",
      spanName: "workflow.run",
      spanKind: "internal",
    });

    await expect(scope.markStarted()).resolves.toBeUndefined();
    expect(spanStore.upserts).toHaveLength(1);
  });
});
