import type { CodemationPlugin } from "@codemation/host";
import {
  AppContainerFactory,
  AppContainerLifecycle,
  CodemationPluginListMerger,
  FrontendRuntime,
} from "@codemation/host/next/server";
import {
  AppConfigLoader,
  CodemationPluginDiscovery,
  type CodemationResolvedPluginPackage,
} from "@codemation/host/server";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { CodemationTsyringeTypeInfoRegistrar } from "@codemation/host-src/presentation/server/CodemationTsyringeTypeInfoRegistrar";

import type { DevApiRuntimeContext } from "./DevApiRuntimeTypes";

export class DevApiRuntimeHost {
  private readonly pluginListMerger = new CodemationPluginListMerger();
  private contextPromise: Promise<DevApiRuntimeContext> | null = null;

  constructor(
    private readonly configLoader: AppConfigLoader,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly args: Readonly<{
      consumerRoot: string;
      env: NodeJS.ProcessEnv;
      runtimeWorkingDirectory: string;
    }>,
  ) {}

  async prepare(): Promise<DevApiRuntimeContext> {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext();
    }
    return await this.contextPromise;
  }

  async stop(): Promise<void> {
    const contextPromise = this.contextPromise;
    this.contextPromise = null;
    if (!contextPromise) {
      return;
    }
    const context = await contextPromise;
    await context.container.resolve(AppContainerLifecycle).stop();
  }

  private async createContext(): Promise<DevApiRuntimeContext> {
    const consumerRoot = path.resolve(this.args.consumerRoot);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = path.resolve(repoRoot, "packages", "host");
    const env = { ...this.args.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    env.CODEMATION_CONSUMER_ROOT = consumerRoot;
    const configResolution = await this.configLoader.load({
      consumerRoot,
      repoRoot,
      env,
    });
    const discoveredPlugins = await this.loadDiscoveredPlugins(consumerRoot);
    const appConfig = {
      ...configResolution.appConfig,
      env,
      plugins:
        discoveredPlugins.length > 0
          ? this.pluginListMerger.merge(configResolution.appConfig.plugins, discoveredPlugins)
          : configResolution.appConfig.plugins,
    };
    const container = await new AppContainerFactory().create({
      appConfig,
      sharedWorkflowWebsocketServer: null,
    });
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(container);
    typeInfoRegistrar.registerWorkflowDefinitions(appConfig.workflows ?? []);
    await container.resolve(FrontendRuntime).start();
    return {
      buildVersion: this.createBuildVersion(),
      container,
      consumerRoot,
      repoRoot,
      workflowIds: appConfig.workflows.map((workflow) => workflow.id),
      workflowSources: appConfig.workflowSources,
    };
  }

  private async loadDiscoveredPlugins(consumerRoot: string): Promise<ReadonlyArray<CodemationPlugin>> {
    const resolvedPackages = await this.pluginDiscovery.resolvePlugins(consumerRoot);
    return resolvedPackages.map((resolvedPackage: CodemationResolvedPluginPackage) => resolvedPackage.plugin);
  }

  private async detectWorkspaceRoot(startDirectory: string): Promise<string> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return startDirectory;
      }
      currentDirectory = parentDirectory;
    }
  }

  private async resolvePrismaCliOverride(): Promise<string | null> {
    const candidate = path.resolve(this.args.runtimeWorkingDirectory, "node_modules", "prisma", "build", "index.js");
    return (await this.exists(candidate)) ? candidate : null;
  }

  private createBuildVersion(): string {
    return `${Date.now()}-${process.pid}`;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
