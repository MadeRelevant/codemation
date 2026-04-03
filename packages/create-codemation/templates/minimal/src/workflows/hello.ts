import { workflow } from "@codemation/host";

export default workflow("wf.minimal.hello")
  .name("Minimal Hello")
  .manualTrigger("Start", {
    step: "start",
  })
  .map("Step", (item) => ({ ...item, ok: true }))
  .build();
