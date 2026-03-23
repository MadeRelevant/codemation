import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { CodemationPostgresPrismaClientFactory,type PrismaClient } from "@codemation/host/persistence";
import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

export type CodemationLocalUserCreateOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
  email: string;
  password: string;
}>;

export class CodemationLocalUserCreator {
  private readonly log = new ServerLoggerFactory(logLevelPolicyFactory).create("codemation-cli.user");

  constructor(private readonly configLoader: CodemationConsumerConfigLoader = new CodemationConsumerConfigLoader()) {}

  async run(options: CodemationLocalUserCreateOptions): Promise<void> {
    const consumerRoot = options.consumerRoot ?? process.cwd();
    this.loadConsumerDotenv(consumerRoot);
    this.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options.configPath,
    });
    if (resolution.config.auth?.kind !== "local") {
      throw new Error('The command `codemation user create` is only valid when CodemationConfig.auth.kind is "local".');
    }
    const email = options.email;
    const password = options.password;
    const databaseUrl = this.resolveDatabaseUrl(resolution.config.runtime?.database?.url);
    if (!databaseUrl) {
      throw new Error("DATABASE_URL must be set (or configured on CodemationConfig.runtime.database.url) to create a user.");
    }
    process.env.DATABASE_URL = databaseUrl;
    const prisma: PrismaClient = CodemationPostgresPrismaClientFactory.create(databaseUrl);
    try {
      const passwordHash = await hash(password, 12);
      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          name: email.split("@")[0] ?? email,
          accountStatus: "active",
        },
        update: {
          passwordHash,
          accountStatus: "active",
        },
      });
    } finally {
      await prisma.$disconnect().catch(() => null);
    }
    this.log.info(`Created or updated local user: ${email}`);
  }

  private loadConsumerDotenv(consumerRoot: string): void {
    loadDotenv({
      path: path.resolve(consumerRoot, ".env"),
    });
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
