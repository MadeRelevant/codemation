import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";
import { container as tsyringeContainer } from "tsyringe";

import {
  AllWorkflowsActiveWorkflowActivationPolicy,
  CoreTokens,
  InMemoryRunEventBus,
  RunIntentService,
} from "../../src/index.ts";
import {
  DefaultAsyncSleeper,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  Engine,
  EngineRuntimeRegistrar,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InProcessRetryRunner,
  InMemoryRunDataFactory,
  InMemoryWorkflowExecutionRepository,
  InlineDrivingScheduler,
  NodeExecutor,
  NodeInstanceFactory,
  PersistedWorkflowTokenRegistry,
} from "../../src/bootstrap/index.ts";
import { InMemoryLiveWorkflowRepository, RejectingCredentialSessionService } from "../../src/testing.ts";
import { CallbackNodeConfig, chain, items } from "../harness/index.ts";
import { CapturingScheduler } from "../harness/engine.ts";

test("EngineRuntimeRegistrar registers inline activation scheduling by default", () => {
  const container = tsyringeContainer.createChildContainer();
  container.registerInstance(CoreTokens.NodeResolver, container);
  container.registerInstance(CoreTokens.LiveWorkflowRepository, new InMemoryLiveWorkflowRepository());
  container.registerInstance(CoreTokens.WorkflowRepository, new InMemoryLiveWorkflowRepository());
  container.registerInstance(CoreTokens.CredentialSessionService, new RejectingCredentialSessionService());
  container.registerInstance(CoreTokens.RunIdFactory, {
    makeRunId: () => "run_reg",
    makeActivationId: () => "act_reg",
  });
  container.registerInstance(CoreTokens.ActivationIdFactory, {
    makeRunId: () => "run_reg",
    makeActivationId: () => "act_reg",
  });
  container.registerInstance(CoreTokens.WebhookBasePath, "/webhooks");
  container.registerInstance(CoreTokens.WorkflowExecutionRepository, new InMemoryWorkflowExecutionRepository());
  container.registerInstance(CoreTokens.TriggerSetupStateRepository, {
    async load() {
      return undefined;
    },
    async save() {},
    async delete() {},
  });
  container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
  container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
  container.registerInstance(CoreTokens.RunEventBus, new InMemoryRunEventBus());
  container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
  container.registerInstance(CoreTokens.WorkflowActivationPolicy, new AllWorkflowsActiveWorkflowActivationPolicy());

  new EngineRuntimeRegistrar().register(container, {});

  const activationScheduler = container.resolve(CoreTokens.NodeActivationScheduler);
  assert.ok(activationScheduler instanceof InlineDrivingScheduler);
});

test("EngineRuntimeRegistrar preserves host-provided activation scheduler overrides", async () => {
  const liveWorkflowRepository = new InMemoryLiveWorkflowRepository();
  const workflowExecutionRepository = new InMemoryWorkflowExecutionRepository();
  const scheduler = new CapturingScheduler();
  const nodeResolver = tsyringeContainer.createChildContainer();
  const activationScheduler = new DefaultDrivingScheduler(
    new HintOnlyOffloadPolicy(),
    scheduler,
    new InlineDrivingScheduler(
      new NodeExecutor(new NodeInstanceFactory(nodeResolver), new InProcessRetryRunner(new DefaultAsyncSleeper())),
    ),
  );
  const container = tsyringeContainer.createChildContainer();

  container.registerInstance(CoreTokens.CredentialSessionService, new RejectingCredentialSessionService());
  container.registerInstance(CoreTokens.LiveWorkflowRepository, liveWorkflowRepository);
  container.registerInstance(CoreTokens.WorkflowRepository, liveWorkflowRepository);
  container.registerInstance(CoreTokens.NodeResolver, container);
  container.registerInstance(CoreTokens.RunIdFactory, {
    makeRunId: () => "run_reg",
    makeActivationId: () => "act_reg",
  });
  container.registerInstance(CoreTokens.ActivationIdFactory, {
    makeRunId: () => "run_reg",
    makeActivationId: () => "act_reg",
  });
  container.registerInstance(CoreTokens.WebhookBasePath, "/webhooks");
  container.registerInstance(CoreTokens.WorkflowExecutionRepository, workflowExecutionRepository);
  container.registerInstance(CoreTokens.TriggerSetupStateRepository, {
    async load() {
      return undefined;
    },
    async save() {},
    async delete() {},
  });
  container.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
  container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
  container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
  container.registerInstance(CoreTokens.RunEventBus, new InMemoryRunEventBus());
  container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
  container.registerInstance(CoreTokens.WorkflowActivationPolicy, new AllWorkflowsActiveWorkflowActivationPolicy());

  new EngineRuntimeRegistrar().register(container, {});

  const engine = container.resolve(Engine);
  const runIntent = container.resolve(RunIntentService);
  const runner = container.resolve(CoreTokens.WorkflowRunnerService);
  assert.ok(engine);
  assert.ok(runIntent instanceof RunIntentService);
  assert.ok(runner instanceof EngineWorkflowRunnerService);

  const def = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const wf = chain({ id: "wf_registrar", name: "registrar smoke" }).start(def).build();
  await engine.start([wf]);
  const scheduled = await engine.runWorkflow(wf, "N1", items([{ v: 1 }]), undefined, undefined);
  assert.equal(scheduled.status, "pending");
});
