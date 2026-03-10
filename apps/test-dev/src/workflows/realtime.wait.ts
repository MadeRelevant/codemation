import { createWorkflowBuilder, ManualTrigger, Wait, MapData } from "@codemation/core-nodes"

export default createWorkflowBuilder({ id: "wf.realtime.wait", name: "Realtime wait demo" })
.trigger(new ManualTrigger("Manual trigger"))
.then(new Wait("Wait 2 seconds", 2000, "wait.five.seconds"))
.then(new MapData("Finished", (item) => ({ ...((item.json as Record<string, unknown>) ?? {}), finished: true }), "wait.finished"))
.build()