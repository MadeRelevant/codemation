// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import { PrismaTriggerSetupStateRepository } from "../../src/infrastructure/persistence/PrismaTriggerSetupStateRepository";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

class TriggerSetupStateRepositoryIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();

  async start(): Promise<void> {
    await this.session.start();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  createStore(): PrismaTriggerSetupStateRepository {
    return new PrismaTriggerSetupStateRepository(this.requirePrismaClient());
  }

  private requirePrismaClient(): PrismaClient {
    if (!this.session.transaction) {
      throw new Error(
        "TriggerSetupStateRepositoryIntegrationContext.start() must be called before creating the store.",
      );
    }
    return this.session.transaction.getPrismaClient();
  }
}

describe("PrismaTriggerSetupStateRepository", () => {
  const context = new TriggerSetupStateRepositoryIntegrationContext();

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
