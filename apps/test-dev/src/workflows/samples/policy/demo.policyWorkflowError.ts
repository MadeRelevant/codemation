import type { WorkflowErrorHandler } from "@codemation/core";
import { NoRetryPolicy } from "@codemation/core";
import { workflow } from "@codemation/host";
import { Callback } from "@codemation/core-nodes";

type SeedJson = Readonly<{ label: string }>;

const workflowErrorHandler: WorkflowErrorHandler = {
  async onError(ctx) {
    void ctx.failedNodeId;
    void ctx.error.message;
  },
};

/**
 * Single attempt, always throws — workflow-level onError runs after the node is marked failed.
 */
class TerminalFailureCallback extends Callback<SeedJson, SeedJson> {
  readonly retryPolicy = new NoRetryPolicy();

  constructor() {
    super("Terminal failure (workflow onError)", async () => {
      throw new Error("Terminal failure for workflow onError demo");
    });
  }
}

const base = workflow("wf.samples.policy.demo.workflowError")
  .name("Demo: workflow onError (after retries)")
  .manualTrigger<SeedJson>("Manual trigger", [{ label: "workflow-error-demo" }])
  .then(new TerminalFailureCallback())
  .build();

export default {
  ...base,
  workflowErrorHandler,
};
