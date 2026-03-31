import "reflect-metadata";

import type { NodeExecutionRequest, NodeResolver, WorkflowRunnerService } from "@codemation/core";
import { CoreTokens, container } from "@codemation/core";
import {
  Engine,
  EngineExecutionLimitsPolicy,
  InMemoryBinaryStorage,
  InMemoryWorkflowExecutionRepository,
} from "@codemation/core/bootstrap";
import { InMemoryLiveWorkflowRepository, RejectingCredentialSessionService } from "@codemation/core/testing";
import { describe, expect, it } from "vitest";

import { ApplicationTokens } from "../../src/applicationTokens";
import { AppContainerLifecycle } from "../../src/bootstrap/AppContainerLifecycle";
import { WorkerRuntime } from "../../src/bootstrap/runtime/WorkerRuntime";
import { DatabaseMigrations } from "../../src/bootstrap/runtime/DatabaseMigrations";
import type { AppConfig } from "../../src/presentation/config/AppConfig";
import { InMemoryWorkflowActivationRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowActivationRepository";
import { RuntimeWorkflowActivationPolicy } from "../../src/infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import type {
  WorkerRuntimeHandle,
  WorkerRuntimeScheduler,
} from "../../src/infrastructure/scheduler/WorkerRuntimeScheduler";

class RecordingDatabaseMigrations {
  migrateCalls = 0;

  async migrate(): Promise<void> {
    this.migrateCalls += 1;
  }
}

class StubNodeResolver implements NodeResolver {
  resolve<T>(): T {
    return undefined as T;
  }
}

class RecordingWorkerRuntimeScheduler implements WorkerRuntimeScheduler {
  closeCalls = 0;
  createWorkerCalls = 0;
  workerStopCalls = 0;

  enqueue(_request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    return Promise.resolve({ receiptId: "test-receipt" });
  }

  createWorker(_args: Readonly<{ queues: ReadonlyArray<string>; requestHandler: unknown }>): WorkerRuntimeHandle {
    this.createWorkerCalls += 1;
    return {
      stop: async () => {
        this.workerStopCalls += 1;
      },
    };
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class RecordingAppContainerLifecycle {
  stopCalls = 0;

  async stop(_args?: Readonly<{ stopWebsocketServer?: boolean }>): Promise<void> {
    this.stopCalls += 1;
  }
}

function buildMinimalAppConfig(overrides?: Readonly<{ env?: NodeJS.ProcessEnv }>): AppConfig {
  return {
    consumerRoot: "/tmp/codemation-worker-runtime-test",
    repoRoot: "/tmp/codemation-worker-runtime-test",
    env: overrides?.env ?? { ...process.env, CODEMATION_SKIP_STARTUP_MIGRATIONS: "true" },
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "none" },
    scheduler: { kind: "bullmq", workerQueues: ["default"] },
    eventing: { kind: "memory" },
    whitelabel: {},
    webSocketPort: 0,
    webSocketBindHost: "127.0.0.1",
  };
}

describe("WorkerRuntime", () => {
  it("runs startup, wires the worker scheduler, and stops cleanly", async () => {
    const child = container.createChildContainer();
    const appConfig = buildMinimalAppConfig();
    const migrations = new RecordingDatabaseMigrations();
    const activationRepository = new InMemoryWorkflowActivationRepository();
    const workflowRepository = new InMemoryLiveWorkflowRepository();
    const scheduler = new RecordingWorkerRuntimeScheduler();
    const lifecycle = new RecordingAppContainerLifecycle();
    const engine: Pick<Engine, "start" | "stop"> = {
      async start() {},
      async stop() {},
    };
    const workflowRunner: WorkflowRunnerService = {
      async runById() {
        throw new Error("WorkerRuntime test does not execute workflows");
      },
    };

    child.registerInstance(ApplicationTokens.AppConfig, appConfig);
    child.registerInstance(DatabaseMigrations, migrations as unknown as DatabaseMigrations);
    child.register(RuntimeWorkflowActivationPolicy, { useClass: RuntimeWorkflowActivationPolicy });
    child.registerInstance(ApplicationTokens.WorkflowActivationRepository, activationRepository);
    child.registerInstance(CoreTokens.WorkflowRepository, workflowRepository);
    child.registerInstance(Engine, engine as Engine);
    child.registerInstance(CoreTokens.NodeResolver, new StubNodeResolver());
    child.registerInstance(CoreTokens.CredentialSessionService, new RejectingCredentialSessionService());
    child.registerInstance(CoreTokens.WorkflowExecutionRepository, new InMemoryWorkflowExecutionRepository());
    child.registerInstance(CoreTokens.BinaryStorage, new InMemoryBinaryStorage());
    child.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner);
    child.registerInstance(CoreTokens.EngineExecutionLimitsPolicy, new EngineExecutionLimitsPolicy());
    child.registerInstance(ApplicationTokens.WorkerRuntimeScheduler, scheduler);
    child.registerInstance(AppContainerLifecycle, lifecycle as unknown as AppContainerLifecycle);
    child.register(WorkerRuntime, { useClass: WorkerRuntime });

    const runtime = child.resolve(WorkerRuntime);
    const handle = await runtime.start(["default"]);

    expect(migrations.migrateCalls).toBe(0);
    expect(scheduler.createWorkerCalls).toBe(1);

    await handle.stop();

    expect(scheduler.workerStopCalls).toBe(1);
    expect(scheduler.closeCalls).toBe(1);
    expect(lifecycle.stopCalls).toBe(1);
  });

  it("runs database migrations when CODEMATION_SKIP_STARTUP_MIGRATIONS is not true", async () => {
    const child = container.createChildContainer();
    const appConfig = buildMinimalAppConfig({
      env: { ...process.env, CODEMATION_SKIP_STARTUP_MIGRATIONS: "false" },
    });
    const migrations = new RecordingDatabaseMigrations();
    const activationRepository = new InMemoryWorkflowActivationRepository();
    const workflowRepository = new InMemoryLiveWorkflowRepository();
    const scheduler = new RecordingWorkerRuntimeScheduler();
    const lifecycle = new RecordingAppContainerLifecycle();
    const engine: Pick<Engine, "start" | "stop"> = {
      async start() {},
      async stop() {},
    };
    const workflowRunner: WorkflowRunnerService = {
      async runById() {
        throw new Error("WorkerRuntime test does not execute workflows");
      },
    };

    child.registerInstance(ApplicationTokens.AppConfig, appConfig);
    child.registerInstance(DatabaseMigrations, migrations as unknown as DatabaseMigrations);
    child.register(RuntimeWorkflowActivationPolicy, { useClass: RuntimeWorkflowActivationPolicy });
    child.registerInstance(ApplicationTokens.WorkflowActivationRepository, activationRepository);
    child.registerInstance(CoreTokens.WorkflowRepository, workflowRepository);
    child.registerInstance(Engine, engine as Engine);
    child.registerInstance(CoreTokens.NodeResolver, new StubNodeResolver());
    child.registerInstance(CoreTokens.CredentialSessionService, new RejectingCredentialSessionService());
    child.registerInstance(CoreTokens.WorkflowExecutionRepository, new InMemoryWorkflowExecutionRepository());
    child.registerInstance(CoreTokens.BinaryStorage, new InMemoryBinaryStorage());
    child.registerInstance(CoreTokens.WorkflowRunnerService, workflowRunner);
    child.registerInstance(CoreTokens.EngineExecutionLimitsPolicy, new EngineExecutionLimitsPolicy());
    child.registerInstance(ApplicationTokens.WorkerRuntimeScheduler, scheduler);
    child.registerInstance(AppContainerLifecycle, lifecycle as unknown as AppContainerLifecycle);
    child.register(WorkerRuntime, { useClass: WorkerRuntime });

    const runtime = child.resolve(WorkerRuntime);
    const handle = await runtime.start(["q1"]);
    await handle.stop();

    expect(migrations.migrateCalls).toBe(1);
  });
});
