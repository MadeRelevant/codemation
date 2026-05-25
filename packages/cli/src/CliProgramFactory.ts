import { AppConfigLoader, CodemationConsumerConfigLoader, CodemationPluginDiscovery } from "@codemation/host/server";
import {
  AppContainerFactory,
  HeadlessApiRuntime,
  HeadlessHttpServerFactory,
  WorkflowWebsocketServerFactory,
} from "@codemation/host";
import { ExecaProcessRunner } from "@codemation/host/server";
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
import { ConsumerSourceErrorParser } from "./dev/ConsumerSourceErrorParser";
import { DevModeResolver } from "./dev/DevModeResolver";
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
import { ConsumerAgentSkillsAutoSyncPolicy } from "./skills/ConsumerAgentSkillsAutoSyncPolicy";
import { ConsumerAgentSkillsSyncService } from "./skills/ConsumerAgentSkillsSyncService";
import { CollectionsCliBootstrap } from "./collections/CollectionsCliBootstrap";
import { CollectionsCliOptionsParser } from "./collections/CollectionsCliOptionsParser";
import { CollectionsListCommand } from "./commands/CollectionsListCommand";
import { CollectionsShowCommand } from "./commands/CollectionsShowCommand";
import { CollectionsRowsCommand } from "./commands/CollectionsRowsCommand";
import { CollectionsGetCommand } from "./commands/CollectionsGetCommand";
import { CollectionsInsertCommand } from "./commands/CollectionsInsertCommand";
import { CollectionsUpdateCommand } from "./commands/CollectionsUpdateCommand";
import { CollectionsDeleteCommand } from "./commands/CollectionsDeleteCommand";
import { CollectionsSyncCommand } from "./commands/CollectionsSyncCommand";
import { ExampleVerifyCommand } from "./commands/ExampleVerifyCommand";
import { RunCliBootstrap } from "./run/RunCliBootstrap";
import { RunWorkflowCommand } from "./commands/RunWorkflowCommand";
import { RunTestCommand } from "./commands/RunTestCommand";

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
      new ConsumerDatabaseConnectionResolver(),
      new CliDatabaseUrlDescriptor(),
      hostPackageRoot,
      new PrismaMigrationDeployer(),
    );

    const buildOptionsParser = new ConsumerBuildOptionsParser();
    const consumerOutputBuilderFactory = new ConsumerOutputBuilderFactory();
    const consumerBuildArtifactsPublisher = new ConsumerBuildArtifactsPublisher();
    const devTrackedProcessTreeKiller = new DevTrackedProcessTreeKiller();
    const processRunner = new ExecaProcessRunner();
    const consumerAgentSkillsSyncService = new ConsumerAgentSkillsSyncService(
      new AgentSkillsExtractorFactory(),
      new ConsumerAgentSkillsAutoSyncPolicy(),
    );
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
      new DevModeResolver(),
      new DevCliBannerRenderer(),
      new ConsumerEnvDotenvFilePredicate(),
      devTrackedProcessTreeKiller,
      new WorkspacePluginPackageResolver(),
      new WorkspacePluginDevProcessCoordinator(devTrackedProcessTreeKiller, processRunner),
      nextHostConsumerServerCommandFactory,
      new DevApiRuntimeFactory(devSessionServices.loopbackPortAllocator, appConfigLoader, pluginDiscovery),
      new CliDevProxyServerFactory(),
      new DevRebuildQueueFactory(),
      new DevNextChildProcessOutputFilter(new DevNextStartupBannerLineFilter()),
      new ConsumerSourceErrorParser(),
      processRunner,
      new CodemationConsumerConfigLoader(),
    );
    const collectionsBootstrap = new CollectionsCliBootstrap(
      appConfigLoader,
      pathResolver,
      new UserAdminConsumerDotenvLoader(),
      tsconfigPreparation,
    );
    const collectionsOptionsParser = new CollectionsCliOptionsParser();
    const runBootstrap = new RunCliBootstrap(
      appConfigLoader,
      pathResolver,
      new UserAdminConsumerDotenvLoader(),
      tsconfigPreparation,
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
        processRunner,
        appConfigLoader,
        new HeadlessApiRuntime(
          new AppContainerFactory(),
          new WorkflowWebsocketServerFactory(),
          new HeadlessHttpServerFactory(),
          loggerFactory.create("codemation.headless"),
        ),
      ),
      new ServeWorkerCommand(pathResolver, appConfigLoader, new AppContainerFactory()),
      new SkillsSyncCommand(consumerAgentSkillsSyncService),
      new DbMigrateCommand(databaseMigrationsApplyService),
      new UserCreateCommand(new LocalUserCreator(userAdminBootstrap), userAdminCliOptionsParser),
      new UserListCommand(cliLogger, userAdminBootstrap, new CliDatabaseUrlDescriptor(), userAdminCliOptionsParser),
      new CollectionsListCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsShowCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsRowsCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsGetCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsInsertCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsUpdateCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsDeleteCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new CollectionsSyncCommand(cliLogger, collectionsBootstrap, collectionsOptionsParser),
      new ExampleVerifyCommand(),
      new RunWorkflowCommand(cliLogger, runBootstrap),
      new RunTestCommand(cliLogger),
    );
  }
}
