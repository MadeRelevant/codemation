import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";

type SeedJson = Readonly<{ step: string }>;

export default createWorkflowBuilder({ id: "wf.e2e.ab", name: "E2E A to B" })
  .trigger(new ManualTrigger<SeedJson>("Start", [{ json: { step: "start" } }]))
  .then(
    new MapData<SeedJson, SeedJson & { a: boolean }>(
      "A",
      (item) => ({
        ...item.json,
        a: true,
      }),
      { id: "A" },
    ),
  )
  .then(
    new MapData<SeedJson & { a: boolean }, SeedJson & { a: boolean; b: boolean }>(
      "B",
      (item) => ({
        ...item.json,
        b: true,
      }),
      { id: "B" },
    ),
  )
  .build();
