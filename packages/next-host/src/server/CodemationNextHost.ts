import { access, stat } from "node:fs/promises";
import path from "node:path";
import type { Container } from "@codemation/core";
import { CoreTokens, Engine, RunIntentService } from "@codemation/core";
import type { CodemationPlugin } from "@codemation/frontend";
import type { CodemationConsumerApp } from "@codemation/frontend/server";
import {
  ApplicationTokens,
  BinaryHttpRouteHandler,
  CodemationApplication,
  CredentialHttpRouteHandler,
  RequestToWebhookItemMapper,
  RunBinaryAttachmentLookupService,
  RunHttpRouteHandler,
  WebhookHttpRouteHandler,
  WorkflowDefinitionMapper,
  WorkflowHttpRouteHandler,
} from "@codemation/frontend/next/server";
import { pathToFileURL } from "node:url";
import { CodemationTsyringeTypeInfoRegistrar } from "./CodemationTsyringeTypeInfoRegistrar";

export type CodemationNextHostContext = Readonly<{
  application: CodemationApplication;
  buildVersion: string;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
}>;

type CodemationNextHostGlobal = typeof globalThis & {
  __codemationNextHost__?: CodemationNextHost;
};

export class CodemationNextHost {
  static get shared(): CodemationNextHost {
    const globalState = globalThis as CodemationNextHostGlobal;
    if (!globalState.__codemationNextHost__) {
      globalState.__codemationNextHost__ = new CodemationNextHost();
    }
    return globalState.__codemationNextHost__;
  }

  private contextPromise: Promise<CodemationNextHostContext> | null = null;

  async prepare(): Promise<CodemationNextHostContext> {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext();
    }
    return await this.contextPromise;
  }

  async getContainer(): Promise<Container> {
    return (await this.prepare()).application.getContainer();
  }

  async getWorkflowHandler(): Promise<WorkflowHttpRouteHandler> {
    const container = await this.getContainer();
    return new WorkflowHttpRouteHandler(
      container.resolve(ApplicationTokens.QueryBus),
      container.resolve(ApplicationTokens.CommandBus),
      container.resolve(WorkflowDefinitionMapper),
    );
  }

  async getRunHandler(): Promise<RunHttpRouteHandler> {
    const container = await this.getContainer();
    return new RunHttpRouteHandler(
      container.resolve(ApplicationTokens.QueryBus),
      container.resolve(ApplicationTokens.CommandBus),
    );
  }

  async getCredentialHandler(): Promise<CredentialHttpRouteHandler> {
    const container = await this.getContainer();
    return new CredentialHttpRouteHandler(
      container.resolve(ApplicationTokens.QueryBus),
      container.resolve(ApplicationTokens.CommandBus),
    );
  }

  async getBinaryHandler(): Promise<BinaryHttpRouteHandler> {
    const container = await this.getContainer();
    return new BinaryHttpRouteHandler(
      container.resolve(RunBinaryAttachmentLookupService),
      container.resolve(CoreTokens.BinaryStorage),
    );
  }

  async getWebhookHandler(): Promise<WebhookHttpRouteHandler> {
    const container = await this.getContainer();
    return new WebhookHttpRouteHandler(
      container.resolve(ApplicationTokens.CommandBus),
      container.resolve(RunIntentService),
      container.resolve(RequestToWebhookItemMapper),
    );
  }

  private async createContext(): Promise<CodemationNextHostContext> {
    const consumerRoot = await this.resolveConsumerRoot();
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    const builtConsumerOutputPath = await this.resolveBuiltConsumerOutputPath();
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const frontendPackageRoot = path.resolve(repoRoot, "packages", "frontend");
    if (prismaCliOverride) {
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    process.env.CODEMATION_FRONTEND_PACKAGE_ROOT = frontendPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(frontendPackageRoot, "prisma.config.ts");
    const resolvedConsumerApp = await this.loadBuiltConsumerApp(builtConsumerOutputPath);
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_FRONTEND_PACKAGE_ROOT = frontendPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(frontendPackageRoot, "prisma.config.ts");
    const application = new CodemationApplication();
    const discoveredPlugins = await this.loadDiscoveredPlugins();

    application.useConfig(resolvedConsumerApp.config);
    if (discoveredPlugins.length > 0) {
      application.usePlugins(this.mergePlugins(resolvedConsumerApp.config.plugins ?? [], discoveredPlugins));
    }
    await application.applyPlugins({
      consumerRoot,
      repoRoot,
      env,
      workflowSources: resolvedConsumerApp.workflowSources,
    });
    await application.prepareFrontendServerContainer({
      repoRoot,
      env,
    });
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(application.getContainer());
    typeInfoRegistrar.registerWorkflowDefinitions(resolvedConsumerApp.config.workflows ?? []);
    typeInfoRegistrar.registerBootHookToken(resolvedConsumerApp.config.bootHook);
    if (process.env.CODEMATION_SKIP_BOOT_HOOK !== "true") {
      await application.applyBootHook({
        bootHookToken: resolvedConsumerApp.config.bootHook,
        consumerRoot,
        repoRoot,
        env,
        workflowSources: resolvedConsumerApp.workflowSources,
      });
    }

    const container = application.getContainer();
    const workflowRegistry = container.resolve(CoreTokens.WorkflowRegistry);
    const engine = container.resolve(Engine);
    await engine.start([...workflowRegistry.list()]);

    return {
      application,
      buildVersion: await this.resolveBuildVersion(builtConsumerOutputPath),
      consumerRoot,
      repoRoot,
      workflowSources: resolvedConsumerApp.workflowSources,
    };
  }

  private async resolveConsumerRoot(): Promise<string> {
    const configuredRoot = process.env.CODEMATION_CONSUMER_ROOT;
    if (configuredRoot && configuredRoot.trim().length > 0) {
      return path.resolve(process.cwd(), configuredRoot);
    }
    return process.cwd();
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

  private async invalidateContext(): Promise<void> {
    const activeContextPromise = this.contextPromise;
    this.contextPromise = null;
    if (activeContextPromise) {
      const activeContext = await activeContextPromise.catch(() => null);
      if (activeContext) {
        await activeContext.application.stopFrontendServerContainer();
      }
    }
  }

  private async resolvePrismaCliOverride(): Promise<string | null> {
    const candidate = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
    return (await this.exists(candidate)) ? candidate : null;
  }

  private async resolveBuiltConsumerOutputPath(): Promise<string> {
    const configuredPath = process.env.CODEMATION_CONSUMER_OUTPUT_PATH;
    if (!configuredPath || configuredPath.trim().length === 0) {
      throw new Error("Missing CODEMATION_CONSUMER_OUTPUT_PATH. Start the Next host through `codemation dev` or `codemation build`.");
    }
    const resolvedPath = path.resolve(configuredPath);
    if (!(await this.exists(resolvedPath))) {
      throw new Error(`Built consumer output not found at ${resolvedPath}. Run \`codemation build\` before starting the Next host.`);
    }
    return resolvedPath;
  }

  private async loadBuiltConsumerApp(outputPath: string): Promise<CodemationConsumerApp> {
    const importedModule = (await import(
      /* webpackIgnore: true */ await this.createRuntimeImportSpecifier(outputPath)
    )) as {
      codemationConsumerApp?: CodemationConsumerApp;
      default?: CodemationConsumerApp;
    };
    const consumerApp = importedModule.codemationConsumerApp ?? importedModule.default;
    if (!consumerApp) {
      throw new Error(`Built consumer output did not export a Codemation consumer app: ${outputPath}`);
    }
    return consumerApp;
  }

  private async loadDiscoveredPlugins(): Promise<ReadonlyArray<CodemationPlugin>> {
    const outputPath = process.env.CODEMATION_DISCOVERED_PLUGINS_OUTPUT_PATH;
    if (!outputPath || outputPath.trim().length === 0) {
      return [];
    }
    const resolvedPath = path.resolve(outputPath);
    if (!(await this.exists(resolvedPath))) {
      return [];
    }
    const importedModule = (await import(
      /* webpackIgnore: true */ await this.createRuntimeImportSpecifier(resolvedPath)
    )) as {
      codemationDiscoveredPlugins?: ReadonlyArray<CodemationPlugin>;
      default?: ReadonlyArray<CodemationPlugin>;
    };
    return importedModule.codemationDiscoveredPlugins ?? importedModule.default ?? [];
  }

  private mergePlugins(
    configuredPlugins: ReadonlyArray<CodemationPlugin>,
    discoveredPlugins: ReadonlyArray<CodemationPlugin>,
  ): ReadonlyArray<CodemationPlugin> {
    const pluginsByConstructor = new Map<unknown, CodemationPlugin>();
    [...configuredPlugins, ...discoveredPlugins].forEach((plugin: CodemationPlugin) => {
      const constructorKey = Object.getPrototypeOf(plugin)?.constructor ?? plugin;
      if (!pluginsByConstructor.has(constructorKey)) {
        pluginsByConstructor.set(constructorKey, plugin);
      }
    });
    return [...pluginsByConstructor.values()];
  }

  private async resolveBuildVersion(outputPath: string): Promise<string> {
    const fileStats = await stat(outputPath);
    return String(fileStats.mtimeMs);
  }

  private async createRuntimeImportSpecifier(filePath: string): Promise<string> {
    const fileUrl = pathToFileURL(filePath);
    const fileStats = await stat(filePath);
    fileUrl.searchParams.set("t", String(fileStats.mtimeMs));
    return fileUrl.href;
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
