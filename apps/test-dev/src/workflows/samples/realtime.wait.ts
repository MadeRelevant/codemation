import { workflow } from "@codemation/host";
import { MapData } from "@codemation/core-nodes";

type RealtimeWaitJson = Readonly<Record<string, unknown>>;

export default workflow("wf.realtime.wait")
  .name("Realtime wait demo")
  .manualTrigger<RealtimeWaitJson>("Manual trigger")
  .wait("Wait 2 seconds", 2000, "wait.five.seconds")
  .then(
    new MapData<RealtimeWaitJson, RealtimeWaitJson & { finished: true }>(
      "Finished",
      (item) => ({ ...item.json, finished: true }),
      { id: "wait.finished" },
    ),
  )
  .build();
