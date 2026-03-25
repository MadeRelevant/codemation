import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";

type SeedJson = Readonly<{ step: string }>;

export default createWorkflowBuilder({ id: "wf.minimal.hello", name: "Minimal Hello" })
  .trigger(new ManualTrigger<SeedJson>("Start", [{ json: { step: "start" } }]))
  .then(new MapData<SeedJson, SeedJson & { ok: boolean }>("Step", (item) => ({ ...item.json, ok: true }), "Step"))
  .build();
