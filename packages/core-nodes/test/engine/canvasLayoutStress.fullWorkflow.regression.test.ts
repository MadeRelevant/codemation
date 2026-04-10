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

test("canvasLayoutStress: full workflow executes deep taken branches", async () => {
  const wf = workflow("wf.coreNodes.canvasLayoutStress.full")
    .name("canvasLayoutStress full (regression)")
    .manualTrigger("Stress trigger (manual)", [{ lane: "alpha", score: 42, region: "eu-west" }])
    .then(
      new MapData<StressJson>("Ingest payload", (item) => pass(item, { stage: "ingested", version: 1 } as StressJson)),
    )
    .if("Primary gate (score ≥ 40)?", (item) => Number((item as StressJson).score ?? 0) >= 40, {
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
    .if("Route by lane (high)?", (item) => String((item as StressJson).lane ?? "") === "high", {
      true: (b) =>
        b
          .then(new MapData<StressJson>("High fork: branch A", (item) => pass(item, { fork: "A" } as StressJson)))
          .then(new NoOp<StressJson>("High fork: validate")),
      false: (b) =>
        b
          .then(new MapData<StressJson>("Low fork: branch B", (item) => pass(item, { fork: "B" } as StressJson)))
          .then(new MapData<StressJson>("Low fork: branch B2", (item) => pass(item, { fork: "B2" } as StressJson)))
          .then(new Wait<StressJson>("Low fork: settle", 1)),
    })
    .if("Region EU?", (item) => String((item as StressJson).region ?? "").startsWith("eu"), {
      true: (b) =>
        b
          .then(new MapData<StressJson>("EU: compliance tag", (item) => pass(item, { compliance: "eu" } as StressJson)))
          .then(new MapData<StressJson>("EU: audit note", (item) => pass(item, { audit: "queued" } as StressJson)))
          .then(new NoOp<StressJson>("EU: noop")),
      false: (b) =>
        b.then(new MapData<StressJson>("Non-EU: tag", (item) => pass(item, { compliance: "other" } as StressJson))),
    })
    .if("Asymmetric split (fork A)?", (item) => String((item as StressJson).fork ?? "") === "A", {
      true: (b) =>
        b
          .then(new MapData<StressJson>("A: step 1", (item) => pass(item, { path: "A1" } as StressJson)))
          .then(new MapData<StressJson>("A: step 2", (item) => pass(item, { path: "A2" } as StressJson)))
          .then(new NoOp<StressJson>("A: step 3"))
          .then(new MapData<StressJson>("A: step 4", (item) => pass(item, { path: "A4" } as StressJson))),
      false: (b) =>
        b
          .then(new MapData<StressJson>("B-merge: shortcut", (item) => pass(item, { path: "B-short" } as StressJson)))
          .then(new Wait<StressJson>("B-merge: wait", 1)),
    })
    .if("Final dispatch (audit queued)?", (item) => String((item as StressJson).audit ?? "") === "queued", {
      true: (b) =>
        b
          .then(
            new MapData<StressJson>("Dispatch: priority lane", (item) =>
              pass(item, { dispatch: "priority" } as StressJson),
            ),
          )
          .then(new NoOp<StressJson>("Dispatch: ack")),
      false: (b) =>
        b
          .then(
            new MapData<StressJson>("Dispatch: standard lane", (item) =>
              pass(item, { dispatch: "standard" } as StressJson),
            ),
          )
          .then(new MapData<StressJson>("Dispatch: batch id", (item) => pass(item, { batch: "b-9001" } as StressJson)))
          .then(new MapData<StressJson>("Dispatch: stamp time", (item) => pass(item, { stamped: true } as StressJson)))
          .then(new Wait<StressJson>("Dispatch: throttle", 1))
          .then(new NoOp<StressJson>("Dispatch: ready")),
    })
    .then(
      new Callback<StressJson>("Terminal sink (layout only)", (items) =>
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
  assert.equal(out.compliance, "eu");
  assert.equal(out.audit, "queued");
  assert.equal(out.path, "A4");
  assert.equal(out.dispatch, "priority");
  assert.equal(out.done, true);
});
