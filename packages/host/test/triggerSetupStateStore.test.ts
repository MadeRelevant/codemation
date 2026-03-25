import { describe, expect, it } from "vitest";
import { InMemoryTriggerSetupStateStore } from "../src/infrastructure/persistence/InMemoryTriggerSetupStateStore";

class TriggerSetupStateStoreFixture {
  static readonly trigger = {
    workflowId: "wf.gmail",
    nodeId: "trigger",
  } as const;
}

describe("InMemoryTriggerSetupStateStore", () => {
  it("round-trips setup state for a trigger instance", async () => {
    const store = new InMemoryTriggerSetupStateStore();

    await store.save({
      trigger: TriggerSetupStateStoreFixture.trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "123",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });

    await expect(store.load(TriggerSetupStateStoreFixture.trigger)).resolves.toEqual({
      trigger: TriggerSetupStateStoreFixture.trigger,
      updatedAt: "2026-03-17T12:00:00.000Z",
      state: {
        historyId: "123",
        watchExpiration: "2026-03-18T12:00:00.000Z",
      },
    });
  });

  it("isolates state by trigger instance and supports deletes", async () => {
    const store = new InMemoryTriggerSetupStateStore();
    const otherTrigger = {
      workflowId: "wf.other",
      nodeId: "trigger",
    } as const;

    await store.save({
      trigger: TriggerSetupStateStoreFixture.trigger,
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

    await store.delete(TriggerSetupStateStoreFixture.trigger);

    await expect(store.load(TriggerSetupStateStoreFixture.trigger)).resolves.toBeUndefined();
    await expect(store.load(otherTrigger)).resolves.toEqual({
      trigger: otherTrigger,
      updatedAt: "2026-03-17T12:05:00.000Z",
      state: {
        historyId: "two",
      },
    });
  });
});
