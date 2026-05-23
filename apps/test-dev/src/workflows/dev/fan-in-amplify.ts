import { workflow } from "@codemation/host";
import { Callback, NoOp, Wait } from "@codemation/core-nodes";

/**
 * Fan-in diagnostic workflow.
 *
 * Topology:
 *   manual-trigger
 *     └─ if "always-true"
 *          true: Wait(200ms) ─┐
 *          false: (none)       │
 *                             fan-in (NoOp)
 *                              └─ sink (Callback)
 *
 * The fan-in node receives activations from both the if-node's
 * emit-on-false path and the true-branch terminal.  The delay on the
 * true branch ensures the two activations are separated in time, making
 * the render ordering observable via console logs.
 *
 * Open in UI: /workflows/wf.dev.fanInAmplify
 */
export default workflow("wf.dev.fanInAmplify")
  .name("Fan-in amplify (render ordering diagnostic)")
  .manualTrigger("Manual trigger", [{ id: "test-item-1" }])
  .if("always-true?", (_item, _ctx) => true, {
    true: (b) => b.then(new Wait("delay-before-fanin", 200)),
  })
  .then(new NoOp("fan-in"))
  .then(new Callback("sink", (items) => items))
  .build();
