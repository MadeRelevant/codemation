import { Callback, createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.hot-reload-probe", name: "Hot reload probe" })
  .trigger(new ManualTrigger("Start", [{}]))
  .then(
    new Callback("Probe", (items) => {
      console.log("HOT_RELOAD_PROBE_MARKER:initial");
      return items;
    }),
  )
  .build();
