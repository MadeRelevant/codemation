import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import { existsSync } from "node:fs";
import path from "node:path";

import { CodemationCliApplicationSession } from "../bootstrap/CodemationCliApplicationSession";
import { CliPathResolver } from "../path/CliPathResolver";
import type { UserAdminConsumerDotenvLoader } from "./UserAdminConsumerDotenvLoader";

export type UserAdminCliOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
}>;

/**
 * Shared env/config/session wiring for `codemation user *` commands (local auth + database).
 */
export class UserAdminCliBootstrap {
  constructor(
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
  ) {}

  async withSession<T>(
    options: UserAdminCliOptions,
    fn: (session: CodemationCliApplicationSession) => Promise<T>,
  ): Promise<T> {
    const consumerRoot = options.consumerRoot ?? process.cwd();
    this.consumerDotenvLoader.load(consumerRoot);
    this.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options.configPath,
    });
    if (resolution.config.auth?.kind !== "local") {
      throw new Error('Codemation user commands require CodemationConfig.auth.kind to be "local".');
    }
    const databaseUrl = this.resolveDatabaseUrl(resolution.config.runtime?.database?.url);
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set (or configured on CodemationConfig.runtime.database.url) for user administration.",
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    const paths = await this.pathResolver.resolve(consumerRoot);
    const session = await CodemationCliApplicationSession.open({
      resolution,
      repoRoot: paths.repoRoot,
      env: process.env,
    });
    try {
      return await fn(session);
    } finally {
      await session.close();
    }
  }

  /**
   * tsx/esbuild only applies `experimentalDecorators` when the active tsconfig's `include`
   * covers imported files. Consumer apps under `apps/<name>` usually have a narrow `include`,
   * which breaks loading `codemation.config.ts` when it pulls in decorator-using workspace packages.
   * If the monorepo ships `tsconfig.codemation-tsx.json`, use it automatically.
   */
  private applyWorkspaceTsconfigForTsxIfPresent(consumerRoot: string): void {
    if (process.env.CODEMATION_TSCONFIG_PATH && process.env.CODEMATION_TSCONFIG_PATH.trim().length > 0) {
      return;
    }
    const resolvedRoot = path.resolve(consumerRoot);
    const candidates = [
      path.resolve(resolvedRoot, "tsconfig.codemation-tsx.json"),
      path.resolve(resolvedRoot, "..", "tsconfig.codemation-tsx.json"),
      path.resolve(resolvedRoot, "..", "..", "tsconfig.codemation-tsx.json"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        process.env.CODEMATION_TSCONFIG_PATH = candidate;
        return;
      }
    }
  }

  private resolveDatabaseUrl(configUrl: string | undefined): string | undefined {
    const fromEnv = process.env.DATABASE_URL;
    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv.trim();
    }
    if (configUrl && configUrl.trim().length > 0) {
      return configUrl.trim();
    }
    return undefined;
  }
}
