/**
 * Parent workflow that delegates per-item enrichment to the child sub-workflow at
 * `wf.subworkflow.demo.child`. Used to smoke-test:
 *
 * - SubWorkflow node icon (the `lucide:workflow` glyph)
 * - "Open subworkflow editor" link from the node properties panel
 * - "Open subworkflow run" deep-link from the execution inspector (parent run -> specific child run)
 * - inspectorSummary "Configuration" section on a SubWorkflow node (shows the workflow id)
 *
 * Trigger this manually; each input item fans out into its own child run.
 */
import { Callback, SubWorkflow } from "@codemation/core-nodes";
import { workflow } from "@codemation/host";

type EnrichInput = Readonly<{ name: string }>;
type EnrichOutput = Readonly<{ name: string; greeting: string; loudGreeting: string }>;

export default workflow("wf.subworkflow.demo.parent")
  .name("SubWorkflow demo — parent")
  .manualTrigger<EnrichInput>("Start", { name: "ada" })
  .then(new SubWorkflow<EnrichInput, EnrichOutput>("Enrich (subworkflow)", "wf.subworkflow.demo.child"))
  .then(
    new Callback<EnrichOutput, EnrichOutput & Readonly<{ summary: string }>>("Build summary", (items) =>
      items.map((item) => ({
        json: {
          ...item.json,
          summary: `${item.json.name} got: ${item.json.loudGreeting}`,
        },
      })),
    ),
  )
  .build();
