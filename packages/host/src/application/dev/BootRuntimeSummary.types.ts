import type { ResolvedDatabasePersistence } from "../../infrastructure/persistence/DatabasePersistenceResolver";
import type { CodemationEventBusKind, CodemationSchedulerKind } from "../../presentation/config/CodemationConfig";

/** Resolved persistence + scheduler wiring captured at host prepare time (dev banner / diagnostics). */
export type BootRuntimeSummary = Readonly<{
  databasePersistence: ResolvedDatabasePersistence;
  eventBusKind: CodemationEventBusKind;
  queuePrefix: string;
  schedulerKind: CodemationSchedulerKind;
  redisUrl?: string;
}>;
