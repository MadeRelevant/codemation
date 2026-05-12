import { createWorkflowBuilder, CronTrigger, MapData } from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.print-hello-every-minute", name: "Print Hello Every Minute" })
  .trigger(new CronTrigger("Every Minute", { schedule: "* * * * *" }))
  .then(
    new MapData("Log Hello", (item) => {
      // eslint-disable-next-line no-console
      console.log("hello", item.json);
      return item.json as Record<string, unknown>;
    }),
  )
  .build();
