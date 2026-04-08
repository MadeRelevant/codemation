import { workflow } from "@codemation/host";
import { Callback } from "@codemation/core-nodes";

export default workflow("wf.hot-reload-probe")
  .name("Hot reload probe")
  .manualTrigger("Start", [{}])
  .then(
    new Callback("Probe", (items) => {
      console.log("HOT_RELOAD_PROBE_MARKER:initial");
      return items;
    }),
  )
  .build();
