import { AppConfigLoader, CodemationConsumerConfigLoader, CodemationPluginDiscovery } from "@codemation/host/server";
import { AppContainerFactory } from "@codemation/host";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";

import { ConsumerBuildOptionsParser } from "./build/ConsumerBuildOptionsParser";
import { ConsumerBuildArtifactsPublisher } from "./build/ConsumerBuildArtifactsPublisher";
import { BuildCommand } from "./commands/BuildCommand";
import { DbMigrateCommand } from "./commands/DbMigrateCommand";
import { DevCommand } from "./commands/DevCommand";
import { DevPluginCommand } from "./commands/DevPluginCommand";
import { ServeWebCommand } from "./commands/ServeWebCommand";
import { ServeWorkerCommand } from "./commands/ServeWorkerCommand";
import { SkillsSyncCommand } from "./commands/SkillsSyncCommand";
import { UserCreateCommand } from "./commands/UserCreateCommand";
import { UserListCommand } from "./commands/UserListCommand";
import { ConsumerCliTsconfigPreparation } from "./consumer/ConsumerCliTsconfigPreparation";
import { ConsumerEnvLoader } from "./consumer/ConsumerEnvLoader";
import { ConsumerOutputBuilderFactory } from "./consumer/ConsumerOutputBuilderFactory";
import { ConsumerDatabaseConnectionResolver } from "./database/ConsumerDatabaseConnectionResolver";
import { DatabaseMigrationsApplyService } from "./database/DatabaseMigrationsApplyService";
import { HostPackageRootResolver } from "./database/HostPackageRootResolver";
import { PrismaMigrationDeployer } from "@codemation/host/persistence";
import { DevBootstrapSummaryFetcher } from "./dev/DevBootstrapSummaryFetcher";
import { DevCliBannerRenderer } from "./dev/DevCliBannerRenderer";
import { DevNextChildProcessOutputFilter } from "./dev/DevNextChildProcessOutputFilter";
import { DevNextStartupBannerLineFilter } from "./dev/DevNextStartupBannerLineFilter";
import { CliDevProxyServerFactory } from "./dev/CliDevProxyServerFactory";
import { DevApiRuntimeFactory } from "./dev/DevApiRuntimeFactory";
import { DevRebuildQueueFactory } from "./dev/DevRebuildQueueFactory";
import { DevSessionServicesBuilder } from "./dev/Builder";
import { PluginDevConfigFactory } from "./dev/PluginDevConfigFactory";
import { DevLockFactory } from "./dev/Factory";
import { ConsumerEnvDotenvFilePredicate } from "./dev/ConsumerEnvDotenvFilePredicate";
import { DevTrackedProcessTreeKiller } from "./dev/DevTrackedProcessTreeKiller";
import { DevSourceWatcherFactory } from "./dev/Runner";
import { WorkspacePluginDevProcessCoordinator } from "./dev/WorkspacePluginDevProcessCoordinator";
import { WorkspacePluginPackageResolver } from "./dev/WorkspacePluginPackageResolver";
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
import { AgentSkillsExtractorFactory } from "./skills/AgentSkillsExtractorFactory";
import { ConsumerAgentSkillsSyncService } from "./skills/ConsumerAgentSkillsSyncService";

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
    const tsRuntime = new TypeScriptRuntimeConfigurator();
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
    const consumerOutputBuilderFactory = new ConsumerOutputBuilderFactory();
    const consumerBuildArtifactsPublisher = new ConsumerBuildArtifactsPublisher();
    const devTrackedProcessTreeKiller = new DevTrackedProcessTreeKiller();
    const consumerAgentSkillsSyncService = new ConsumerAgentSkillsSyncService(new AgentSkillsExtractorFactory());
    const devCommand = new DevCommand(
      pathResolver,
      consumerAgentSkillsSyncService,
      tsRuntime,
      new DevLockFactory(),
      new DevSourceWatcherFactory(),
      cliLogger,
      devSessionServices,
      databaseMigrationsApplyService,
      consumerOutputBuilderFactory,
      pluginDiscovery,
      consumerBuildArtifactsPublisher,
      new DevBootstrapSummaryFetcher(),
      new DevCliBannerRenderer(),
      new ConsumerEnvDotenvFilePredicate(),
      devTrackedProcessTreeKiller,
      new WorkspacePluginPackageResolver(),
      new WorkspacePluginDevProcessCoordinator(devTrackedProcessTreeKiller),
      nextHostConsumerServerCommandFactory,
      new DevApiRuntimeFactory(devSessionServices.loopbackPortAllocator, appConfigLoader, pluginDiscovery),
      new CliDevProxyServerFactory(),
      new DevRebuildQueueFactory(),
      new DevNextChildProcessOutputFilter(new DevNextStartupBannerLineFilter()),
    );
    return new CliProgram(
      buildOptionsParser,
      new BuildCommand(
        cliLogger,
        pathResolver,
        consumerAgentSkillsSyncService,
        consumerOutputBuilderFactory,
        pluginDiscovery,
        consumerBuildArtifactsPublisher,
        tsRuntime,
      ),
      devCommand,
      new DevPluginCommand(pathResolver, consumerAgentSkillsSyncService, new PluginDevConfigFactory(), devCommand),
      new ServeWebCommand(
        pathResolver,
        consumerAgentSkillsSyncService,
        new CodemationConsumerConfigLoader(),
        tsRuntime,
        sourceMapNodeOptions,
        new ConsumerEnvLoader(),
        new ListenPortResolver(),
        nextHostConsumerServerCommandFactory,
      ),
      new ServeWorkerCommand(pathResolver, appConfigLoader, new AppContainerFactory()),
      new SkillsSyncCommand(consumerAgentSkillsSyncService),
      new DbMigrateCommand(databaseMigrationsApplyService),
      new UserCreateCommand(new LocalUserCreator(userAdminBootstrap), userAdminCliOptionsParser),
      new UserListCommand(cliLogger, userAdminBootstrap, new CliDatabaseUrlDescriptor(), userAdminCliOptionsParser),
    );
  }
}
