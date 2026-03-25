import { CoreTokens, Engine } from "@codemation/core";
import { accessSync } from "node:fs";
import path from "node:path";
import type { QueryBus } from "../../application/bus/QueryBus";
import type { WorkflowDto, WorkflowSummary } from "../../application/contracts/WorkflowViewContracts";
import { WorkflowDefinitionMapper } from "../../application/mapping/WorkflowDefinitionMapper";
import { GetWorkflowDetailQuery } from "../../application/queries/GetWorkflowDetailQuery";
import { GetWorkflowSummariesQuery } from "../../application/queries/GetWorkflowSummariesQuery";
import { ApplicationTokens } from "../../applicationTokens";
import { CodemationApplication } from "../../codemationApplication";
import type { CodemationConfig } from "../config/CodemationConfig";
import { CodemationHonoApiApp } from "./hono/CodemationHonoApiAppFactory";

type ServerGatewayContext = Readonly<{
  application: CodemationApplication;
  httpApi: CodemationHonoApiApp;
  queryBus: QueryBus;
  workflowDefinitionMapper: WorkflowDefinitionMapper;
}>;

export class CodemationServerGateway {
  private static readonly contextsByConfig = new WeakMap<object, Promise<ServerGatewayContext>>();

  constructor(
    private readonly config: CodemationConfig,
    private readonly consumerRoot: string,
    private readonly configSource?: string,
    private readonly workflowSources: ReadonlyArray<string> = [],
    private readonly env?: Readonly<NodeJS.ProcessEnv>,
  ) {}

  async dispatch(request: Request): Promise<Response> {
    return await (await this.getContext()).httpApi.fetch(request);
  }

  async prepare(): Promise<void> {
    await this.getContext();
  }

  async close(): Promise<void> {
    const cachedContext = CodemationServerGateway.contextsByConfig.get(this.config as object);
    if (!cachedContext) {
      return;
    }
    CodemationServerGateway.contextsByConfig.delete(this.config as object);
    await (await cachedContext).application.stopFrontendServerContainer();
  }

  async loadWorkflowSummaries(): Promise<ReadonlyArray<WorkflowSummary>> {
    const context = await this.getContext();
    const workflows = await context.queryBus.execute(new GetWorkflowSummariesQuery());
    return workflows.map((workflow) => context.workflowDefinitionMapper.toSummary(workflow));
  }

  async loadWorkflowDetail(workflowId: string): Promise<WorkflowDto> {
    const context = await this.getContext();
    const workflow = await context.queryBus.execute(new GetWorkflowDetailQuery(workflowId));
    if (!workflow) {
      throw new Error(`Unknown workflowId: ${workflowId}`);
    }
    return await context.workflowDefinitionMapper.map(workflow);
  }

  private getContext(): Promise<ServerGatewayContext> {
    const cachedContext = CodemationServerGateway.contextsByConfig.get(this.config as object);
    if (cachedContext) {
      return cachedContext;
    }
    const nextContext = this.createContext();
    CodemationServerGateway.contextsByConfig.set(this.config as object, nextContext);
    return nextContext;
  }

  private async createContext(): Promise<ServerGatewayContext> {
    const repoRoot = this.detectWorkspaceRoot(this.consumerRoot);
    const env = { ...process.env, ...(this.env ?? {}) };
    const application = new CodemationApplication();
    application.useConfig(this.config);
    await application.applyPlugins({
      consumerRoot: this.consumerRoot,
      repoRoot,
      env,
      workflowSources: this.resolveWorkflowSources(),
    });
    await application.prepareFrontendServerContainer({
      repoRoot,
      env,
    });
    await application.applyBootHook({
      bootHookToken: this.config.bootHook,
      consumerRoot: this.consumerRoot,
      repoRoot,
      env,
      workflowSources: this.resolveWorkflowSources(),
    });
    await this.startEngine(application);
    return {
      application,
      httpApi: application.getContainer().resolve(CodemationHonoApiApp),
      queryBus: application.getContainer().resolve(ApplicationTokens.QueryBus),
      workflowDefinitionMapper: application.getContainer().resolve(WorkflowDefinitionMapper),
    };
  }

  private resolveWorkflowSources(): ReadonlyArray<string> {
    if (this.workflowSources.length > 0) {
      return [...this.workflowSources];
    }
    if (!this.configSource || !this.config.workflows || this.config.workflows.length === 0) {
      return [];
    }
    return [this.configSource];
  }

  private async startEngine(application: CodemationApplication): Promise<void> {
    const container = application.getContainer();
    const workflowRepository = container.resolve(CoreTokens.WorkflowRepository);
    const engine = container.resolve(Engine);
    await engine.start([...workflowRepository.list()]);
  }

  private detectWorkspaceRoot(startDirectory: string): string {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      try {
        accessSync(path.resolve(currentDirectory, "pnpm-workspace.yaml"));
        return currentDirectory;
      } catch {
        const parentDirectory = path.dirname(currentDirectory);
        if (parentDirectory === currentDirectory) {
          return startDirectory;
        }
        currentDirectory = parentDirectory;
      }
    }
  }
}
