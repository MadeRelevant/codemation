import { describe, expect, it } from "vitest";
import { InMemoryTriggerSetupStateRepository } from "../../src/infrastructure/persistence/InMemoryTriggerSetupStateRepository";

class TriggerSetupStateRepositoryFixture {
  static readonly trigger = {
    workflowId: "wf.gmail",
    nodeId: "trigger",
  } as const;
}

describe("InMemoryTriggerSetupStateRepository", () => {
  it("round-trips setup state for a trigger instance", async () => {
    const store = new InMemoryTriggerSetupStateRepository();

    await store.save({
      trigger: TriggerSetupStateRepositoryFixture.trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "123",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });

    await expect(store.load(TriggerSetupStateRepositoryFixture.trigger)).resolves.toEqual({
      trigger: TriggerSetupStateRepositoryFixture.trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "123",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });
  });

  it("isolates state by trigger instance and supports deletes", async () => {
    const store = new InMemoryTriggerSetupStateRepository();
    const otherTrigger = {
      workflowId: "wf.other",
      nodeId: "trigger",
    } as const;

    await store.save({
      trigger: TriggerSetupStateRepositoryFixture.trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "one",
      },
    });
    await store.save({
      trigger: otherTrigger,
      updatedAt: "2026-03-17T12:05:00.000Z",
      state: {
        historyId: "two",
      },
    });

    await store.delete(TriggerSetupStateRepositoryFixture.trigger);

    await expect(store.load(TriggerSetupStateRepositoryFixture.trigger)).resolves.toBeUndefined();
    await expect(store.load(otherTrigger)).resolves.toEqual({
      trigger: otherTrigger,
      updatedAt: "2026-03-17T12:05:00.000Z",
      state: {
        historyId: "two",
      },
    });
  });
});
