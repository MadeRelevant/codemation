import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";
import type { CodemationSchedulerKind } from "../../presentation/config/CodemationConfig";

/**
 * Ensures scheduler and database selections are compatible (e.g. BullMQ requires shared TCP PostgreSQL).
 */
export class SchedulerPersistenceCompatibilityValidator {
  validate(args: Readonly<{ schedulerKind: CodemationSchedulerKind; persistence: AppPersistenceConfig }>): void {
    if (args.schedulerKind === "bullmq" && args.persistence.kind === "none") {
      throw new Error(
        "BullMQ requires PostgreSQL persistence. Configure runtime.database with a postgresql URL (embedded PGlite is not compatible with BullMQ).",
      );
    }
    if (args.schedulerKind === "bullmq" && args.persistence.kind === "pglite") {
      throw new Error(
        'BullMQ requires a shared PostgreSQL database. PGlite cannot be used with the BullMQ scheduler. Set runtime.database.kind to "postgresql" with a PostgreSQL URL, or use the local scheduler when using PGlite.',
      );
    }
  }
}
