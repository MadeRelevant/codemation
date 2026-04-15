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

test("canvasLayoutStress first part: consecutive If diamonds execute taken path", async () => {
  const wf = workflow("wf.coreNodes.canvasLayoutStress.firstPart")
    .name("canvasLayoutStress first part (regression)")
    .manualTrigger("Stress trigger (manual)", [{ lane: "alpha", score: 42, region: "eu-west" }])
    .then(
      new MapData<StressJson>("Ingest payload", (item) => pass(item, { stage: "ingested", version: 1 } as StressJson)),
    )
    .if("Primary gate (score ≥ 40)?", (item, _ctx) => Number((item.json as StressJson).score ?? 0) >= 40, {
      true: (b) =>
        b
          .then(new MapData<StressJson>("High lane: tag", (item) => pass(item, { lane: "high" } as StressJson)))
          .then(new NoOp<StressJson>("High lane: checkpoint")),
      false: (b) =>
        b
          .then(new MapData<StressJson>("Low lane: tag", (item) => pass(item, { lane: "low" } as StressJson)))
          .then(new MapData<StressJson>("Low lane: enrich", (item) => pass(item, { enriched: true } as StressJson)))
          .then(new Wait<StressJson>("Low lane: short wait", 1)),
    })
    .if("Route by lane (high)?", (item, _ctx) => String((item.json as StressJson).lane ?? "") === "high", {
      true: (b) =>
        b
          .then(new MapData<StressJson>("High fork: branch A", (item) => pass(item, { fork: "A" } as StressJson)))
          .then(new NoOp<StressJson>("High fork: validate")),
      false: (b) =>
        b
          .then(new MapData<StressJson>("Low fork: branch B", (item) => pass(item, { fork: "B" } as StressJson)))
          .then(new Wait<StressJson>("Low fork: settle", 1)),
    })
    .then(
      new Callback<StressJson>("Terminal sink", (items) =>
        items.map((item) => ({
          ...item,
          json: pass(item, { done: true } as StressJson),
        })),
      ),
    )
    .build();

  const kit = RegistrarEngineTestKitFactory.create();
  await kit.start([wf]);

  const triggerId = wf.nodes.find((n) => n.kind === "trigger")?.id;
  assert.ok(triggerId);
  const result = await kit.runToCompletion({ wf, startAt: triggerId, items: [] });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  const out = result.outputs[0]?.json as StressJson;

  assert.equal(out.stage, "ingested");
  assert.equal(out.lane, "high");
  assert.equal(out.fork, "A");
  assert.equal(out.done, true);
  assert.equal(out.enriched, undefined);

  const stored = await kit.runStore.load(result.runId);
  assert.ok(stored);
  const completedNames = Object.values(stored.nodeSnapshotsByNodeId ?? {})
    .filter((s) => s.status === "completed")
    .map((s) => wf.nodes.find((n) => n.id === s.nodeId)?.name)
    .filter((n): n is string => typeof n === "string");

  assert.ok(completedNames.includes("High lane: tag"));
  assert.ok(completedNames.includes("High fork: branch A"));
  assert.ok(completedNames.includes("Terminal sink"));
});
