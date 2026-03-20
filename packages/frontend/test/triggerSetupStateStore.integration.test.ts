// @vitest-environment node

import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { PrismaClient } from "../src/infrastructure/persistence/generated/prisma-client/client.js";
import { PrismaTriggerSetupStateStore } from "../src/infrastructure/persistence/PrismaTriggerSetupStateStore";
import { PostgresIntegrationDatabase } from "./http/testkit/PostgresIntegrationDatabase";
import { PostgresRollbackTransaction } from "./http/testkit/PostgresRollbackTransaction";

class TriggerSetupStateStoreIntegrationContext {
  database: PostgresIntegrationDatabase | null = null;
  transaction: PostgresRollbackTransaction | null = null;

  async start(): Promise<void> {
    this.database = await PostgresIntegrationDatabase.create();
    this.transaction = await this.database.beginRollbackTransaction();
  }

  async stop(): Promise<void> {
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
    if (this.database) {
      await this.database.close();
      this.database = null;
    }
  }

  createStore(): PrismaTriggerSetupStateStore {
    return new PrismaTriggerSetupStateStore(this.requirePrismaClient());
  }

  private requirePrismaClient(): PrismaClient {
    if (!this.transaction) {
      throw new Error("TriggerSetupStateStoreIntegrationContext.start() must be called before creating the store.");
    }
    return this.transaction.getPrismaClient();
  }
}

describe("PrismaTriggerSetupStateStore", () => {
  const context = new TriggerSetupStateStoreIntegrationContext();

  beforeAll(async () => {
    await context.start();
  });

  afterAll(async () => {
    await context.stop();
  });

  it("persists and loads setup state by trigger id", async () => {
    const store = context.createStore();
    const trigger = {
      workflowId: "wf.gmail",
      nodeId: "trigger",
    } as const;

    await store.save({
      trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "cursor_1",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });

    await expect(store.load(trigger)).resolves.toEqual({
      trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "cursor_1",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });
  });

  it("keeps different triggers isolated", async () => {
    const store = context.createStore();
    const leftTrigger = {
      workflowId: "wf.gmail.left",
      nodeId: "trigger",
    } as const;
    const rightTrigger = {
      workflowId: "wf.gmail.right",
      nodeId: "trigger",
    } as const;

    await store.save({
      trigger: leftTrigger,
      updatedAt: "2026-03-17T12:01:00.000Z",
      state: {
        historyId: "left",
      },
    });
    await store.save({
      trigger: rightTrigger,
      updatedAt: "2026-03-17T12:02:00.000Z",
      state: {
        historyId: "right",
      },
    });

    await expect(store.load(leftTrigger)).resolves.toMatchObject({
      trigger: leftTrigger,
      state: {
        historyId: "left",
      },
    });
    await expect(store.load(rightTrigger)).resolves.toMatchObject({
      trigger: rightTrigger,
      state: {
        historyId: "right",
      },
    });
  });
});
