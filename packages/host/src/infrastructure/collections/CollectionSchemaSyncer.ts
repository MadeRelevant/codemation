import type { Logger } from "../../application/logging/Logger";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import type { CollectionAdvisoryLockService } from "./CollectionAdvisoryLockService.types";
import type { CollectionDdlEmitter } from "./CollectionDdlEmitter.types";
import type { CollectionRegistry } from "./CollectionRegistry";
import type { CollectionSchemaIntrospector } from "./CollectionSchemaIntrospector.types";
import type { CollectionSyncResult, DiffOps } from "./collectionSchemaTypes";
import type { CollectionSchemaDiffer } from "./CollectionSchemaDiffer";

/**
 * Orchestrates schema synchronization for declared collections.
 *
 * Algorithm:
 * 1. Acquire advisory lock
 * 2. Create collections schema (Postgres only — SQLite emitter returns null)
 * 3. Introspect live schema
 * 4. Compute diffs for each declared collection
 * 5. Block destructive changes unless CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1
 * 6. Apply DDL if not dryRun
 */
export class CollectionSchemaSyncer {
  constructor(
    private readonly collectionRegistry: CollectionRegistry,
    private readonly introspector: CollectionSchemaIntrospector,
    private readonly differ: CollectionSchemaDiffer,
    private readonly ddlEmitter: CollectionDdlEmitter,
    private readonly lockService: CollectionAdvisoryLockService,
    private readonly prismaClient: PrismaDatabaseClient,
    private readonly logger: Logger,
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  async sync(opts?: { dryRun?: boolean }): Promise<CollectionSyncResult> {
    return this.lockService.withLock("collections-schema-sync", async () => {
      this.logger.info("Starting collections schema sync");

      const schemaSql = this.ddlEmitter.createSchemaSql();
      if (schemaSql) {
        await this.prismaClient.$executeRawUnsafe(schemaSql);
        this.logger.debug("Ensured collections schema exists");
      }

      const live = await this.introspector.introspect();

      const diffs: DiffOps[] = [];
      for (const definition of this.collectionRegistry.list()) {
        const ops = this.differ.diff(definition, live.tables[definition.name]);
        if (this.hasChanges(ops)) {
          diffs.push(ops);
        }
      }

      const destructive = diffs.filter((d) => d.dropColumns.length > 0 || d.dropIndexes.length > 0);
      if (destructive.length > 0 && this.env.CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE !== "1") {
        const details = destructive
          .map(
            (ops) =>
              `  ${ops.collection}: drop columns [${ops.dropColumns.join(", ")}] drop indexes [${ops.dropIndexes.join(", ")}]`,
          )
          .join("\n");
        throw new Error(
          `Collections schema sync would drop data:\n${details}\n\nSet CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1 to proceed.`,
        );
      }

      if (opts?.dryRun) {
        this.logger.info(`[DRY RUN] Would apply ${diffs.length} collection schema change(s)`);
        return { planned: diffs, applied: [] };
      }

      for (const ops of diffs) {
        await this.applyOps(ops);
      }

      this.logger.info(`Applied ${diffs.length} collection schema change(s)`);
      return { planned: diffs, applied: diffs };
    });
  }

  private hasChanges(ops: DiffOps): boolean {
    return (
      ops.createTable !== undefined ||
      ops.addColumns.length > 0 ||
      ops.dropColumns.length > 0 ||
      ops.addIndexes.length > 0 ||
      ops.dropIndexes.length > 0
    );
  }

  private async applyOps(ops: DiffOps): Promise<void> {
    const definition = this.collectionRegistry.resolve(ops.collection);
    if (!definition) {
      throw new Error(`Collection "${ops.collection}" not found in registry`);
    }

    if (ops.createTable) {
      await this.prismaClient.$executeRawUnsafe(this.ddlEmitter.createTableSql(definition, ops.createTable));
    }

    for (const col of ops.addColumns) {
      await this.prismaClient.$executeRawUnsafe(this.ddlEmitter.addColumnSql(definition, col));
    }

    for (const colName of ops.dropColumns) {
      // dropColumnSql may throw for SQLite — that's intentional
      await this.prismaClient.$executeRawUnsafe(this.ddlEmitter.dropColumnSql(definition, colName));
    }

    for (const idx of ops.addIndexes) {
      await this.prismaClient.$executeRawUnsafe(this.ddlEmitter.createIndexSql(definition, idx));
    }

    for (const idxName of ops.dropIndexes) {
      await this.prismaClient.$executeRawUnsafe(this.ddlEmitter.dropIndexSql(definition, idxName));
    }

    this.logger.debug(`Applied schema ops for collection "${ops.collection}"`);
  }
}
