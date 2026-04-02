import {
  AppConfigLoader,
  CodemationConsumerConfigLoader,
  CodemationFrontendAuthSnapshotFactory,
  CodemationPluginDiscovery,
  FrontendAppConfigJsonCodec,
} from "@codemation/host/server";
import { AppContainerFactory } from "@codemation/host";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";

import { ConsumerBuildArtifactsPublisher } from "./build/ConsumerBuildArtifactsPublisher";
import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { BuildCommand } from "./commands/BuildCommand";
import { DbMigrateCommand } from "./commands/DbMigrateCommand";
import { DevCommand } from "./commands/DevCommand";
import { DevPluginCommand } from "./commands/DevPluginCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { UserListCommand } from "./commands/UserListCommand";
import { ConsumerCliTsconfigPreparation } from "./consumer/ConsumerCliTsconfigPreparation";
import { ConsumerEnvLoader } from "./consumer/ConsumerEnvLoader";
import { ConsumerOutputBuilderLoader } from "./consumer/Loader";
import { ConsumerDatabaseConnectionResolver } from "./database/ConsumerDatabaseConnectionResolver";
import { DatabaseMigrationsApplyService } from "./database/DatabaseMigrationsApplyService";
import { HostPackageRootResolver } from "./database/HostPackageRootResolver";
import { PrismaMigrationDeployer } from "@codemation/host/persistence";
import { DevBootstrapSummaryFetcher } from "./dev/DevBootstrapSummaryFetcher";
import { DevCliBannerRenderer } from "./dev/DevCliBannerRenderer";
import { DevConsumerPublishBootstrap } from "./dev/DevConsumerPublishBootstrap";
import { CliDevProxyServerFactory } from "./dev/CliDevProxyServerFactory";
import { DevApiRuntimeFactory } from "./dev/DevApiRuntimeFactory";
import { DevRebuildQueueFactory } from "./dev/DevRebuildQueueFactory";
import { DevSourceRebuildPlanner } from "./dev/DevSourceRebuildPlanner";
import { DevSessionServicesBuilder } from "./dev/Builder";
import { DevLockFactory } from "./dev/Factory";
import { ConsumerEnvDotenvFilePredicate } from "./dev/ConsumerEnvDotenvFilePredicate";
import { PluginDevConfigFactory } from "./dev/PluginDevConfigFactory";
import { DevTrackedProcessTreeKiller } from "./dev/DevTrackedProcessTreeKiller";
import { DevSourceWatcherFactory } from "./dev/Runner";
import { CliProgram } from "./Program";
import { CliPathResolver } from "./path/CliPathResolver";
import { ListenPortResolver } from "./runtime/ListenPortResolver";
import { NextHostConsumerServerCommandFactory } from "./runtime/NextHostConsumerServerCommandFactory";
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
    const appConfigLoader = new AppConfigLoader();
    const pathResolver = new CliPathResolver();
    const pluginDiscovery = new CodemationPluginDiscovery();
    const artifactsPublisher = new ConsumerBuildArtifactsPublisher();
    const tsRuntime = new TypeScriptRuntimeConfigurator();
    const outputBuilderLoader = new ConsumerOutputBuilderLoader();
    const sourceMapNodeOptions = new SourceMapNodeOptions();
    const nextHostConsumerServerCommandFactory = new NextHostConsumerServerCommandFactory();
    const devSessionServices = new DevSessionServicesBuilder().build();
    const tsconfigPreparation = new ConsumerCliTsconfigPreparation();
    const userAdminBootstrap = new UserAdminCliBootstrap(
      appConfigLoader,
      pathResolver,
      new UserAdminConsumerDotenvLoader(),
      tsconfigPreparation,
    );
    const hostPackageRoot = new HostPackageRootResolver().resolveHostPackageRoot();
    const userAdminCliOptionsParser = new UserAdminCliOptionsParser();
    const databaseMigrationsApplyService = new DatabaseMigrationsApplyService(
      cliLogger,
      new UserAdminConsumerDotenvLoader(),
      tsconfigPreparation,
      new CodemationConsumerConfigLoader(),
      new ConsumerDatabaseConnectionResolver(),
      new CliDatabaseUrlDescriptor(),
      hostPackageRoot,
      new PrismaMigrationDeployer(),
    );

    const buildOptionsParser = new ConsumerBuildOptionsParser();
    const devConsumerPublishBootstrap = new DevConsumerPublishBootstrap(
      cliLogger,
      pluginDiscovery,
      artifactsPublisher,
      outputBuilderLoader,
      buildOptionsParser,
    );
    const consumerEnvDotenvFilePredicate = new ConsumerEnvDotenvFilePredicate();
    const devCommand = new DevCommand(
      pathResolver,
      tsRuntime,
      new DevLockFactory(),
      new DevSourceWatcherFactory(),
      cliLogger,
      devSessionServices,
      databaseMigrationsApplyService,
      new DevBootstrapSummaryFetcher(),
      new DevCliBannerRenderer(),
      devConsumerPublishBootstrap,
      consumerEnvDotenvFilePredicate,
      new DevTrackedProcessTreeKiller(),
      nextHostConsumerServerCommandFactory,
      new DevApiRuntimeFactory(devSessionServices.loopbackPortAllocator, appConfigLoader, pluginDiscovery),
      new CliDevProxyServerFactory(),
      new DevRebuildQueueFactory(),
      new DevSourceRebuildPlanner(consumerEnvDotenvFilePredicate, devSessionServices.sourceChangeClassifier),
    );
    return new CliProgram(
      buildOptionsParser,
      new BuildCommand(cliLogger, pathResolver, pluginDiscovery, artifactsPublisher, tsRuntime, outputBuilderLoader),
      devCommand,
      new DevPluginCommand(new PluginDevConfigFactory(), devCommand),
      new ServeWebCommand(
        pathResolver,
        new CodemationConsumerConfigLoader(),
        pluginDiscovery,
        artifactsPublisher,
        tsRuntime,
        sourceMapNodeOptions,
        outputBuilderLoader,
        new ConsumerEnvLoader(),
        new ListenPortResolver(),
        nextHostConsumerServerCommandFactory,
        new CodemationFrontendAuthSnapshotFactory(),
        new FrontendAppConfigJsonCodec(),
      ),
      new ServeWorkerCommand(pathResolver, appConfigLoader, new AppContainerFactory()),
      new DbMigrateCommand(databaseMigrationsApplyService),
      new UserCreateCommand(new LocalUserCreator(userAdminBootstrap), userAdminCliOptionsParser),
      new UserListCommand(cliLogger, userAdminBootstrap, new CliDatabaseUrlDescriptor(), userAdminCliOptionsParser),
    );
  }
}
