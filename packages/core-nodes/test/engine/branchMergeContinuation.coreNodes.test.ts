import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { RegistrarEngineTestKitFactory } from "@codemation/core/testing";

import { Callback, MapData, NoOp, Wait, workflow } from "@codemation/core-nodes";

type StressJson = Record<string, unknown>;

const pass = <T extends StressJson>(item: { json: unknown }, patch: T): StressJson => ({
  ...(typeof item.json === "object" && item.json !== null ? (item.json as StressJson) : {}),
  ...patch,
});

test("workflow continues past auto-merge after If (core-nodes)", async () => {
  const wf = workflow("wf.coreNodes.branchMergeContinuation")
    .name("core-nodes branch merge continuation")
    .manualTrigger("Trigger", [{ score: 42 }], "trigger")
    .then(new MapData<StressJson>("Ingest", (item) => pass(item, { stage: "ingested" } as StressJson), "ingest"))
    .if("Gate", (item) => Number((item as StressJson).score ?? 0) >= 40, {
      true: (b) =>
        b
          .then(new MapData<StressJson>("High lane: tag", (item) => pass(item, { lane: "high" } as StressJson), "B"))
          .then(new NoOp<StressJson>("High lane: checkpoint", "C")),
      false: (b) =>
        b
          .then(new MapData<StressJson>("Low lane: tag", (item) => pass(item, { lane: "low" } as StressJson), "D"))
          .then(
            new MapData<StressJson>("Low lane: enrich", (item) => pass(item, { enriched: true } as StressJson), "E"),
          )
          .then(new Wait<StressJson>("Low lane: short wait", 1, "F")),
    })
    .then(
      new Callback<StressJson>(
        "After merge",
        (items) =>
          items.map((item) => ({
            ...item,
            json: pass(item, { afterMerge: true } as StressJson),
          })),
        "after",
      ),
    )
    .build();

  const kit = RegistrarEngineTestKitFactory.create();
  await kit.start([wf]);

  const result = await kit.runToCompletion({ wf, startAt: "trigger", items: [] });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const out = result.outputs[0]?.json as StressJson;
  assert.equal(out.stage, "ingested");
  assert.equal(out.lane, "high");
  assert.equal(out.afterMerge, true);
  assert.equal(out.enriched, undefined);
});
