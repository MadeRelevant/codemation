import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";
import type { AppPluginLoadSummary } from "../../presentation/config/AppConfig";
import type { CodemationEventBusKind, CodemationSchedulerKind } from "../../presentation/config/CodemationConfig";

/** Resolved persistence + scheduler wiring captured at host prepare time (dev banner / diagnostics). */
export type BootRuntimeSummary = Readonly<{
  databasePersistence: AppPersistenceConfig;
  eventBusKind: CodemationEventBusKind;
  queuePrefix: string;
  schedulerKind: CodemationSchedulerKind;
  redisUrl?: string;
  plugins: ReadonlyArray<AppPluginLoadSummary>;
}>;
