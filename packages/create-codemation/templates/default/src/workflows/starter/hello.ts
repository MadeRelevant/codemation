import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";

type SeedJson = Readonly<{ step: string }>;

export default createWorkflowBuilder({ id: "wf.starter.hello", name: "Starter Hello" })
  .trigger(new ManualTrigger<SeedJson>("Start", [{ json: { step: "start" } }]))
  .then(
    new MapData<SeedJson, SeedJson & { hello: boolean }>(
      "Hello",
      (item) => ({
        ...item.json,
        hello: true,
      }),
      "Hello",
    ),
  )
  .build();
