import { accessSync } from "node:fs";
import path from "node:path";
import type { QueryBus } from "../../application/bus/QueryBus";
import type { WorkflowDto, WorkflowSummary } from "../../application/contracts/WorkflowViewContracts";
import { WorkflowDefinitionMapper } from "../../application/mapping/WorkflowDefinitionMapper";
import { GetWorkflowDetailQuery } from "../../application/queries/GetWorkflowDetailQuery";
import { GetWorkflowSummariesQuery } from "../../application/queries/GetWorkflowSummariesQuery";
import { ApplicationTokens } from "../../applicationTokens";
import { AppContainerFactory } from "../../bootstrap/AppContainerFactory";
import { AppContainerLifecycle } from "../../bootstrap/AppContainerLifecycle";
import { FrontendRuntime } from "../../bootstrap/runtime/FrontendRuntime";
import { AppConfigFactory } from "../../bootstrap/runtime/AppConfigFactory";
import type { CodemationConfig } from "../config/CodemationConfig";
import { CodemationConfigNormalizer } from "../config/CodemationConfigNormalizer";
import { CodemationHonoApiApp } from "./hono/CodemationHonoApiAppFactory";

type ServerGatewayContext = Readonly<{
  container: import("@codemation/core").Container;
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
    await (await cachedContext).container.resolve(AppContainerLifecycle).stop();
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
    // This gateway is the config/env boundary that materializes AppConfig from raw inputs.
    // eslint-disable-next-line no-restricted-properties
    const env = this.env ?? process.env;
    const appConfig = new AppConfigFactory().create({
      repoRoot,
      consumerRoot: this.consumerRoot,
      env,
      config: new CodemationConfigNormalizer().normalize(this.config),
      workflowSources: this.resolveWorkflowSources(),
    });
    const container = await new AppContainerFactory().create({
      appConfig,
      sharedWorkflowWebsocketServer: null,
    });
    await container.resolve(FrontendRuntime).start();
    return {
      container,
      httpApi: container.resolve(CodemationHonoApiApp),
      queryBus: container.resolve(ApplicationTokens.QueryBus),
      workflowDefinitionMapper: container.resolve(WorkflowDefinitionMapper),
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
