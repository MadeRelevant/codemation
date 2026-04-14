import type { Item, NodeExecutionContext } from "@codemation/core";
import assert from "node:assert/strict";
import { test } from "vitest";
import { MapDataNode } from "../src/nodes/MapDataNode";
import { MapData } from "../src/nodes/mapData";
import { runPerItemLikeEngine } from "./engineTestHelpers";

class MapDataTestFactory {
  static createInputItem(): Item<Readonly<{ message: string }>> {
    return {
      json: { message: "ab" },
      binary: {
        attachment: {
          id: "att-1",
          storageKey: "storage/att-1",
          mimeType: "text/plain",
          size: 2,
          storageDriver: "memory",
          previewKind: "download",
          createdAt: new Date().toISOString(),
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-1",
          activationId: "activation-1",
          filename: "payload.txt",
        },
      } as never,
    };
  }

  static createContext<TConfig extends { name: string }>(config: TConfig): NodeExecutionContext<TConfig> {
    return {
      config,
      nodeId: "map-node",
      activationId: "activation-1",
      runId: "run-1",
      workflowId: "wf-1",
      subworkflowDepth: 0,
      engineMaxNodeActivations: 10_000,
      engineMaxSubworkflowDepth: 32,
      now: () => new Date(),
      data: {} as never,
      binary: {} as never,
      getCredential: async () => undefined,
    } as NodeExecutionContext<TConfig>;
  }
}

test("MapData keeps binaries by default", async () => {
  const config = new MapData("Keep binary", (item: Item<Readonly<{ message: string }>>) => ({
    message: item.json.message.toUpperCase(),
  }));
  const inputItem = MapDataTestFactory.createInputItem();

  const outputs = await runPerItemLikeEngine(
    new MapDataNode(),
    [inputItem],
    MapDataTestFactory.createContext(config),
    config.keepBinaries,
  );

  assert.deepEqual(outputs.main?.map((item) => item.json), [{ message: "AB" }]);
  assert.deepEqual(outputs.main?.[0]?.binary, inputItem.binary);
});

test("MapData drops binaries when keepBinaries is disabled", async () => {
  const config = new MapData(
    "Drop binary",
    (item: Item<Readonly<{ message: string }>>) => ({
      message: item.json.message.toUpperCase(),
    }),
    { keepBinaries: false },
  );
  const inputItem = MapDataTestFactory.createInputItem();

  const outputs = await runPerItemLikeEngine(
    new MapDataNode(),
    [inputItem],
    MapDataTestFactory.createContext(config),
    config.keepBinaries,
  );

  assert.deepEqual(outputs.main?.map((item) => item.json), [{ message: "AB" }]);
  assert.equal(outputs.main?.[0]?.binary, undefined);
});

test("MapData can explicitly clear binaries even when keepBinaries is enabled", async () => {
  const config = new MapData(
    "Clear binary",
    () =>
      ({
        json: { message: "AB" },
        binary: {},
      }) as never,
    { keepBinaries: true },
  );
  const inputItem = MapDataTestFactory.createInputItem();

  const outputs = await runPerItemLikeEngine(
    new MapDataNode(),
    [inputItem],
    MapDataTestFactory.createContext(config),
    config.keepBinaries,
  );

  assert.deepEqual(outputs.main?.map((item) => item.json), [{ message: "AB" }]);
  assert.deepEqual(outputs.main?.[0]?.binary, {});
});
