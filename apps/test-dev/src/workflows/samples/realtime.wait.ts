import { createWorkflowBuilder, ManualTrigger, MapData, Wait } from "@codemation/core-nodes";

type RealtimeWaitJson = Readonly<Record<string, unknown>>;

export default createWorkflowBuilder({ id: "wf.realtime.wait", name: "Realtime wait demo" })
  .trigger(new ManualTrigger<RealtimeWaitJson>("Manual trigger"))
  .then(new Wait<RealtimeWaitJson>("Wait 2 seconds", 2000, "wait.five.seconds"))
  .then(
    new MapData<RealtimeWaitJson, RealtimeWaitJson & { finished: true }>(
      "Finished",
      (item) => ({ ...item.json, finished: true }),
      "wait.finished",
    ),
  )
  .build();
