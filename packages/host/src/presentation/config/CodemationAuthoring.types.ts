import type { AnyCredentialType, DefinedNode, WorkflowDefinition } from "@codemation/core";
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
  readonly filePath?: string;
}

export interface FriendlyCodemationExecutionConfig {
  readonly mode?: "inline" | "queue";
  readonly queuePrefix?: string;
  readonly workerQueues?: ReadonlyArray<string>;
  readonly redisUrl?: string;
}

export interface DefineCodemationAppOptions extends Omit<
  CodemationConfig,
  "app" | "credentialTypes" | "register" | "whitelabel" | "auth"
> {
  readonly name?: string;
  readonly auth?: CodemationConfig["auth"];
  readonly database?: FriendlyCodemationDatabaseConfig;
  readonly execution?: FriendlyCodemationExecutionConfig;
  readonly nodes?: ReadonlyArray<DefinedNode<string, Record<string, unknown>, unknown, unknown>>;
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  readonly credentials?: ReadonlyArray<AnyCredentialType>;
  readonly register?: (context: CodemationAppContext) => void;
  readonly whitelabel?: CodemationWhitelabelConfig;
}

export interface DefinePluginOptions {
  readonly name?: string;
  readonly pluginPackageId?: string;
  readonly nodes?: ReadonlyArray<DefinedNode<string, Record<string, unknown>, unknown, unknown>>;
  readonly credentials?: ReadonlyArray<AnyCredentialType>;
  readonly register?: (context: CodemationPluginContext) => void | Promise<void>;
  readonly sandbox?: DefineCodemationAppOptions & Readonly<{ workflows?: ReadonlyArray<WorkflowDefinition> }>;
}

class CodemationAuthoringConfigFactory {
  static createApp(options: DefineCodemationAppOptions): CodemationConfig {
    const appDefinition = this.createAppDefinition(options);
    const credentialTypes = [...(options.credentialTypes ?? []), ...(options.credentials ?? [])];
    const register = this.composeAppRegister(options.register, options.nodes);
    const { workflows, workflowDiscovery, plugins, runtime, log } = options;
    return {
      workflows,
      workflowDiscovery,
      plugins,
      runtime,
      log,
      app: appDefinition,
      credentialTypes,
      register,
    };
  }

  static createPlugin(
    options: DefinePluginOptions,
  ): CodemationPlugin & Readonly<{ sandbox?: DefinePluginOptions["sandbox"] }> {
    return {
      pluginPackageId: options.pluginPackageId,
      sandbox: options.sandbox,
      async register(context: CodemationPluginContext): Promise<void> {
        for (const nodeDefinition of options.nodes ?? []) {
          nodeDefinition.register(context);
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
    return {
      kind: "postgresql",
      url: database.url,
    };
  }

  private static createSchedulerConfig(
    execution: FriendlyCodemationExecutionConfig | undefined,
  ): CodemationAppSchedulerConfig | undefined {
    if (!execution) {
      return undefined;
    }
    return {
      kind: execution.mode,
      queuePrefix: execution.queuePrefix,
      workerQueues: execution.workerQueues,
      redisUrl: execution.redisUrl,
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
  ): ((context: CodemationAppContext) => void) | undefined {
    if (!register && (!nodes || nodes.length === 0)) {
      return undefined;
    }
    return (context: CodemationAppContext) => {
      for (const nodeDefinition of nodes ?? []) {
        nodeDefinition.register(context);
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
): CodemationPlugin & Readonly<{ sandbox?: DefinePluginOptions["sandbox"] }> {
  return CodemationAuthoringConfigFactory.createPlugin(options);
}
