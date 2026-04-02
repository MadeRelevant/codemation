import type { CodemationPlugin } from "./presentation/config/CodemationPlugin";
import type { CodemationPluginDefinitionArgs } from "./presentation/config/CodemationPluginDefinitionFactory";
import { CodemationPluginDefinitionFactory } from "./presentation/config/CodemationPluginDefinitionFactory";

export type { CommandBus } from "./application/bus/CommandBus";
export type { QueryBus } from "./application/bus/QueryBus";
export { ListUserAccountsQuery } from "./application/queries/ListUserAccountsQuery";
export { UpsertLocalBootstrapUserCommand } from "./application/commands/UpsertLocalBootstrapUserCommand";
export type { UpsertLocalBootstrapUserResultDto } from "./application/contracts/userDirectoryContracts.types";
export { AppContainerFactory } from "./bootstrap/AppContainerFactory";
export { AppContainerLifecycle } from "./bootstrap/AppContainerLifecycle";
export { DatabaseMigrations } from "./bootstrap/runtime/DatabaseMigrations";
export { FrontendRuntime } from "./bootstrap/runtime/FrontendRuntime";
export { WorkerRuntime } from "./bootstrap/runtime/WorkerRuntime";
export { AppConfigFactory } from "./bootstrap/runtime/AppConfigFactory";
export { ApplicationTokens } from "./applicationTokens";
export { CodemationBootstrapRequest } from "./bootstrap/CodemationBootstrapRequest";
export type { CodemationWhitelabelConfig } from "./presentation/config/CodemationWhitelabelConfig";
export type { AppConfig } from "./presentation/config/AppConfig";
export type {
  CodemationAuthConfig,
  CodemationAuthKind,
  CodemationAuthOAuthProviderConfig,
  CodemationAuthOidcProviderConfig,
} from "./presentation/config/CodemationAuthConfig";
export type { CodemationClassToken } from "./presentation/config/CodemationClassToken";
export type {
  CodemationAppDefinition,
  CodemationAppSchedulerConfig,
  CodemationAppSchedulerKind,
  CodemationApplicationRuntimeConfig,
  CodemationConfig,
  CodemationDatabaseConfig,
  CodemationDatabaseKind,
  CodemationEngineExecutionLimitsConfig,
  CodemationEventBusConfig,
  CodemationEventBusKind,
  CodemationSchedulerConfig,
  CodemationSchedulerKind,
} from "./presentation/config/CodemationConfig";
export type {
  CodemationAppContext,
  CodemationRegistrationContextBase,
} from "./presentation/config/CodemationAppContext";
export type {
  CodemationFrontendAuthProviderSnapshot,
  CodemationFrontendAuthSnapshot,
} from "./presentation/frontend/CodemationFrontendAuthSnapshot";
export type { FrontendAppConfig } from "./presentation/frontend/FrontendAppConfig";
export type {
  CodemationLogConfig,
  CodemationLogLevelName,
  CodemationLogRule,
} from "./presentation/config/CodemationLogConfig";
export type {
  CodemationPackageManifest,
  CodemationPluginPackageManifest,
} from "./presentation/config/CodemationPackageManifest";
export type { CodemationPlugin, CodemationPluginContext } from "./presentation/config/CodemationPlugin";
export { CodemationPluginDefinitionFactory } from "./presentation/config/CodemationPluginDefinitionFactory";
export type { CodemationPluginDefinitionArgs } from "./presentation/config/CodemationPluginDefinitionFactory";
export { CodemationPluginListMerger } from "./presentation/config/CodemationPluginListMerger";
export { SandboxFactory } from "./presentation/config/SandboxFactory";
export type { SandboxFactoryOptions } from "./presentation/config/SandboxFactory";
export type { CodemationWorkflowDiscovery } from "./presentation/config/CodemationWorkflowDiscovery";
export {
  ApiPaths,
  CodemationFrontendAuthSnapshotFactory,
  CodemationFrontendAuthSnapshotJsonCodec,
  FrontendAppConfigFactory,
  FrontendAppConfigJsonCodec,
  CodemationConsumerConfigLoader,
  CodemationPostgresPrismaClientFactory,
  CodemationServerGateway,
  PrismaClient,
} from "./server";

export function definePlugin(args: CodemationPluginDefinitionArgs): CodemationPlugin {
  return CodemationPluginDefinitionFactory.createPlugin(args);
}
