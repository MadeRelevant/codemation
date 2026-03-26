import type { IntegrationDatabase } from "./IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "./IntegrationDatabaseFactory";
import type { PostgresRollbackTransaction } from "./PostgresRollbackTransaction";

/**
 * Shared integration pattern: one {@link IntegrationDatabaseFactory.create} per suite, Prisma interactive
 * transaction + rollback between tests (re-seed txn client via {@link afterEach}).
 */
export class IntegrationTestDatabaseSession {
  database: IntegrationDatabase | null = null;
  transaction: PostgresRollbackTransaction | null = null;

  async start(): Promise<void> {
    this.database = await IntegrationDatabaseFactory.create();
    this.transaction = await this.database.beginRollbackTransaction();
  }

  async afterEach(): Promise<void> {
    if (this.transaction && this.database) {
      await this.transaction.rollback();
      this.transaction = await this.database.beginRollbackTransaction();
    }
  }

  async dispose(): Promise<void> {
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
    if (this.database) {
      await this.database.close();
      this.database = null;
    }
  }
}
