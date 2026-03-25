import { CodemationConsumerConfigLoader, CodemationPluginDiscovery } from "@codemation/host/server";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";

import { ConsumerBuildArtifactsPublisher } from "./build/ConsumerBuildArtifactsPublisher";
import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { BuildCommand } from "./commands/BuildCommand";
import { DevCommand } from "./commands/DevCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { UserListCommand } from "./commands/UserListCommand";
import { ConsumerEnvLoader } from "./consumer/ConsumerEnvLoader";
import { ConsumerOutputBuilderLoader } from "./consumer/Loader";
import { DevSessionServicesBuilder } from "./dev/Builder";
import { DevLockFactory } from "./dev/Factory";
import { DevSourceWatcherFactory } from "./dev/Runner";
import { CliProgram } from "./Program";
import { CliPathResolver } from "./path/CliPathResolver";
import { ListenPortResolver } from "./runtime/ListenPortResolver";
import { SourceMapNodeOptions } from "./runtime/SourceMapNodeOptions";
import { TypeScriptRuntimeConfigurator } from "./runtime/TypeScriptRuntimeConfigurator";
import { LocalUserCreator } from "./user/LocalUserCreator";
import { CliDatabaseUrlDescriptor } from "./user/CliDatabaseUrlDescriptor";
import { UserAdminCliBootstrap } from "./user/UserAdminCliBootstrap";
import { UserAdminCliOptionsParser } from "./user/UserAdminCliOptionsParser";
import { UserAdminConsumerDotenvLoader } from "./user/UserAdminConsumerDotenvLoader";

const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);

/**
 * Single composition root for the CLI: constructs the object graph and returns {@link CliProgram}.
 * No tsyringe; keeps the package thin while commands remain constructor-injected.
 */
export class CliProgramFactory {
  create(): CliProgram {
    const cliLogger = loggerFactory.create("codemation-cli");
    const pathResolver = new CliPathResolver();
    const pluginDiscovery = new CodemationPluginDiscovery();
    const artifactsPublisher = new ConsumerBuildArtifactsPublisher();
    const tsRuntime = new TypeScriptRuntimeConfigurator();
    const outputBuilderLoader = new ConsumerOutputBuilderLoader();
    const sourceMapNodeOptions = new SourceMapNodeOptions();
    const userAdminBootstrap = new UserAdminCliBootstrap(
      new CodemationConsumerConfigLoader(),
      pathResolver,
      new UserAdminConsumerDotenvLoader(),
    );
    const userAdminCliOptionsParser = new UserAdminCliOptionsParser();

    return new CliProgram(
      new ConsumerBuildOptionsParser(),
      new BuildCommand(cliLogger, pathResolver, pluginDiscovery, artifactsPublisher, tsRuntime, outputBuilderLoader),
      new DevCommand(
        pathResolver,
        pluginDiscovery,
        tsRuntime,
        new DevLockFactory(),
        new DevSourceWatcherFactory(),
        cliLogger,
        new DevSessionServicesBuilder(loggerFactory).build(),
      ),
      new ServeWebCommand(
        pathResolver,
        pluginDiscovery,
        artifactsPublisher,
        tsRuntime,
        sourceMapNodeOptions,
        outputBuilderLoader,
        new ConsumerEnvLoader(),
        new ListenPortResolver(),
      ),
      new ServeWorkerCommand(sourceMapNodeOptions),
      new UserCreateCommand(new LocalUserCreator(userAdminBootstrap), userAdminCliOptionsParser),
      new UserListCommand(cliLogger, userAdminBootstrap, new CliDatabaseUrlDescriptor(), userAdminCliOptionsParser),
    );
  }
}
