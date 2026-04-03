import { workflow } from "@codemation/host";

export default workflow("wf.starter.hello")
  .name("Starter Hello")
  .manualTrigger("Start", {
    step: "start",
  })
  .map("Hello", (item) => ({
    ...item,
    hello: true,
  }))
  .build();
