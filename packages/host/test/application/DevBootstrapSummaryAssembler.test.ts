import { describe, expect, it } from "vitest";
import { DevBootstrapSummaryAssembler } from "../../src/application/dev/DevBootstrapSummaryAssembler";
import type { BootRuntimeSummary } from "../../src/application/dev/BootRuntimeSummary.types";

type WorkflowEntry = { id: string; name: string };

class BootRuntimeSnapshotHolderStub {
  constructor(private readonly summary: BootRuntimeSummary | null) {}
  get(): BootRuntimeSummary | null {
    return this.summary;
  }
}

class LogLevelPolicyStub {
  create() {
    return { resolveMin: () => "warn" };
  }
}

class WorkflowActivationPolicyStub {
  constructor(private readonly activeIds: ReadonlySet<string>) {}
  isActive(id: string): boolean {
    return this.activeIds.has(id);
  }
}

class WorkflowRepositoryStub {
  constructor(private readonly workflows: ReadonlyArray<WorkflowEntry>) {}
  list(): ReadonlyArray<WorkflowEntry> {
    return this.workflows;
  }
}

function makeSummary(overrides: Partial<BootRuntimeSummary> = {}): BootRuntimeSummary {
  return {
    databasePersistence: { kind: "sqlite", databaseFilePath: "/data/app.db" },
    schedulerKind: "local",
    queuePrefix: "codemation",
    eventBusKind: "memory",
    redisUrl: undefined,
    plugins: [],
    ...overrides,
  } as BootRuntimeSummary;
}

function makeAssembler(
  args: {
    summary?: BootRuntimeSummary | null;
    activeIds?: ReadonlyArray<string>;
    workflows?: ReadonlyArray<WorkflowEntry>;
  } = {},
): DevBootstrapSummaryAssembler {
  const summary = "summary" in args ? args.summary! : makeSummary();
  return new DevBootstrapSummaryAssembler(
    new BootRuntimeSnapshotHolderStub(summary) as never,
    new LogLevelPolicyStub() as never,
    new WorkflowActivationPolicyStub(new Set(args.activeIds ?? [])) as never,
    new WorkflowRepositoryStub(args.workflows ?? []) as never,
  );
}

describe("DevBootstrapSummaryAssembler.assemble", () => {
  it("returns null when no bootstrap snapshot is present", () => {
    const assembler = makeAssembler({ summary: null });
    expect(assembler.assemble()).toBeNull();
  });

  it("includes the resolved log level", () => {
    const result = makeAssembler().assemble();
    expect(result!.logLevel).toBe("warn");
  });

  it("labels SQLite database correctly", () => {
    const result = makeAssembler({
      summary: makeSummary({ databasePersistence: { kind: "sqlite", databaseFilePath: "/opt/db.sqlite" } }),
    }).assemble();
    expect(result!.databaseLabel).toBe("SQLite — /opt/db.sqlite");
  });

  it("labels in-memory (no Prisma) database correctly", () => {
    const result = makeAssembler({
      summary: makeSummary({ databasePersistence: { kind: "none" } }),
    }).assemble();
    expect(result!.databaseLabel).toBe("in-memory (no Prisma persistence)");
  });

  it("labels Postgres database with redacted password", () => {
    const result = makeAssembler({
      summary: makeSummary({
        databasePersistence: {
          kind: "postgresql",
          databaseUrl: "postgresql://user:secret@db.example.com:5432/mydb",
        },
      }),
    }).assemble();
    expect(result!.databaseLabel).toContain("***");
    expect(result!.databaseLabel).not.toContain("secret");
    expect(result!.databaseLabel).toContain("db.example.com");
  });

  it("labels local scheduler correctly", () => {
    const result = makeAssembler({ summary: makeSummary({ schedulerKind: "local" }) }).assemble();
    expect(result!.schedulerLabel).toBe("inline (this process)");
  });

  it("labels BullMQ scheduler with queue prefix", () => {
    const result = makeAssembler({
      summary: makeSummary({ schedulerKind: "bullmq", queuePrefix: "myprefix" }),
    }).assemble();
    expect(result!.schedulerLabel).toContain("BullMQ");
    expect(result!.schedulerLabel).toContain("myprefix");
  });

  it("labels in-memory event bus correctly", () => {
    const result = makeAssembler({ summary: makeSummary({ eventBusKind: "memory" }) }).assemble();
    expect(result!.eventBusLabel).toBe("in-memory");
  });

  it("labels Redis event bus correctly", () => {
    const result = makeAssembler({ summary: makeSummary({ eventBusKind: "redis" }) }).assemble();
    expect(result!.eventBusLabel).toBe("Redis");
  });

  it("redacts Redis URL password when present", () => {
    const result = makeAssembler({
      summary: makeSummary({ redisUrl: "redis://:secret@redis.host:6379/0" }),
    }).assemble();
    expect(result!.redisUrlRedacted).toBeDefined();
    expect(result!.redisUrlRedacted).not.toContain("secret");
    expect(result!.redisUrlRedacted).toContain("redis.host");
  });

  it("returns undefined for redisUrl when not set", () => {
    const result = makeAssembler({ summary: makeSummary({ redisUrl: undefined }) }).assemble();
    expect(result!.redisUrlRedacted).toBeUndefined();
  });

  it("returns undefined for redisUrl when empty", () => {
    const result = makeAssembler({ summary: makeSummary({ redisUrl: "   " }) }).assemble();
    expect(result!.redisUrlRedacted).toBeUndefined();
  });

  it("returns '(unparseable URL)' for invalid Redis URL", () => {
    const result = makeAssembler({ summary: makeSummary({ redisUrl: "not-a-url" }) }).assemble();
    expect(result!.redisUrlRedacted).toBe("(unparseable URL)");
  });

  it("lists only active workflows sorted by name", () => {
    const workflows = [
      { id: "wf_b", name: "B Workflow" },
      { id: "wf_a", name: "A Workflow" },
      { id: "wf_c", name: "C Workflow" },
    ];
    const result = makeAssembler({
      workflows,
      activeIds: ["wf_a", "wf_c"],
    }).assemble();
    expect(result!.activeWorkflows).toHaveLength(2);
    expect(result!.activeWorkflows[0].name).toBe("A Workflow");
    expect(result!.activeWorkflows[1].name).toBe("C Workflow");
  });

  it("returns empty activeWorkflows when none are active", () => {
    const result = makeAssembler({
      workflows: [{ id: "wf_1", name: "Test" }],
      activeIds: [],
    }).assemble();
    expect(result!.activeWorkflows).toHaveLength(0);
  });

  it("includes plugins sorted by packageName", () => {
    const result = makeAssembler({
      summary: makeSummary({
        plugins: [
          { packageName: "z-plugin", version: "1.0.0" } as never,
          { packageName: "a-plugin", version: "1.0.0" } as never,
        ],
      }),
    }).assemble();
    expect(result!.plugins[0]).toMatchObject({ packageName: "a-plugin" });
    expect(result!.plugins[1]).toMatchObject({ packageName: "z-plugin" });
  });
});
