/**
 * Child workflow invoked by `wf.subworkflow.demo.parent` via `SubWorkflow`. Receives a name
 * per item and returns it together with a friendly + loud greeting.
 *
 * Used to smoke-test the SubWorkflow execution-history deep-link: each call from the parent
 * produces a child run; the parent run's inspector should link to the specific child runId.
 */
import { Callback } from "@codemation/core-nodes";
import { workflow } from "@codemation/host";

type ChildInput = Readonly<{ name: string }>;
type ChildOutput = Readonly<{ name: string; greeting: string; loudGreeting: string }>;

export default workflow("wf.subworkflow.demo.child")
  .name("SubWorkflow demo — child")
  .manualTrigger<ChildInput>("Start", { name: "ada" })
  .then(
    new Callback<ChildInput, ChildOutput>("Greet", (items) =>
      items.map((item) => {
        const name = item.json.name;
        const greeting = `Hello, ${name}`;
        return { json: { name, greeting, loudGreeting: greeting.toUpperCase() } };
      }),
    ),
  )
  .build();
