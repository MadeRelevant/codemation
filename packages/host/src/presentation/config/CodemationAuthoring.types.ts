import type { AnyCredentialType, DefinedCollection, DefinedNode } from "@codemation/core";
import type { CodemationAppContext } from "./CodemationAppContext";
import type {
  CodemationAppDefinition,
  CodemationAppSchedulerConfig,
  CodemationConfig,
  CodemationDatabaseConfig,
} from "./CodemationConfig";
import type { CodemationPlugin, CodemationPluginContext } from "./CodemationPlugin";
import type { CodemationWhitelabelConfig } from "./CodemationWhitelabelConfig";

export interface FriendlyCodemationDatabaseConfig {
  readonly kind: "postgresql" | "sqlite";
  readonly url?: string;
  /** Name of an environment variable whose value is the PostgreSQL connection URL. Co-exclusive with `url`. */
  readonly urlEnv?: string;
  readonly filePath?: string;
}

export interface FriendlyCodemationExecutionConfig {
  readonly mode?: "inline" | "queue";
  /** Name of an environment variable whose value is "inline" or "queue". Co-exclusive with `mode`. */
  readonly modeEnv?: string;
  readonly queuePrefix?: string;
  readonly workerQueues?: ReadonlyArray<string>;
  readonly redisUrl?: string;
  /** Name of an environment variable whose value is the Redis connection URL. Co-exclusive with `redisUrl`. */
  readonly redisUrlEnv?: string;
}

export interface DefineCodemationAppOptions extends Omit<
  CodemationConfig,
  "app" | "credentialTypes" | "register" | "whitelabel" | "auth" | "collections"
> {
  readonly name?: string;
  readonly auth?: CodemationConfig["auth"];
  readonly database?: FriendlyCodemationDatabaseConfig;
  readonly execution?: FriendlyCodemationExecutionConfig;
  readonly nodes?: ReadonlyArray<DefinedNode<string, Record<string, unknown>, unknown, unknown>>;
  readonly collections?: ReadonlyArray<DefinedCollection>;
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  readonly credentials?: ReadonlyArray<AnyCredentialType>;
  readonly register?: (context: CodemationAppContext) => void;
  readonly whitelabel?: CodemationWhitelabelConfig;
  /**
   * Path (relative to the consumer project root) to a directory from which workflows are auto-discovered.
   * All `*.ts` / `*.tsx` files (excluding `*.test.*` and `*.d.ts`) are imported and any exported
   * `WorkflowDefinition` values are registered. Co-exclusive with providing this directory in
   * `workflowDiscovery.directories`.
   */
  readonly workflowsDir?: string;
}

export interface DefinePluginOptions {
  readonly name?: string;
  readonly pluginPackageId?: string;
  readonly nodes?: ReadonlyArray<DefinedNode<string, Record<string, unknown>, unknown, unknown>>;
  readonly collections?: ReadonlyArray<DefinedCollection>;
  readonly credentials?: ReadonlyArray<AnyCredentialType>;
  readonly register?: (context: CodemationPluginContext) => void | Promise<void>;
  readonly sandbox?: CodemationConfig;
}

class CodemationAuthoringConfigFactory {
  static createApp(options: DefineCodemationAppOptions): CodemationConfig {
    const appDefinition = this.createAppDefinition(options);
    const credentialTypes = [...(options.credentialTypes ?? []), ...(options.credentials ?? [])];
    const register = this.composeAppRegister(options.register, options.nodes, options.collections);
    const { workflows, plugins, runtime, log, mcpServers } = options;
    const workflowDiscovery = this.mergeWorkflowDiscovery(options.workflowDiscovery, options.workflowsDir);
    return {
      workflows,
      workflowDiscovery,
      plugins,
      runtime,
      log,
      mcpServers,
      app: appDefinition,
      credentialTypes,
      register,
    };
  }

  static createPlugin(options: DefinePluginOptions): CodemationPlugin & Readonly<{ sandbox?: CodemationConfig }> {
    return {
      pluginPackageId: options.pluginPackageId,
      sandbox: options.sandbox,
      async register(context: CodemationPluginContext): Promise<void> {
        for (const nodeDefinition of options.nodes ?? []) {
          nodeDefinition.register(context);
        }
        for (const collection of options.collections ?? []) {
          collection.register(context);
        }
        for (const credential of options.credentials ?? []) {
          context.registerCredentialType(credential);
        }
        await options.register?.(context);
      },
    };
  }

  private static createAppDefinition(options: DefineCodemationAppOptions): CodemationAppDefinition | undefined {
    const scheduler = this.createSchedulerConfig(options.execution);
    const database = this.createDatabaseConfig(options.database);
    const whitelabel = this.createWhitelabel(options.name, options.whitelabel);
    if (!options.auth && !database && !scheduler && !whitelabel) {
      return undefined;
    }
    return {
      auth: options.auth,
      database,
      scheduler,
      whitelabel,
    };
  }

  private static createDatabaseConfig(
    database: FriendlyCodemationDatabaseConfig | undefined,
  ): CodemationDatabaseConfig | undefined {
    if (!database) {
      return undefined;
    }
    if (database.kind === "sqlite") {
      return {
        kind: "sqlite",
        sqliteFilePath: database.filePath,
      };
    }
    if (database.url !== undefined && database.urlEnv !== undefined) {
      throw new Error(
        "defineCodemationApp: database.url and database.urlEnv are mutually exclusive — provide one or the other.",
      );
    }
    const url = database.urlEnv !== undefined ? process.env[database.urlEnv] : database.url;
    return {
      kind: "postgresql",
      url,
    };
  }

  private static createSchedulerConfig(
    execution: FriendlyCodemationExecutionConfig | undefined,
  ): CodemationAppSchedulerConfig | undefined {
    if (!execution) {
      return undefined;
    }
    if (execution.mode !== undefined && execution.modeEnv !== undefined) {
      throw new Error(
        "defineCodemationApp: execution.mode and execution.modeEnv are mutually exclusive — provide one or the other.",
      );
    }
    if (execution.redisUrl !== undefined && execution.redisUrlEnv !== undefined) {
      throw new Error(
        "defineCodemationApp: execution.redisUrl and execution.redisUrlEnv are mutually exclusive — provide one or the other.",
      );
    }
    const rawMode = execution.modeEnv !== undefined ? process.env[execution.modeEnv] : execution.mode;
    const mode = rawMode === "inline" || rawMode === "queue" ? rawMode : undefined;
    const redisUrl = execution.redisUrlEnv !== undefined ? process.env[execution.redisUrlEnv] : execution.redisUrl;
    return {
      kind: mode,
      queuePrefix: execution.queuePrefix,
      workerQueues: execution.workerQueues,
      redisUrl,
    };
  }

  private static mergeWorkflowDiscovery(
    existing: CodemationConfig["workflowDiscovery"],
    workflowsDir: string | undefined,
  ): CodemationConfig["workflowDiscovery"] {
    if (!workflowsDir) {
      return existing;
    }
    const existingDirectories = existing?.directories ?? [];
    return {
      directories: [...existingDirectories, workflowsDir],
    };
  }

  private static createWhitelabel(
    name: string | undefined,
    whitelabel: CodemationWhitelabelConfig | undefined,
  ): CodemationWhitelabelConfig | undefined {
    if (!name && !whitelabel) {
      return undefined;
    }
    return {
      productName: name ?? whitelabel?.productName,
      logoPath: whitelabel?.logoPath,
    };
  }

  private static composeAppRegister(
    register: ((context: CodemationAppContext) => void) | undefined,
    nodes: ReadonlyArray<DefinedNode<string, Record<string, unknown>, unknown, unknown>> | undefined,
    collections: ReadonlyArray<DefinedCollection> | undefined,
  ): ((context: CodemationAppContext) => void) | undefined {
    if (!register && (!nodes || nodes.length === 0) && (!collections || collections.length === 0)) {
      return undefined;
    }
    return (context: CodemationAppContext) => {
      for (const nodeDefinition of nodes ?? []) {
        nodeDefinition.register(context);
      }
      for (const collection of collections ?? []) {
        collection.register(context);
      }
      register?.(context);
    };
  }
}

export function defineCodemationApp(options: DefineCodemationAppOptions): CodemationConfig {
  return CodemationAuthoringConfigFactory.createApp(options);
}

export function definePlugin(
  options: DefinePluginOptions,
): CodemationPlugin & Readonly<{ sandbox?: CodemationConfig }> {
  return CodemationAuthoringConfigFactory.createPlugin(options);
}
