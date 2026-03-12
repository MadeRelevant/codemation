import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { CoreTokens, Engine, instanceCachingFactory, type RunStateStore, type WorkflowRegistry, type WorkflowRunnerService } from "@codemation/core";
import type { CodemationBootstrapResult, CodemationDiscoveredApplicationSetup } from "../bootstrapDiscovery";
import { CodemationApplication } from "../codemationApplication";
import type { CodemationPreparedExecutionRuntime } from "../codemationRuntimeContracts";
import { CodemationServerEngineHost } from "../host/codemationServerEngineHost";
import { CodemationWebhookRegistry } from "../host/codemationWebhookRegistry";
import { CodemationFrontendRuntimeRoot } from "./codemationFrontendRuntimeRoot";
import { CodemationRuntimeTrackedPaths } from "./codemationRuntimeTrackedPaths";

type CodemationGlobalState = typeof globalThis & {
  __codemationRuntimeCache__?: CodemationRuntimeCache;
};

type CodemationRuntimeCache = {
  cacheKey: string;
  fingerprint: string;
  setupPromise: Promise<CodemationDiscoveredApplicationSetup>;
  runtimePromise?: Promise<CodemationFrontendRuntimeRoot>;
  executionRuntimePromise?: Promise<CodemationPreparedExecutionRuntime>;
};

export class CodemationRuntimeRegistry {
  async getSetup(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<CodemationDiscoveredApplicationSetup> {
    return await (await this.ensureCache(args)).setupPromise;
  }

  async getRuntime(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<CodemationFrontendRuntimeRoot> {
    const cache = await this.ensureCache(args);
    if (!cache.runtimePromise) {
      cache.runtimePromise = this.createRuntime(cache.setupPromise);
    }
    return await cache.runtimePromise;
  }

  async getPreparedSetup(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<CodemationDiscoveredApplicationSetup> {
    const env = this.createStringEnvironment();
    const consumerRoot = this.resolveConsumerRoot(env);
    const repoRoot = await this.resolveRepoRoot(consumerRoot, env);
    const setup = await this.getSetup(args);
    await setup.application.prepareRuntimeContainer({
      repoRoot,
      env: env as unknown as NodeJS.ProcessEnv,
    });
    return setup;
  }

  async getPreparedRunStore(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<RunStateStore> {
    const setup = await this.getPreparedSetup(args);
    return setup.application.getContainer().resolve(CoreTokens.RunStateStore);
  }

  async getPreparedExecutionRuntime(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<CodemationPreparedExecutionRuntime> {
    const cache = await this.ensureCache(args);
    if (cache.runtimePromise) {
      return await this.createPreparedExecutionRuntimeFromRoot(cache.setupPromise, cache.runtimePromise);
    }
    if (!cache.executionRuntimePromise) {
      cache.executionRuntimePromise = this.createPreparedExecutionRuntime(cache.setupPromise);
    }
    return await cache.executionRuntimePromise;
  }

  private async ensureCache(args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<CodemationRuntimeCache> {
    const env = this.createStringEnvironment();
    const consumerRoot = this.resolveConsumerRoot(env);
    const repoRoot = await this.resolveRepoRoot(consumerRoot, env);
    const cacheKey = this.createCacheKey(repoRoot, consumerRoot, env);
    const fingerprint = await this.createConsumerFingerprint(consumerRoot, repoRoot);
    const globalState = globalThis as CodemationGlobalState;
    const existingCache = globalState.__codemationRuntimeCache__;
    if (existingCache && existingCache.cacheKey === cacheKey && existingCache.fingerprint === fingerprint) {
      return existingCache;
    }
    if (existingCache?.runtimePromise) {
      await this.stopRuntime(existingCache.runtimePromise);
    }
    const setupPromise = this.loadSetup(repoRoot, consumerRoot, env, args?.configOverride);
    const runtimeCache: CodemationRuntimeCache = {
      cacheKey,
      fingerprint,
      setupPromise,
    };
    globalState.__codemationRuntimeCache__ = runtimeCache;
    return runtimeCache;
  }

  private async loadSetup(
    repoRoot: string,
    consumerRoot: string,
    env: Record<string, string>,
    configOverride?: CodemationBootstrapResult,
  ): Promise<CodemationDiscoveredApplicationSetup> {
    const setup = await CodemationApplication.loadDiscoveredApplication({
      repoRoot,
      consumerRoot,
      env,
      configOverride,
    });
    return setup;
  }

  private async createRuntime(setupPromise: Promise<CodemationDiscoveredApplicationSetup>): Promise<CodemationFrontendRuntimeRoot> {
    const env = this.createStringEnvironment();
    const consumerRoot = this.resolveConsumerRoot(env);
    const repoRoot = await this.resolveRepoRoot(consumerRoot, env);
    const setup = await setupPromise;
    return await setup.application.createFrontendRuntimeRoot({
      repoRoot,
      env: env as unknown as NodeJS.ProcessEnv,
    });
  }

  private async createPreparedExecutionRuntime(setupPromise: Promise<CodemationDiscoveredApplicationSetup>): Promise<CodemationPreparedExecutionRuntime> {
    const env = this.createStringEnvironment();
    const consumerRoot = this.resolveConsumerRoot(env);
    const repoRoot = await this.resolveRepoRoot(consumerRoot, env);
    const setup = await setupPromise;
    if (typeof (setup.application as { prepareExecutionRuntimeContainer?: unknown }).prepareExecutionRuntimeContainer === "function") {
      await setup.application.prepareExecutionRuntimeContainer({
        repoRoot,
        env: env as unknown as NodeJS.ProcessEnv,
      });
    } else {
      await setup.application.prepareRuntimeContainer({
        repoRoot,
        env: env as unknown as NodeJS.ProcessEnv,
      });
      const container = setup.application.getContainer();
      container.registerInstance(CoreTokens.WebhookBasePath, "/api/webhooks");
      container.register(CodemationServerEngineHost, {
        useFactory: instanceCachingFactory((dependencyContainer) => {
          return new CodemationServerEngineHost(
            dependencyContainer.resolve(CodemationWebhookRegistry),
            dependencyContainer.resolve(CoreTokens.WebhookBasePath),
          );
        }),
      });
      container.register(CoreTokens.WebhookRegistrar, {
        useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationServerEngineHost)),
      });
      container.register(CoreTokens.NodeActivationObserver, {
        useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationServerEngineHost)),
      });
    }
    const container = setup.application.getContainer();
    const workflowRegistry = container.resolve(CoreTokens.WorkflowRegistry);
    const engine = container.resolve(Engine);
    const runStore = container.resolve(CoreTokens.RunStateStore);
    await engine.start([...workflowRegistry.list()]);
    return {
      setup,
      engine,
      workflowRegistry,
      workflowRunner: container.resolve(CoreTokens.WorkflowRunnerService),
      webhookRegistry: container.resolve(CodemationWebhookRegistry),
      runStore,
    };
  }

  private async createPreparedExecutionRuntimeFromRoot(
    setupPromise: Promise<CodemationDiscoveredApplicationSetup>,
    runtimePromise: Promise<CodemationFrontendRuntimeRoot>,
  ): Promise<CodemationPreparedExecutionRuntime> {
    const [setup, runtime] = await Promise.all([setupPromise, runtimePromise]);
    return {
      setup,
      engine: runtime.getEngine(),
      workflowRegistry: runtime.getWorkflowRegistry(),
      workflowRunner: runtime.getWorkflowRunner(),
      webhookRegistry: runtime.getWebhookRegistry(),
      runStore: runtime.getRunStore(),
    };
  }

  private createStringEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") env[key] = value;
    }
    return env;
  }

  private createCacheKey(repoRoot: string, consumerRoot: string, env: Record<string, string>): string {
    return [repoRoot, consumerRoot, env.CODEMATION_FRONTEND_PORT ?? "", env.CODEMATION_WS_PORT ?? "", env.CODEMATION_WS_BIND_HOST ?? ""].join("|");
  }

  private resolveConsumerRoot(env: Record<string, string>): string {
    return env.CODEMATION_CONSUMER_ROOT ?? process.cwd();
  }

  private async resolveRepoRoot(consumerRoot: string, env: Record<string, string>): Promise<string> {
    if (env.CODEMATION_REPO_ROOT) return env.CODEMATION_REPO_ROOT;
    const detectedWorkspaceRoot = await this.detectWorkspaceRoot(consumerRoot);
    return detectedWorkspaceRoot ?? consumerRoot;
  }

  private async detectWorkspaceRoot(startDirectory: string): Promise<string | null> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) return currentDirectory;
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) return null;
      currentDirectory = parentDirectory;
    }
  }

  private async createConsumerFingerprint(consumerRoot: string, repoRoot: string): Promise<string> {
    const fingerprints: string[] = [];
    for (const candidate of this.getTrackedPaths(consumerRoot, repoRoot)) {
      if (!(await this.exists(candidate))) continue;
      fingerprints.push(...(await this.collectFingerprints(candidate)));
    }
    fingerprints.sort((left, right) => left.localeCompare(right));
    return fingerprints.join("|");
  }

  private getTrackedPaths(consumerRoot: string, repoRoot: string): ReadonlyArray<string> {
    return CodemationRuntimeTrackedPaths.getAll({ consumerRoot, repoRoot });
  }

  private async collectFingerprints(targetPath: string): Promise<ReadonlyArray<string>> {
    if (!this.shouldTrackPath(targetPath)) {
      return [];
    }
    const targetStats = await stat(targetPath);
    if (!targetStats.isDirectory()) {
      return [this.formatFingerprint(targetPath, targetStats)];
    }
    const entries = await readdir(targetPath, { withFileTypes: true });
    const fingerprints: string[] = [];
    for (const entry of entries) {
      const entryPath = path.resolve(targetPath, entry.name);
      if (entry.isDirectory()) {
        fingerprints.push(...(await this.collectFingerprints(entryPath)));
        continue;
      }
      const entryStats = await stat(entryPath);
      fingerprints.push(this.formatFingerprint(entryPath, entryStats));
    }
    return fingerprints;
  }

  private shouldTrackPath(targetPath: string): boolean {
    return CodemationRuntimeTrackedPaths.shouldTrack(targetPath);
  }

  private formatFingerprint(filePath: string, fileStats: Awaited<ReturnType<typeof stat>>): string {
    return `${filePath}:${fileStats.size}:${fileStats.mtimeMs}`;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async stopRuntime(runtimePromise: Promise<CodemationFrontendRuntimeRoot>): Promise<void> {
    try {
      const runtime = await runtimePromise;
      await runtime.stop();
    } catch {
      // Ignore teardown failures so the replacement runtime can still boot.
    }
  }
}
