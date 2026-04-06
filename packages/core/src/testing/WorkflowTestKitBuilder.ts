import type { DependencyContainer } from "tsyringe";

import type { Items, NodeId, RunnableNodeConfig, RunResult, WorkflowDefinition, WorkflowId } from "../types";

import { RegistrarEngineTestKitFactory } from "./RegistrarEngineTestKitFactory";
import type { EngineTestKitOptions, RegistrarEngineTestKitHandle } from "./RegistrarEngineTestKit.types";
import { WorkflowTestKitNodeRegistrationContextFactory } from "./WorkflowTestKitNodeRegistrationContextFactory";
import type { DefinedNodeRegistration } from "./WorkflowTestKit.types";
import { WorkflowTestKitRunNodeWorkflowFactory } from "./WorkflowTestKitRunNodeWorkflowFactory";

export type { DefinedNodeRegistration, DefinedNodeRegistrationContext } from "./WorkflowTestKit.types";

export type WorkflowTestKitOptions = EngineTestKitOptions;

export class WorkflowTestKit {
  private readonly handle: RegistrarEngineTestKitHandle;
  private readonly runNodeWorkflowFactory = new WorkflowTestKitRunNodeWorkflowFactory();
  private readonly nodeRegistrationContextFactory = new WorkflowTestKitNodeRegistrationContextFactory();

  constructor(options: WorkflowTestKitOptions = {}) {
    this.handle = RegistrarEngineTestKitFactory.create(options);
  }

  get dependencyContainer(): DependencyContainer {
    return this.handle.dependencyContainer;
  }

  get engine(): RegistrarEngineTestKitHandle["engine"] {
    return this.handle.engine;
  }

  get workflowRunner(): RegistrarEngineTestKitHandle["workflowRunner"] {
    return this.handle.workflowRunner;
  }

  get liveWorkflowRepository(): RegistrarEngineTestKitHandle["liveWorkflowRepository"] {
    return this.handle.liveWorkflowRepository;
  }

  get runStore(): RegistrarEngineTestKitHandle["runStore"] {
    return this.handle.runStore;
  }

  /**
   * Registers {@link import("../authoring/defineNode.types").DefinedNode} implementations on the same DI container used by the engine
   * (same pattern as `plugin.register({ registerNode })` in the host).
   */
  registerDefinedNodes(definitions: ReadonlyArray<DefinedNodeRegistration>): void {
    const ctx = this.nodeRegistrationContextFactory.create(this.handle.dependencyContainer);
    for (const def of definitions) {
      def.register(ctx);
    }
  }

  async run(args: { workflow: WorkflowDefinition; items: Items; startAt?: NodeId }): Promise<RunResult> {
    await this.handle.start([args.workflow]);
    return await this.handle.workflowRunner.runById({
      workflowId: args.workflow.id,
      startAt: args.startAt,
      items: args.items,
    });
  }

  async runNode(args: {
    node: RunnableNodeConfig;
    items: Items;
    workflowId?: WorkflowId;
    workflowName?: string;
  }): Promise<RunResult> {
    const wf = this.runNodeWorkflowFactory.build(args);
    return await this.run({
      workflow: wf,
      items: args.items,
      startAt: this.runNodeWorkflowFactory.defaultStartNodeId(),
    });
  }
}
