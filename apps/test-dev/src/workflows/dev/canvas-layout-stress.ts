import { Callback, createWorkflowBuilder, If, ManualTrigger, MapData, NoOp, Wait } from "@codemation/core-nodes";

/**
 * Large branching graph for exercising workflow canvas layout (Dagre + overlap pass).
 * Open in UI: /workflows/wf.dev.canvasLayoutStress
 */
type StressJson = Record<string, unknown>;

const pass = <T extends StressJson>(item: { json: unknown }, patch: T): StressJson => ({
  ...(typeof item.json === "object" && item.json !== null ? (item.json as StressJson) : {}),
  ...patch,
});

export default createWorkflowBuilder({
  id: "wf.dev.canvasLayoutStress",
  name: "Canvas layout stress (many branches)",
})
  .trigger(
    new ManualTrigger("Stress trigger (manual)", [
      { json: { runId: "layout-stress-1", lane: "alpha", score: 42, region: "eu-west" } },
    ]),
  )
  .then(
    new MapData<StressJson>("Ingest payload", (item) => pass(item, { stage: "ingested", version: 1 } as StressJson)),
  )
  .then(new If<StressJson>("Primary gate (score ≥ 40)?", (item) => Number((item.json as StressJson).score ?? 0) >= 40))
  .when({
    true: [
      new MapData<StressJson>("High lane: tag", (item) => pass(item, { lane: "high" } as StressJson)),
      new NoOp<StressJson>("High lane: checkpoint"),
    ],
    false: [
      new MapData<StressJson>("Low lane: tag", (item) => pass(item, { lane: "low" } as StressJson)),
      new MapData<StressJson>("Low lane: enrich", (item) => pass(item, { enriched: true } as StressJson)),
      new Wait<StressJson>("Low lane: short wait", 50),
    ],
  })
  .then(new If<StressJson>("Route by lane (high)?", (item) => String((item.json as StressJson).lane ?? "") === "high"))
  .when({
    true: [
      new MapData<StressJson>("High fork: branch A", (item) => pass(item, { fork: "A" } as StressJson)),
      new NoOp<StressJson>("High fork: validate"),
    ],
    false: [
      new MapData<StressJson>("Low fork: branch B", (item) => pass(item, { fork: "B" } as StressJson)),
      new MapData<StressJson>("Low fork: branch B2", (item) => pass(item, { fork: "B2" } as StressJson)),
      new Wait<StressJson>("Low fork: settle", 25),
    ],
  })
  .then(new If<StressJson>("Region EU?", (item) => String((item.json as StressJson).region ?? "").startsWith("eu")))
  .when({
    true: [
      new MapData<StressJson>("EU: compliance tag", (item) => pass(item, { compliance: "eu" } as StressJson)),
      new MapData<StressJson>("EU: audit note", (item) => pass(item, { audit: "queued" } as StressJson)),
      new NoOp<StressJson>("EU: noop"),
    ],
    false: [new MapData<StressJson>("Non-EU: tag", (item) => pass(item, { compliance: "other" } as StressJson))],
  })
  .then(
    new If<StressJson>("Asymmetric split (fork A)?", (item) => String((item.json as StressJson).fork ?? "") === "A"),
  )
  .when({
    true: [
      new MapData<StressJson>("A: step 1", (item) => pass(item, { path: "A1" } as StressJson)),
      new MapData<StressJson>("A: step 2", (item) => pass(item, { path: "A2" } as StressJson)),
      new NoOp<StressJson>("A: step 3"),
      new MapData<StressJson>("A: step 4", (item) => pass(item, { path: "A4" } as StressJson)),
    ],
    false: [
      new MapData<StressJson>("B-merge: shortcut", (item) => pass(item, { path: "B-short" } as StressJson)),
      new Wait<StressJson>("B-merge: wait", 15),
    ],
  })
  .then(
    new If<StressJson>(
      "Final dispatch (audit queued)?",
      (item) => String((item.json as StressJson).audit ?? "") === "queued",
    ),
  )
  .when({
    true: [
      new MapData<StressJson>("Dispatch: priority lane", (item) => pass(item, { dispatch: "priority" } as StressJson)),
      new NoOp<StressJson>("Dispatch: ack"),
    ],
    false: [
      new MapData<StressJson>("Dispatch: standard lane", (item) => pass(item, { dispatch: "standard" } as StressJson)),
      new MapData<StressJson>("Dispatch: batch id", (item) => pass(item, { batch: "b-9001" } as StressJson)),
      new MapData<StressJson>("Dispatch: stamp time", (item) => pass(item, { stamped: true } as StressJson)),
      new Wait<StressJson>("Dispatch: throttle", 10),
      new NoOp<StressJson>("Dispatch: ready"),
    ],
  })
  .then(
    new Callback<StressJson>("Terminal sink (layout only)", (items) =>
      items.map((item) => ({
        ...item,
        json: {
          ...(typeof item.json === "object" && item.json !== null ? (item.json as StressJson) : {}),
          done: true,
        },
      })),
    ),
  )
  .build();
