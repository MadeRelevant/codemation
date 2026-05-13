import { inject, injectable } from "@codemation/core";
import type { McpServerDeclaration } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import type { AppConfig } from "../presentation/config/AppConfig";

export type McpServerDeclarationSource = "plugin" | "config" | "controlPlane";

const SOURCE_PRIORITY: Record<McpServerDeclarationSource, number> = {
  plugin: 0,
  config: 1,
  controlPlane: 2,
};

const ID_PATTERN = /^[a-z0-9-]+$/;

type CatalogEntry = Readonly<{
  decl: McpServerDeclaration;
  source: McpServerDeclarationSource;
}>;

@injectable()
export class McpServerCatalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly bySource = new Map<McpServerDeclarationSource, Set<string>>();
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
    @inject(ApplicationTokens.AppConfig) appConfig: AppConfig,
  ) {
    this.env = appConfig.env;
  }

  merge(source: McpServerDeclarationSource, declarations: ReadonlyArray<McpServerDeclaration>): void {
    const logger = this.loggers.create("McpServerCatalog");
    for (const decl of declarations) {
      if (!this.validate(decl, source, logger)) {
        continue;
      }
      const existing = this.entries.get(decl.id);
      if (existing) {
        if (SOURCE_PRIORITY[source] <= SOURCE_PRIORITY[existing.source]) {
          logger.warn(
            `McpServerCatalog: id collision — lower-priority source "${source}" ignored for id "${decl.id}" (current source: "${existing.source}")`,
          );
          continue;
        }
        logger.warn(
          `McpServerCatalog: id "${decl.id}" shadowed — "${existing.source}" overridden by higher-priority source "${source}"`,
        );
        this.bySource.get(existing.source)?.delete(decl.id);
      }
      this.entries.set(decl.id, { decl, source });
      if (!this.bySource.has(source)) {
        this.bySource.set(source, new Set());
      }
      this.bySource.get(source)!.add(decl.id);
    }
  }

  get(id: string): McpServerDeclaration | undefined {
    return this.entries.get(id)?.decl;
  }

  getAll(): readonly McpServerDeclaration[] {
    return [...this.entries.values()].map((entry) => entry.decl);
  }

  clear(source: McpServerDeclarationSource): void {
    const ids = this.bySource.get(source);
    if (!ids) {
      return;
    }
    for (const id of ids) {
      this.entries.delete(id);
    }
    this.bySource.delete(source);
  }

  private validate(
    decl: McpServerDeclaration,
    source: McpServerDeclarationSource,
    logger: ReturnType<LoggerFactory["create"]>,
  ): boolean {
    if (!ID_PATTERN.test(decl.id)) {
      logger.warn(
        `McpServerCatalog: declaration from "${source}" has invalid id "${decl.id}" (must match /^[a-z0-9-]+$/) — skipped`,
      );
      return false;
    }

    if ((decl.transport as string) === "stdio") {
      if (this.env.CODEMATION_ALLOW_STDIO_MCP !== "true") {
        logger.warn(
          `McpServerCatalog: declaration "${decl.id}" from "${source}" uses stdio transport which is disabled (set CODEMATION_ALLOW_STDIO_MCP=true to allow) — skipped`,
        );
        return false;
      }
    }

    if (decl.credentialKind === "oauth2-via-broker" && !decl.oauthAppKey) {
      logger.warn(
        `McpServerCatalog: declaration "${decl.id}" from "${source}" has credentialKind "oauth2-via-broker" but no oauthAppKey — skipped`,
      );
      return false;
    }

    if (decl.credentialKind !== "none" && decl.credentialKind !== "oauth2-via-broker" && !decl.credentialTypeId) {
      logger.warn(
        `McpServerCatalog: declaration "${decl.id}" from "${source}" has credentialKind "${decl.credentialKind}" but no credentialTypeId — skipped`,
      );
      return false;
    }

    return true;
  }
}
