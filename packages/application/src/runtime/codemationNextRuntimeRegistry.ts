import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { CodemationDiscoveredApplicationSetup } from "../bootstrapDiscovery";
import { CodemationApplication } from "../codemationApplication";
import { CodemationFrontendRuntimeRoot } from "./codemationFrontendRuntimeRoot";

type CodemationGlobalState = typeof globalThis & {
  __codemationNextRuntimeCache__?: CodemationNextRuntimeCache;
};

type CodemationNextRuntimeCache = {
  cacheKey: string;
  fingerprint: string;
  setupPromise: Promise<CodemationDiscoveredApplicationSetup>;
  runtimePromise?: Promise<CodemationFrontendRuntimeRoot>;
};

export class CodemationNextRuntimeRegistry {
  async getSetup(): Promise<CodemationDiscoveredApplicationSetup> {
    return await (await this.ensureCache()).setupPromise;
  }

  async getRuntime(): Promise<CodemationFrontendRuntimeRoot> {
    const cache = await this.ensureCache();
    if (!cache.runtimePromise) {
      cache.runtimePromise = this.createRuntime(cache.setupPromise);
    }
    return await cache.runtimePromise;
  }

  private async ensureCache(): Promise<CodemationNextRuntimeCache> {
    const env = this.createStringEnvironment();
    const repoRoot = this.requireEnvironmentValue(env.CODEMATION_REPO_ROOT, "CODEMATION_REPO_ROOT");
    const consumerRoot = this.requireEnvironmentValue(env.CODEMATION_CONSUMER_ROOT, "CODEMATION_CONSUMER_ROOT");
    const cacheKey = this.createCacheKey(repoRoot, consumerRoot, env);
    const fingerprint = await this.createConsumerFingerprint(consumerRoot);
    const globalState = globalThis as CodemationGlobalState;
    const existingCache = globalState.__codemationNextRuntimeCache__;
    if (existingCache && existingCache.cacheKey === cacheKey && existingCache.fingerprint === fingerprint) {
      return existingCache;
    }
    if (existingCache?.runtimePromise) {
      await this.stopRuntime(existingCache.runtimePromise);
    }
    const setupPromise = this.loadSetup(repoRoot, consumerRoot, env);
    const nextCache: CodemationNextRuntimeCache = {
      cacheKey,
      fingerprint,
      setupPromise,
    };
    globalState.__codemationNextRuntimeCache__ = nextCache;
    return nextCache;
  }

  private async loadSetup(repoRoot: string, consumerRoot: string, env: Record<string, string>): Promise<CodemationDiscoveredApplicationSetup> {
    const setup = await CodemationApplication.loadDiscoveredApplication({
      repoRoot,
      consumerRoot,
      env,
    });
    return setup;
  }

  private async createRuntime(setupPromise: Promise<CodemationDiscoveredApplicationSetup>): Promise<CodemationFrontendRuntimeRoot> {
    const env = this.createStringEnvironment();
    const repoRoot = this.requireEnvironmentValue(env.CODEMATION_REPO_ROOT, "CODEMATION_REPO_ROOT");
    const setup = await setupPromise;
    return await setup.application.createFrontendRuntimeRoot({
      repoRoot,
      env: env as unknown as NodeJS.ProcessEnv,
    });
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

  private requireEnvironmentValue(value: string | undefined, variableName: string): string {
    if (!value) {
      throw new Error(`${variableName} is required so the Next.js runtime can discover the consumer application.`);
    }
    return value;
  }

  private async createConsumerFingerprint(consumerRoot: string): Promise<string> {
    const fingerprints: string[] = [];
    for (const candidate of this.getTrackedPaths(consumerRoot)) {
      if (!(await this.exists(candidate))) continue;
      fingerprints.push(...(await this.collectFingerprints(candidate)));
    }
    fingerprints.sort((left, right) => left.localeCompare(right));
    return fingerprints.join("|");
  }

  private getTrackedPaths(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
      path.resolve(consumerRoot, "src"),
      path.resolve(consumerRoot, "workflows"),
    ];
  }

  private async collectFingerprints(targetPath: string): Promise<ReadonlyArray<string>> {
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
      // Ignore teardown failures so the next runtime can still boot.
    }
  }

}

export const codemationNextRuntimeRegistry = new CodemationNextRuntimeRegistry();
