import { describe, expect, it } from "vitest";
import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import type { IWorkflowAuditEmitter, WorkflowAuditEntry } from "../../src/audit/IAuditEmitter";
import { WorkflowAuditLogWriter } from "../../src/audit/WorkflowAuditLogWriter";
import type { LoggerFactory, Logger } from "../../src/application/logging/Logger";

// --- Fakes ---

class FakeRunEventBus implements RunEventBus {
  private handler: ((event: RunEvent) => void) | null = null;

  async publish(event: RunEvent): Promise<void> {
    await this.handler?.(event);
  }

  async subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    this.handler = onEvent;
    return {
      close: async () => {
        this.handler = null;
      },
    };
  }

  async subscribeToWorkflow(_workflowId: string, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    this.handler = onEvent;
    return {
      close: async () => {
        this.handler = null;
      },
    };
  }
}

class FakeAuditEmitter implements IWorkflowAuditEmitter {
  readonly emitted: WorkflowAuditEntry[] = [];
  async emit(entry: WorkflowAuditEntry): Promise<void> {
    this.emitted.push(entry);
  }
}

class FakeLogger implements Logger {
  readonly errors: string[] = [];
  info(): void {}
  warn(): void {}
  debug(): void {}
  error(message: string): void {
    this.errors.push(message);
  }
}

class FakeLoggerFactory implements LoggerFactory {
  readonly logger = new FakeLogger();
  create(): Logger {
    return this.logger;
  }
}

// --- Helpers ---

function makeWriter() {
  const bus = new FakeRunEventBus();
  const emitter = new FakeAuditEmitter();
  const loggerFactory = new FakeLoggerFactory();
  const writer = new WorkflowAuditLogWriter(bus, emitter, loggerFactory);
  return { bus, emitter, loggerFactory, writer };
}

const BASE = { runId: "run-1", workflowId: "wf-1", at: "2026-05-19T10:00:00.000Z" } as const;

// --- Tests ---

describe("WorkflowAuditLogWriter", () => {
  describe("nodeCompleted", () => {
    it("emits workflow.node.completed with success outcome", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "nodeCompleted",
        ...BASE,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-A",
          status: "completed",
          updatedAt: BASE.at,
        },
      });
      expect(emitter.emitted).toHaveLength(1);
      const entry = emitter.emitted[0]!;
      expect(entry.action).toBe("workflow.node.completed");
      expect(entry.outcome).toBe("success");
      expect(entry.resource.type).toBe("node");
      expect(entry.resource.id).toBe("node-A");
      expect(entry.actor.userId).toBe("system");
      expect(entry.workflowId).toBe("wf-1");
      expect(entry.runId).toBe("run-1");
      expect(entry.nodeId).toBe("node-A");
    });
  });

  describe("nodeFailed", () => {
    it("emits workflow.node.failed with failure outcome and errorCode", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "nodeFailed",
        ...BASE,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-B",
          status: "failed",
          updatedAt: BASE.at,
          error: { message: "Timeout", name: "TimeoutError" },
        },
      });
      expect(emitter.emitted).toHaveLength(1);
      const entry = emitter.emitted[0]!;
      expect(entry.action).toBe("workflow.node.failed");
      expect(entry.outcome).toBe("failure");
      expect(entry.errorCode).toBe("TimeoutError");
    });
  });

  describe("runSaved — completed status", () => {
    it("emits workflow.run.completed", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "runSaved",
        ...BASE,
        state: {
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: BASE.at,
          status: "completed",
          revision: 1,
          queue: [],
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
        },
      });
      expect(emitter.emitted).toHaveLength(1);
      expect(emitter.emitted[0]!.action).toBe("workflow.run.completed");
      expect(emitter.emitted[0]!.outcome).toBe("success");
    });
  });

  describe("runSaved — failed status", () => {
    it("emits workflow.run.failed", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "runSaved",
        ...BASE,
        state: {
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: BASE.at,
          status: "failed",
          revision: 1,
          queue: [],
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
        },
      });
      expect(emitter.emitted).toHaveLength(1);
      expect(emitter.emitted[0]!.action).toBe("workflow.run.failed");
      expect(emitter.emitted[0]!.outcome).toBe("failure");
    });
  });

  describe("runSaved — running status", () => {
    it("emits nothing", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "runSaved",
        ...BASE,
        state: {
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: BASE.at,
          status: "running",
          revision: 1,
          queue: [],
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
        },
      });
      expect(emitter.emitted).toHaveLength(0);
    });
  });

  describe("connectionInvocationStarted", () => {
    it("emits workflow.credential.used", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({
        kind: "connectionInvocationStarted",
        ...BASE,
        record: {
          invocationId: "inv-1",
          runId: "run-1",
          workflowId: "wf-1",
          connectionNodeId: "conn-node-X",
          parentAgentNodeId: "agent-Y",
          parentAgentActivationId: "act-1",
          status: "running",
          updatedAt: BASE.at,
        },
      });
      expect(emitter.emitted).toHaveLength(1);
      const entry = emitter.emitted[0]!;
      expect(entry.action).toBe("workflow.credential.used");
      expect(entry.resource.id).toBe("conn-node-X");
    });
  });

  describe("non-audit events", () => {
    it("does not emit for runCreated", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await bus.publish({ kind: "runCreated", ...BASE });
      expect(emitter.emitted).toHaveLength(0);
    });
  });

  describe("start/stop", () => {
    it("does not emit after stop", async () => {
      const { bus, emitter, writer } = makeWriter();
      await writer.start();
      await writer.stop();
      await bus.publish({
        kind: "nodeCompleted",
        ...BASE,
        snapshot: { runId: "run-1", workflowId: "wf-1", nodeId: "n1", status: "completed", updatedAt: BASE.at },
      });
      expect(emitter.emitted).toHaveLength(0);
    });

    it("is idempotent when called twice", async () => {
      const { writer } = makeWriter();
      await writer.start();
      await writer.start();
      await writer.stop();
    });
  });

  describe("error handling", () => {
    it("swallows emitter errors and logs them", async () => {
      const { bus, loggerFactory } = makeWriter();
      const emitter: IWorkflowAuditEmitter = {
        emit: async () => {
          throw new Error("DB down");
        },
      };
      const writerWithBrokenEmitter = new WorkflowAuditLogWriter(bus, emitter, loggerFactory);
      await writerWithBrokenEmitter.start();
      await expect(
        bus.publish({
          kind: "nodeCompleted",
          ...BASE,
          snapshot: { runId: "run-1", workflowId: "wf-1", nodeId: "n1", status: "completed", updatedAt: BASE.at },
        }),
      ).resolves.toBeUndefined();
      expect(loggerFactory.logger.errors.length).toBeGreaterThan(0);
    });
  });
});
